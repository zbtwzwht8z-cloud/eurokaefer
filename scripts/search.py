#!/usr/bin/env python3
"""Chain-search v2: unified DFS, variant grouping, loop tagging.

Single pass: from every offer, DFS up to MAX_LEGS deep, save every valid
sub-path. Group by route string; each route becomes one canonical chain
with all date variants listed.

Definitions:
- A path is a "loop" iff route[0] and route[-1] are either the same city
  or both belong to the same HOME_CLUSTER (see below).
- A path has a "home_origin" iff route[0] is in some HOME_CLUSTER.

Critical invariants:
- Within a path, no city appears twice EXCEPT route[0] may also be route[-1]
  (loop close). When a loop closes, we don't extend further.
- Movacar's `period_hours` is a deadline, not a minimum hold — next leg's
  pickup can be MIN_GAP after this leg's pickup (not full period). Without
  this, ~95% of valid loops vanish.

No bucket cap, no per-route dedup beyond variant grouping. The UI is the
filter, not the search.
"""
from __future__ import annotations
import csv
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
OFFERS_PATH = DATA_DIR / 'movacar_offers.csv'
OUT_PATH = DATA_DIR / 'roadtrip_options.csv'

BERLIN = ZoneInfo('Europe/Berlin') if ZoneInfo else timezone(timedelta(hours=2))

TODAY = datetime.now(BERLIN).replace(hour=0, minute=0, second=0, microsecond=0)
WINDOW_START = TODAY
WINDOW_END = TODAY + timedelta(days=90)

MIN_DAYS = 0.5
MAX_DAYS = 14
MAX_LEGS = 6
STEP = timedelta(hours=12)
MIN_GAP = timedelta(days=1)

# Safety cap so a pathological dense graph doesn't OOM. 50k is plenty;
# real Movacar windows produce <10k before variant grouping.
MAX_RAW_OPTIONS = 50_000

# Same-area cap: cities further than this are NEVER in the same area.
SAME_AREA_KM = 80.0

# Loop tiers. A loop's "tightness" is the great-circle distance between
# the chain's start city and end city.
PERFECT_LOOP_KM = 15.0    # ≤15km → perfect (essentially same city)
IMPERFECT_LOOP_KM = 100.0 # >15km, ≤100km → imperfect loop. Beyond → not a loop.

# Cluster centers for "home origin" tagging. A chain whose start city is
# within SAME_AREA_KM of one of these centers gets that center's name as
# its `home_origin`. Replaces the old manual HOME_CLUSTERS lists.
HOME_CENTERS: list[str] = ['Bochum', 'Hannover', 'München', 'Marburg']

