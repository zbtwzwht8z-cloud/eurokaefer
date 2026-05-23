#!/usr/bin/env python3
"""Chain-search algorithm for €1 relocations.

Reads data/movacar_offers.csv and produces data/roadtrip_options.csv with:
- General chains (3000-cap)
- Loops home → ... → home for each home city
- Home → ICE-connected German city chains (≤3 legs)
- Home → Italy / Spain / Austria / Alps chains (≤2 legs)

Critical bugfix preserved from v1: Movacar period_hours is a DEADLINE, not a
minimum hold. The next leg can start MIN_GAP after the current pickup, not
after the full period expires. Without this, ~95% of valid loops vanish.
"""
from __future__ import annotations
import csv
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
OFFERS_PATH = DATA_DIR / 'movacar_offers.csv'
OUT_PATH = DATA_DIR / 'roadtrip_options.csv'

BERLIN = ZoneInfo('Europe/Berlin') if ZoneInfo else timezone(timedelta(hours=2), 'Europe/Berlin')

# 90-day forward search window from "today"
TODAY = datetime.now(BERLIN).replace(hour=0, minute=0, second=0, microsecond=0)
WINDOW_START = TODAY
WINDOW_END = TODAY + timedelta(days=90)

MIN_DAYS = 0.5
MAX_DAYS = 14
MAX_LEGS = 6
STEP = timedelta(hours=12)
MAX_OPTIONS = 3000

# Movacar period_hours is a deadline. You can return early and start the next
# leg ~1 day later. THIS IS THE FIX that unlocked 54 NRW loops from 2.
MIN_GAP = timedelta(days=1)

# ── Home city sets ────────────────────────────────────────────────────────────
# Each set is a collection of origin LOCATION NAMES that "belong" to a friend's
# home city. Used both as origin filters and as loop terminals.

HOME_SETS_NAMES: dict[str, set[str]] = {
    'Bochum': {
        'Bochum', 'Essen', 'Dormagen', 'Bielefeld', 'Bonn', 'Duisburg',
        'Dortmund', 'Düsseldorf', 'Köln', 'Cologne', 'Münster', 'Aachen',
    },
    'Hannover': {'Hannover', 'Laatzen', 'Weyhe'},
    'München':  {'München', 'Munich', 'Berglern', 'Augsburg', 'Gersthofen'},
}

# Destination zones — used for targeted searches
ICE_NAMES = {
    'Berlin', 'Hamburg', 'München', 'Munich', 'Frankfurt am Main',
    'Stuttgart', 'Nürnberg', 'Leipzig', 'Dresden', 'Hannover',
    'Mainz', 'Erfurt', 'Marburg', 'Kassel',
}

SOUTH_NAMES = {
    # Italy
    'Milan', 'Milan / Castellanza', 'Bergamo', 'Bologna', 'Florence',
    'Roma', 'Turin', 'Venezia', 'Napoli', 'Genova', 'Palermo',
    # Spain + Portugal
    'Barcelona', 'Viladecans', 'Madrid', 'Sevilla', 'Bilbao', 'Zamudio',
    'A Coruña', 'Valencia', 'Porto', 'Lisbon',
    # Austria + Slovenia + Croatia
    'Wiener Neudorf', 'Wien', 'Vienna', 'Salzburg', 'Graz', 'Hörsching',
    'Wiesing', 'Innsbruck', 'Ljubljana', 'Zagreb', 'Split', 'Dubrovnik',
    # Switzerland
    'Zürich', 'Basel', 'Geneva', 'Bern',
    # Southern Germany
    'Stuttgart', 'Nürnberg', 'Augsburg', 'Gersthofen', 'Würzburg',
    'Regensburg', 'Heidelberg', 'Karlsruhe', 'Sinsheim', 'Freiburg',
    'Konstanz', 'Friedrichshafen', 'Wangen', 'Aach', 'Ihringen',
    'Korntal-Münchingen', 'Ettlingenweier', 'Neu-Ulm',
    # Southern France
    'Cabriès', 'Gattières', 'Saint-Laurent-du-Var', 'Saint-Jean-de-Gonville',
    'Dagneux', 'Marseille', 'Nice', 'Montpellier', 'Nîmes', 'Avignon',
    'Aix-en-Provence', 'Toulouse', 'Mérignac',
}

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class Option:
    path: list[dict[str, str]]
    intervals: list[tuple[datetime, datetime]]
    appointment: str
    score: float


def parse_dt(s: str) -> datetime | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return dt.astimezone(BERLIN) if dt.tzinfo else dt.replace(tzinfo=BERLIN)
    except ValueError:
        return None


def read_offers() -> list[dict[str, str]]:
    with OFFERS_PATH.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def offer_window(row: dict[str, str]) -> tuple[datetime, datetime, timedelta] | None:
    start = parse_dt(row.get('start_date_utc', ''))
    end = parse_dt(row.get('end_date_utc', ''))
    if not start or not end:
        return None
    hours = int(float(row.get('period_hours') or 72))
    duration = timedelta(hours=hours)
    return start, end, duration


def can_follow(a: dict[str, str], b: dict[str, str]) -> bool:
    if a['destination_location_id'] != b['origin_location_id']:
        return False
    a_w = offer_window(a)
    b_w = offer_window(b)
    if not a_w or not b_w:
        return False
    a_start, _, _ = a_w
    _, b_end, _ = b_w
    # With early-return logic, can hand off after MIN_GAP, not full period.
    return a_start + MIN_GAP <= b_end


def candidate_times(row: dict[str, str], earliest: datetime, is_last: bool) -> list[datetime]:
    w = offer_window(row)
    if not w:
        return []
    start, end, duration = w
    low = max(start, earliest, WINDOW_START)
    high = min(end, WINDOW_END - duration if is_last else WINDOW_END)
    if low > high:
        return []
    values: set[datetime] = {low, high}
    cursor = low
    while cursor <= high:
        values.add(cursor)
        cursor += STEP
    return sorted(values)


def schedule_path(path: list[dict[str, str]]) -> tuple[list[tuple[datetime, datetime]], str] | None:
    best: tuple[float, list[tuple[datetime, datetime]], str] | None = None

    def walk(index: int, earliest: datetime, intervals: list[tuple[datetime, datetime]]) -> None:
        nonlocal best
        if best and best[0] == 0:
            return
        if index == len(path):
            days = (intervals[-1][1] - intervals[0][0]).total_seconds() / 86400
            if not (MIN_DAYS <= days <= MAX_DAYS):
                return
            origin = path[0]['origin_name']
            dest = path[-1]['destination_name']
            trip_start = intervals[0][0].strftime('%d %b')
            trip_end = intervals[-1][1].strftime('%d %b')
            status = f'{trip_start} – {trip_end} · {origin} → {dest}'
            target_penalty = abs(days - 5.0)
            if best is None or target_penalty < best[0]:
                best = (target_penalty, list(intervals), status)
            return

        w = offer_window(path[index])
        if not w:
            return
        _, _, duration = w
        is_last = index == len(path) - 1
        for pickup in candidate_times(path[index], earliest, is_last):
            dropoff = pickup + duration
            if dropoff > WINDOW_END:
                continue
            if intervals:
                days_so_far = (dropoff - intervals[0][0]).total_seconds() / 86400
                if days_so_far > MAX_DAYS:
                    continue
            # KEY: next leg's earliest pickup = THIS leg's pickup + MIN_GAP.
            next_earliest = pickup + MIN_GAP
            walk(index + 1, next_earliest, intervals + [(pickup, dropoff)])

    walk(0, WINDOW_START, [])
    if not best:
        return None
    _, intervals, status = best
    return intervals, status


def score_path(path: list[dict[str, str]], intervals: list[tuple[datetime, datetime]], _appointment: str) -> float:
    """Higher is better. Rewards good road-trips, penalises painful pace.

    Components:
    - base 100
    - legs: +8 per leg (cap +30) — more legs = more adventure, but diminishing returns
    - distance: +km/200 (cap +40)
    - south bonus: +20 if any destination is in SOUTH_NAMES
    - loop bonus: +10 if start == end home zone (loops are rarer / more useful)
    - 1-leg baseline: +15 so clean one-ways compete with longer chains
    - days target: -2 * |days - 5| (deviation from 5-day sweet-spot)
    - pace penalty: -5 * max(0, km/day - 350) (350 km/day is sustainable; 600+ km/day is brutal)
    """
    score = 100.0

    # Leg count
    if len(path) == 1:
        score += 15  # clean one-way baseline so they don't get buried
    else:
        score += min(len(path) * 8, 30)

    # Distance
    distance_km = sum(float(p.get('distance_km') or 0) for p in path)
    score += min(distance_km / 200, 40)

    # South / Mediterranean draw
    if any(p['destination_name'] in SOUTH_NAMES for p in path):
        score += 20

    # Loops are more useful than one-ways (return you home)
    origin = path[0]['origin_name']
    dest = path[-1]['destination_name']
    for names in HOME_SETS_NAMES.values():
        if origin in names and dest in names:
            score += 10
            break

    # Trip duration: target 5 days
    days = (intervals[-1][1] - intervals[0][0]).total_seconds() / 86400
    days = max(days, 0.5)
    score -= abs(days - 5.0) * 2

    # Pace: penalise brutal km/day. 350 = fine, 600+ = painful.
    km_per_day = distance_km / days
    if km_per_day > 350:
        score -= 5 * (km_per_day - 350) / 50  # 400 = -1, 500 = -3, 600 = -5 etc.

    return score