# Coords for every city we expect to see. Mirrors src/lib/constants.ts
# CITY_COORDS — keep in sync when adding new cities.
CITY_COORDS: dict[str, tuple[float, float]] = {
    # Germany
    'Bochum': (51.4818, 7.2197), 'Essen': (51.4556, 7.0116),
    'Dormagen': (51.0931, 6.8417), 'Bielefeld': (52.0302, 8.5325),
    'Bonn': (50.7374, 7.0982), 'Duisburg': (51.4344, 6.7623),
    'Dortmund': (51.5136, 7.4653), 'Düsseldorf': (51.2277, 6.7735),
    'Köln': (50.9375, 6.9603), 'Cologne': (50.9375, 6.9603),
    'Münster': (51.9607, 7.6261), 'Aachen': (50.7753, 6.0839),
    'Berlin': (52.52, 13.405), 'Hamburg': (53.5511, 9.9937),
    'Frankfurt am Main': (50.1109, 8.6821), 'München': (48.1351, 11.582),
    'Munich': (48.1351, 11.582), 'Stuttgart': (48.7758, 9.1829),
    'Leipzig': (51.3397, 12.3731), 'Dresden': (51.0504, 13.7373),
    'Erfurt': (50.9848, 11.0299), 'Mainz': (49.9929, 8.2473),
    'Marburg': (50.8021, 8.7666), 'Kassel': (51.3127, 9.4797),
    'Nürnberg': (49.4521, 11.0767), 'Regensburg': (49.0134, 12.1016),
    'Trier': (49.7596, 6.6441), 'Kiel': (54.3233, 10.1228),
    'Flensburg': (54.7836, 9.4321), 'Weyhe': (52.9763, 8.8508),
    'Laatzen': (52.3175, 9.7967), 'Augsburg': (48.3705, 10.8978),
    'Berglern': (48.354, 11.787),
    'Berglern / Munich Airport': (48.3537, 11.7866),
    'Heidelberg': (49.3988, 8.6724), 'Hannover': (52.3759, 9.732),
    'Bremen': (53.0793, 8.8017), 'Würzburg': (49.7913, 9.9534),
    'Aach': (47.845, 8.851), 'Gersthofen': (48.425, 10.884),
    'Rosenheim': (47.856, 12.128),
    # France
    'Paris': (48.8566, 2.3522), 'Paris CDG': (49.0097, 2.5479),
    'Nantes': (47.2184, -1.5536), 'Champlan': (48.7197, 2.27),
    'Mérignac': (44.8333, -0.6444), 'Lille': (50.6292, 3.0573),
    'Strasbourg': (48.5734, 7.7521), 'Cabriès': (43.4444, 5.3691),
    'Saint-Jean-de-Gonville': (46.2575, 5.9722),
    'Goussainville': (49.0286, 2.4628), 'Grigny': (48.659, 2.388),
    'Saint-Mesmes': (48.954, 2.874), 'Dagneux': (45.8328, 5.07),
    'Marseille': (43.2965, 5.3698), 'Nice': (43.7102, 7.262),
    'Lyon': (45.764, 4.8357), 'Bordeaux': (44.8378, -0.5792),
    'Toulouse': (43.6047, 1.4442),
    # Italy
    'Milan': (45.4642, 9.19), 'Milan / Castellanza': (45.6086, 8.8978),
    'Castellanza': (45.6086, 8.8978), 'Bergamo': (45.6983, 9.6773),
    'Bologna': (44.4949, 11.3426), 'Florence': (43.7696, 11.2558),
    'Roma': (41.9028, 12.4964), 'Turin': (45.0703, 7.6869),
    'Venezia': (45.4408, 12.3155), 'Napoli': (40.8518, 14.2681),
    'Genova': (44.4056, 8.9463), 'Cagliari': (39.224, 9.122),
    'Olbia': (40.923, 9.503), 'Bastia': (42.701, 9.450),
    # Spain / Portugal
    'Barcelona': (41.3851, 2.1734), 'Madrid': (40.4168, -3.7038),
    'Sevilla': (37.3886, -5.9823), 'Bilbao': (43.263, -2.935),
    'Valencia': (39.4699, -0.3763), 'Porto': (41.1579, -8.6291),
    'Lisbon': (38.7223, -9.1393),
    # Austria
    'Wien': (48.2082, 16.3738), 'Vienna': (48.2082, 16.3738),
    'Salzburg': (47.8095, 13.055), 'Graz': (47.0707, 15.4395),
    'Innsbruck': (47.2692, 11.4041),
    # Benelux
    'Sint-Pieters-Leeuw': (50.7833, 4.25), 'Aartselaar': (51.1333, 4.3833),
    'Amstelveen': (52.308, 4.861), 'Amsterdam': (52.3676, 4.9041),
    'Rotterdam': (51.9244, 4.4777),
    # Scandinavia + other
    'Göteborgs Stad': (57.7089, 11.9746),
    'Staffanstorps kommun': (55.6422, 13.21),
    'Stockholm': (59.3293, 18.0686), 'Warszawa': (52.230, 21.012),
    'Zürich': (47.3769, 8.5417),
}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    R = 6371.0
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def distance_km(city_a: str, city_b: str) -> float | None:
    """Great-circle distance, or None if either city's coords are unknown."""
    a, b = CITY_COORDS.get(city_a), CITY_COORDS.get(city_b)
    if not a or not b:
        return None
    return haversine_km(a, b)


def normalize_city(name: str) -> str:
    """Identity for now. Kept as a hook in case we add language-variant
    aliases (e.g. Munich↔München) that aren't reflected in coords. With
    distance-based matching, most aliasing is unnecessary."""
    if name == 'Munich': return 'München'
    if name == 'Cologne': return 'Köln'
    if name == 'Vienna': return 'Wien'
    return name


def home_origin_of(city: str) -> str | None:
    """Return the nearest HOME_CENTERS city within SAME_AREA_KM, or None."""
    nc = normalize_city(city)
    best: tuple[str, float] | None = None
    for center in HOME_CENTERS:
        d = distance_km(nc, center)
        if d is not None and d <= SAME_AREA_KM:
            if best is None or d < best[1]:
                best = (center, d)
    return best[0] if best else None


def loop_tier(start_city: str, end_city: str) -> str | None:
    """'perfect' if start/end within PERFECT_LOOP_KM, 'imperfect' if within
    IMPERFECT_LOOP_KM, None otherwise (not a loop)."""
    sa, sb = normalize_city(start_city), normalize_city(end_city)
    if sa == sb:
        return 'perfect'
    d = distance_km(sa, sb)
    if d is None:
        return None
    if d <= PERFECT_LOOP_KM:
        return 'perfect'
    if d <= IMPERFECT_LOOP_KM:
        return 'imperfect'
    return None