def _try_save(options: list[Option], seen: set[tuple[str, ...]],
              path: list[dict[str, str]], max_options: int) -> None:
    if len(options) >= max_options:
        return
    key = tuple(row['offer_id'] for row in path)
    if key in seen:
        return
    seen.add(key)
    scheduled = schedule_path(path)
    if scheduled:
        intervals, appointment = scheduled
        options.append(Option(path, intervals, appointment, score_path(path, intervals, appointment)))


def search_general(offers: list[dict[str, str]]) -> list[Option]:
    """3000-cap exhaustive search from all origins."""
    by_origin: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in offers:
        by_origin[row['origin_location_id']].append(row)

    options: list[Option] = []
    seen: set[tuple[str, ...]] = set()

    def walk(path: list[dict[str, str]], visited_dests: set[str]) -> None:
        if len(options) >= MAX_OPTIONS:
            return
        last = path[-1]
        # Save at every length (1-leg one-ways are valid trips)
        _try_save(options, seen, path, MAX_OPTIONS)
        if len(path) >= MAX_LEGS:
            return
        for nxt in by_origin.get(last['destination_location_id'], []):
            if nxt['offer_id'] in {row['offer_id'] for row in path}:
                continue
            if nxt['destination_location_id'] in visited_dests:
                continue
            if can_follow(last, nxt):
                walk(path + [nxt], visited_dests | {nxt['destination_location_id']})

    for offer in offers:
        if len(options) >= MAX_OPTIONS:
            break
        walk([offer], {offer['origin_location_id'], offer['destination_location_id']})

    options.sort(key=lambda o: o.score, reverse=True)
    return options


def search_home_loops(offers: list[dict[str, str]], home_names: set[str]) -> list[Option]:
    """home → ... → home loops."""
    by_origin: dict[str, list[dict[str, str]]] = defaultdict(list)
    home_ids: set[str] = set()
    for row in offers:
        by_origin[row['origin_location_id']].append(row)
        if row['origin_name'] in home_names:
            home_ids.add(row['origin_location_id'])

    options: list[Option] = []
    seen: set[tuple[str, ...]] = set()
    home_starts = [o for o in offers if o['origin_name'] in home_names]

    def walk_loop(path: list[dict[str, str]], visited_non_home: set[str]) -> None:
        if len(options) >= 500:
            return
        last = path[-1]
        if len(path) >= MAX_LEGS:
            return
        for nxt in by_origin.get(last['destination_location_id'], []):
            if nxt['offer_id'] in {row['offer_id'] for row in path}:
                continue
            if not can_follow(last, nxt):
                continue
            if nxt['destination_name'] in home_names:
                _try_save(options, seen, path + [nxt], 500)
            elif nxt['destination_location_id'] not in visited_non_home:
                walk_loop(path + [nxt], visited_non_home | {nxt['destination_location_id']})

    for offer in home_starts:
        if offer['destination_name'] in home_names:
            _try_save(options, seen, [offer], 500)  # direct home→home
        else:
            walk_loop([offer], {offer['destination_location_id']})

    options.sort(key=lambda o: o.score, reverse=True)
    return options


def search_home_targets(
    offers: list[dict[str, str]],
    home_names: set[str],
    target_names: set[str],
    max_legs: int,
) -> list[Option]:
    """home → ... → target (one-way). Used for ICE and South searches."""
    by_origin: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in offers:
        by_origin[row['origin_location_id']].append(row)

    options: list[Option] = []
    seen: set[tuple[str, ...]] = set()
    home_starts = [o for o in offers if o['origin_name'] in home_names]

    def walk(path: list[dict[str, str]], visited: set[str]) -> None:
        last = path[-1]
        if last['destination_name'] in target_names:
            _try_save(options, seen, path, 500)
            return
        if len(path) >= max_legs:
            return
        for nxt in by_origin.get(last['destination_location_id'], []):
            if nxt['offer_id'] in {row['offer_id'] for row in path}:
                continue
            if nxt['destination_location_id'] in visited:
                continue
            if can_follow(last, nxt):
                walk(path + [nxt], visited | {nxt['destination_location_id']})

    for offer in home_starts:
        if offer['destination_name'] in target_names:
            _try_save(options, seen, [offer], 500)
        else:
            walk([offer], {offer['origin_location_id'], offer['destination_location_id']})

    options.sort(key=lambda o: o.score, reverse=True)
    return options