# Scoring bonus pool — destinations that count as "south draw"
SOUTH_NAMES = {
    'Milan', 'Milan / Castellanza', 'Bergamo', 'Bologna', 'Florence', 'Roma',
    'Turin', 'Venezia', 'Napoli', 'Genova', 'Palermo',
    'Barcelona', 'Viladecans', 'Madrid', 'Sevilla', 'Bilbao', 'Zamudio',
    'A Coruña', 'Valencia', 'Porto', 'Lisbon',
    'Wiener Neudorf', 'Wien', 'Vienna', 'Salzburg', 'Graz', 'Hörsching',
    'Wiesing', 'Innsbruck',
    'Zürich', 'Basel', 'Geneva', 'Bern',
    'Cabriès', 'Marseille', 'Nice', 'Montpellier', 'Nîmes', 'Avignon',
    'Aix-en-Provence', 'Toulouse',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

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
    return start, end, timedelta(hours=hours)


def same_area(city_a: str, city_b: str) -> bool:
    """Two cities are in the same area iff they're the same canonical name
    OR within SAME_AREA_KM by great-circle distance. The km cap is the
    hard rule — cities further than that are NEVER the same area, even if
    they were historically grouped into the same 'cluster'."""
    na, nb = normalize_city(city_a), normalize_city(city_b)
    if na == nb:
        return True
    d = distance_km(na, nb)
    return d is not None and d <= SAME_AREA_KM


def can_follow(a: dict[str, str], b: dict[str, str]) -> bool:
    """A chain link is valid iff a's drop-off and b's pickup are in the
    same area (≤SAME_AREA_KM) AND b's window can still accept a pickup
    ≥ MIN_GAP after a's pickup."""
    if not same_area(a['destination_name'], b['origin_name']):
        return False
    a_w, b_w = offer_window(a), offer_window(b)
    if not a_w or not b_w:
        return False
    a_start, _, _ = a_w
    _, b_end, _ = b_w
    return a_start + MIN_GAP <= b_end


# ── Scheduling: pick best pickup combination for a path ──────────────────────

def schedule_path(path: list[dict[str, str]]) -> tuple[list[tuple[datetime, datetime]], str] | None:
    """Find the (intervals, status) combo that minimizes |days - 5|."""
    best: tuple[float, list[tuple[datetime, datetime]], str] | None = None

    def walk(idx: int, earliest: datetime, intervals: list[tuple[datetime, datetime]]) -> None:
        nonlocal best
        if idx == len(path):
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

        w = offer_window(path[idx])
        if not w:
            return
        start, end, duration = w
        is_last = idx == len(path) - 1
        low = max(start, earliest, WINDOW_START)
        high = min(end, WINDOW_END - duration if is_last else WINDOW_END)
        if low > high:
            return
        candidates: set[datetime] = {low, high}
        cursor = low
        while cursor <= high:
            candidates.add(cursor)
            cursor += STEP
        for pickup in sorted(candidates):
            dropoff = pickup + duration
            if dropoff > WINDOW_END:
                continue
            if intervals:
                days_so_far = (dropoff - intervals[0][0]).total_seconds() / 86400
                if days_so_far > MAX_DAYS:
                    continue
            walk(idx + 1, pickup + MIN_GAP, intervals + [(pickup, dropoff)])

    walk(0, WINDOW_START, [])
    if not best:
        return None
    _, intervals, status = best
    return intervals, status


# ── Scoring ──────────────────────────────────────────────────────────────────

def score_path(path: list[dict[str, str]], intervals: list[tuple[datetime, datetime]]) -> float:
    """Higher is better. Rewards distance + south draw + loop closure;
    penalizes deviation from 5-day target and brutal km/day pace."""
    score = 100.0
    if len(path) == 1:
        score += 15
    else:
        score += min(len(path) * 8, 30)
    distance_km = sum(float(p.get('distance_km') or 0) for p in path)
    score += min(distance_km / 200, 40)
    if any(p['destination_name'] in SOUTH_NAMES for p in path):
        score += 20
    if len(path) >= 2 and same_area(path[0]['origin_name'], path[-1]['destination_name']):
        score += 10
    days = (intervals[-1][1] - intervals[0][0]).total_seconds() / 86400
    days = max(days, 0.5)
    score -= abs(days - 5.0) * 2
    km_per_day = distance_km / days
    if km_per_day > 350:
        score -= 5 * (km_per_day - 350) / 50
    return score


# ── Search ────────────────────────────────────────────────────────────────────

@dataclass
class ChainOption:
    path: list[dict[str, str]]
    intervals: list[tuple[datetime, datetime]]
    appointment: str
    score: float

    def route_key(self) -> str:
        cities = [self.path[0]['origin_name']] + [p['destination_name'] for p in self.path]
        return ' -> '.join(cities)


def search_all(offers: list[dict[str, str]]) -> list[ChainOption]:
    """One DFS from every offer's origin. Saves every valid sub-path.
    Same-area equivalence is physical distance (≤SAME_AREA_KM) — so
    Berglern↔München, Lyon↔Dagneux chain freely, but Mainz↔Marburg
    (97km) does NOT. Within a path, no area can be revisited except the
    start area as a loop close, after which we don't extend."""
    # Pre-bucket origins by canonical name for O(1) exact-name lookup.
    by_origin_name: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in offers:
        by_origin_name[normalize_city(row['origin_name'])].append(row)
    # Pre-compute, for each unique destination name appearing in offers,
    # the list of offers whose origin is "same area" (incl. exact name +
    # all coord-near cities). This avoids O(n²) per DFS step.
    all_origin_names = set(by_origin_name.keys())
    all_dest_names = {normalize_city(o['destination_name']) for o in offers}
    near_offers: dict[str, list[dict[str, str]]] = {}
    for dest_name in all_dest_names:
        bucket: list[dict[str, str]] = []
        for origin_name in all_origin_names:
            if same_area(dest_name, origin_name):
                bucket.extend(by_origin_name[origin_name])
        near_offers[dest_name] = bucket

    found: list[ChainOption] = []

    def save(path: list[dict[str, str]]) -> bool:
        if len(found) >= MAX_RAW_OPTIONS:
            return False
        sched = schedule_path(path)
        if sched:
            intervals, status = sched
            found.append(ChainOption(path, intervals, status, score_path(path, intervals)))
        return True

    def walk(path: list[dict[str, str]],
             visited_areas: set[str],
             path_offer_ids: set[str]) -> None:
        if not save(path):
            return
        if len(path) >= MAX_LEGS:
            return
        last = path[-1]
        last_dest_area = normalize_city(last['destination_name'])
        start_area = normalize_city(path[0]['origin_name'])
        for nxt in near_offers.get(last_dest_area, []):
            if nxt['offer_id'] in path_offer_ids:
                continue
            if not can_follow(last, nxt):
                continue
            nxt_area = normalize_city(nxt['destination_name'])
            # "Already in visited_areas" check is by canonical name; loop
            # close back to start is allowed and saved but not extended.
            already_visited = nxt_area in visited_areas or any(
                same_area(nxt_area, v) for v in visited_areas if v != start_area
            )
            if nxt_area == start_area or same_area(nxt_area, start_area):
                # Loop close: save then stop (don't reuse offers further).
                save(path + [nxt])
                continue
            if already_visited:
                continue
            walk(
                path + [nxt],
                visited_areas | {nxt_area},
                path_offer_ids | {nxt['offer_id']},
            )

    for offer in offers:
        if len(found) >= MAX_RAW_OPTIONS:
            print(f'  ⚠ cap hit at {MAX_RAW_OPTIONS} raw options', file=sys.stderr)
            break
        start_area = normalize_city(offer['origin_name'])
        first_dest = normalize_city(offer['destination_name'])
        walk(
            [offer],
            {start_area, first_dest},
            {offer['offer_id']},
        )

    return found


# ── Variant grouping ─────────────────────────────────────────────────────────

@dataclass
class Variant:
    intervals: list[tuple[datetime, datetime]]
    appointment: str
    offer_ids: list[str]
    score: float
    vehicles: list[str]


@dataclass
class CanonicalChain:
    path: list[dict[str, str]]
    intervals: list[tuple[datetime, datetime]]
    appointment: str
    score: float
    variants: list[Variant] = field(default_factory=list)


def group_variants(options: list[ChainOption]) -> list[CanonicalChain]:
    """Collapse same-route chains. Canonical = highest-scored variant.
    Variants list is the full set, sorted by start date."""
    by_route: dict[str, list[ChainOption]] = defaultdict(list)
    for opt in options:
        by_route[opt.route_key()].append(opt)

    canonicals: list[CanonicalChain] = []
    for variants in by_route.values():
        variants.sort(key=lambda v: v.score, reverse=True)
        best = variants[0]
        chain = CanonicalChain(
            path=best.path,
            intervals=best.intervals,
            appointment=best.appointment,
            score=best.score,
        )
        variants.sort(key=lambda v: v.intervals[0][0])
        for v in variants:
            chain.variants.append(Variant(
                intervals=v.intervals,
                appointment=v.appointment,
                offer_ids=[p['offer_id'] for p in v.path],
                score=v.score,
                vehicles=[
                    ((p.get('make') or '') + ' ' + (p.get('model') or '')).strip()
                    for p in v.path
                ],
            ))
        canonicals.append(chain)

    canonicals.sort(key=lambda c: c.score, reverse=True)
    return canonicals


# ── Classification + CSV emission ────────────────────────────────────────────

def classify(path: list[dict[str, str]]) -> tuple[str, str | None, str | None]:
    """Return (chain_type, home_origin_or_None, loop_tier_or_None).
    loop_tier ∈ {'perfect', 'imperfect', None}."""
    origin = path[0]['origin_name']
    dest = path[-1]['destination_name']
    origin_home = home_origin_of(origin)
    dest_home = home_origin_of(dest)
    tier = loop_tier(origin, dest) if len(path) >= 2 else None
    if tier:
        return 'loop', origin_home, tier
    if origin_home:
        return 'oneway', origin_home, None
    if dest_home:
        return 'inbound', dest_home, None
    return 'oneway', None, None


def emit_csv(chains: list[CanonicalChain]) -> None:
    fields = [
        'score', 'route', 'legs', 'start', 'end', 'days', 'appointment',
        'chain_type', 'home_city', 'is_loop', 'loop_tier',
        'start_end_km',
        'route_km', 'included_km', 'spare_km',
        'countries_hint', 'planned_pickups', 'planned_dropoffs',
        'offer_ids', 'vehicles', 'variants_json',
    ]
    with OUT_PATH.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for chain in chains:
            path = chain.path
            intervals = chain.intervals
            chain_type, home_city, tier = classify(path)
            cities = [path[0]['origin_name']] + [p['destination_name'] for p in path]
            route_km = sum(float(p.get('distance_km') or 0) for p in path)
            included_km = sum(float(p.get('free_km') or 0) for p in path)
            days = (intervals[-1][1] - intervals[0][0]).total_seconds() / 86400
            variants_payload = [
                {
                    'startUtc': v.intervals[0][0].isoformat(),
                    'endUtc': v.intervals[-1][1].isoformat(),
                    'pickups': [i[0].isoformat() for i in v.intervals],
                    'dropoffs': [i[1].isoformat() for i in v.intervals],
                    'offerIds': v.offer_ids,
                    'days': (v.intervals[-1][1] - v.intervals[0][0]).total_seconds() / 86400,
                    'score': v.score,
                }
                for v in chain.variants
            ]
            start_end_km = distance_km(path[0]['origin_name'], path[-1]['destination_name'])
            writer.writerow({
                'score': f'{chain.score:.1f}',
                'route': ' -> '.join(cities),
                'legs': len(path),
                'start': intervals[0][0].isoformat(),
                'end': intervals[-1][1].isoformat(),
                'days': f'{days:.1f}',
                'appointment': chain.appointment,
                'chain_type': chain_type,
                'home_city': home_city or '',
                'is_loop': 'yes' if chain_type == 'loop' else 'no',
                'loop_tier': tier or '',
                'start_end_km': f'{start_end_km:.0f}' if start_end_km is not None else '',
                'route_km': f'{route_km:.0f}',
                'included_km': f'{included_km:.0f}',
                'spare_km': f'{included_km - route_km:.0f}',
                'countries_hint': '',  # filled in build.py
                'planned_pickups': ' -> '.join(i[0].isoformat() for i in intervals),
                'planned_dropoffs': ' -> '.join(i[1].isoformat() for i in intervals),
                'offer_ids': ' -> '.join(p['offer_id'] for p in path),
                'vehicles': ' | '.join(
                    ((p.get('make') or '') + ' ' + (p.get('model') or '')).strip()
                    for p in path
                ),
                'variants_json': json.dumps(variants_payload, ensure_ascii=False),
            })


def main() -> None:
    if not OFFERS_PATH.exists():
        print(f'ERROR: {OFFERS_PATH} not found. Run fetch.py first.', file=sys.stderr)
        sys.exit(1)
    offers = read_offers()
    print(f'→ Read {len(offers)} offers from {OFFERS_PATH.name}')

    raw = search_all(offers)
    print(f'  {len(raw)} raw chain variants found (cap={MAX_RAW_OPTIONS})')

    chains = group_variants(raw)
    print(f'  {len(chains)} unique routes after variant grouping')

    tiers = [classify(c.path)[2] for c in chains]
    perfect = sum(1 for t in tiers if t == 'perfect')
    imperfect = sum(1 for t in tiers if t == 'imperfect')
    home_count = sum(1 for c in chains if classify(c.path)[1])
    multi_variant = sum(1 for c in chains if len(c.variants) > 1)
    print(f'  {perfect} perfect loops · {imperfect} imperfect loops · {home_count} home-origin · {multi_variant} multi-variant')

    emit_csv(chains)
    print(f'✓ {len(chains)} chains written to {OUT_PATH}')


if __name__ == '__main__':
    main()