def classify(path: list[dict[str, str]]) -> tuple[str, str | None]:
    """Return (chain_type, home_city)."""
    origin = path[0]['origin_name']
    dest = path[-1]['destination_name']
    origin_home = next((hc for hc, names in HOME_SETS_NAMES.items() if origin in names), None)
    dest_home = next((hc for hc, names in HOME_SETS_NAMES.items() if dest in names), None)
    if origin_home and dest_home and origin_home == dest_home:
        return 'loop', origin_home
    if origin_home:
        return 'oneway', origin_home
    if dest_home:
        return 'inbound', dest_home
    return 'oneway', None


def emit_csv(all_options: list[Option]) -> None:
    fields = [
        'score', 'route', 'legs', 'start', 'end', 'days', 'appointment',
        'chain_type', 'home_city', 'route_km', 'included_km', 'spare_km',
        'countries_hint', 'planned_pickups', 'planned_dropoffs',
        'offer_ids', 'vehicles',
    ]
    with OUT_PATH.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for opt in all_options:
            path = opt.path
            intervals = opt.intervals
            chain_type, home_city = classify(path)
            cities = [path[0]['origin_name']] + [p['destination_name'] for p in path]
            route_km = sum(float(p.get('distance_km') or 0) for p in path)
            included_km = sum(float(p.get('free_km') or 0) for p in path)
            days = (intervals[-1][1] - intervals[0][0]).total_seconds() / 86400
            writer.writerow({
                'score': f'{opt.score:.1f}',
                'route': ' -> '.join(cities),
                'legs': len(path),
                'start': intervals[0][0].isoformat(),
                'end': intervals[-1][1].isoformat(),
                'days': f'{days:.1f}',
                'appointment': opt.appointment,
                'chain_type': chain_type,
                'home_city': home_city or '',
                'route_km': f'{route_km:.0f}',
                'included_km': f'{included_km:.0f}',
                'spare_km': f'{included_km - route_km:.0f}',
                'countries_hint': '',  # filled in build.py
                'planned_pickups': ' -> '.join(i[0].isoformat() for i in intervals),
                'planned_dropoffs': ' -> '.join(i[1].isoformat() for i in intervals),
                'offer_ids': ' -> '.join(p['offer_id'] for p in path),
                'vehicles': ' | '.join(
                    (p.get('make') or '') + ' ' + (p.get('model') or '') for p in path
                ),
            })


def main() -> None:
    if not OFFERS_PATH.exists():
        print(f'ERROR: {OFFERS_PATH} not found. Run fetch.py first.', file=sys.stderr)
        sys.exit(1)
    offers = read_offers()
    print(f'→ Read {len(offers)} offers from {OFFERS_PATH.name}')

    general = search_general(offers)
    print(f'  general: {len(general)} chains')

    all_options: list[Option] = list(general)
    seen_keys = {tuple(r['offer_id'] for r in o.path) for o in general}

    for home_city, names in HOME_SETS_NAMES.items():
        loops = search_home_loops(offers, names)
        ice = search_home_targets(offers, names, ICE_NAMES, max_legs=3)
        south = search_home_targets(offers, names, SOUTH_NAMES, max_legs=2)
        added = 0
        for opt in loops + ice + south:
            key = tuple(r['offer_id'] for r in opt.path)
            if key not in seen_keys:
                seen_keys.add(key)
                all_options.append(opt)
                added += 1
        print(f'  {home_city}: loops={len(loops)} ice={len(ice)} south={len(south)} (+{added} new)')

    # Deduplicate by route string — keep highest-scored chain per unique route.
    # Without this, 7 identical Nantes→Madrid offers produce 7 identical chains.
    seen_routes: dict[str, Option] = {}
    for opt in sorted(all_options, key=lambda o: o.score, reverse=True):
        route_key = ' -> '.join(
            [opt.path[0]['origin_name']] + [p['destination_name'] for p in opt.path]
        )
        if route_key not in seen_routes:
            seen_routes[route_key] = opt
    all_options = list(seen_routes.values())
    all_options.sort(key=lambda o: o.score, reverse=True)

    # Diversity cap: keep at most 5 chains per (home_city, destination_country_hint)
    # so the top of the list isn't dominated by 8 variants of the same Munich→Italy trip.
    # We approximate "destination country" by the destination station name; chains
    # ending at the same city are limited by route-dedup already.
    from_dest_count: dict[tuple[str, str], int] = {}
    diverse: list[Option] = []
    for opt in all_options:
        ct, hc = classify(opt.path)
        dest = opt.path[-1]['destination_name']
        bucket = (hc or '_general', dest)
        if from_dest_count.get(bucket, 0) >= 5:
            continue
        from_dest_count[bucket] = from_dest_count.get(bucket, 0) + 1
        diverse.append(opt)
    all_options = diverse

    emit_csv(all_options)
    print(f'✓ {len(all_options)} unique-route chains written to {OUT_PATH}')


if __name__ == '__main__':
    main()
