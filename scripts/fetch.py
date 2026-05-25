#!/usr/bin/env python3
"""Fetch Movacar €1 relocation offers.

Strategy (two collectors):

  A) Broad paginated fetch — catches current offers and chaining hubs.
     Stops early once it stops seeing new offer IDs (stale pages).

  B) Origin-scoped fetch — for each home-cluster station, query
     ?origin=<station_id>. This is what the Movacar website UI uses.
     The unfiltered paginated endpoint misses future home-city offers
     (e.g. Bochum → Paris CDG in June) that only appear when querying
     by origin station ID.

Both collectors contribute to the same pool; dedup by (origin_id,
dest_id, start_date) keeps one representative per route-day.

Writes data/movacar_offers.csv with one row per unique route-day.
"""
from __future__ import annotations
import csv
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
OFFERS_CSV = DATA_DIR / 'movacar_offers.csv'

API_BASE = 'https://crowd-api-production-615013621295.europe-west1.run.app'

# Rolling window. Movacar typically publishes ~2-4 weeks ahead, but extending
# the window costs nothing on their side — the API just returns less data per
# request. We probe up to 90 days so we catch anything they publish further out.
TODAY = datetime.now(timezone.utc).date()
WINDOW_START = TODAY
WINDOW_END = TODAY + timedelta(days=90)

# Home-cluster station references (ULIDs) for origin-scoped API queries.
# The Movacar API uses `reference` (ULID) for the `origin=` param, NOT the numeric id.
# Discovery: fetch broad pages, collect included[] stations, read attrs['reference'].
HOME_STATION_REFS: dict[str, list[str]] = {
    'Bochum': [
        '01JCREFS6VXZ2CBYDZEQK3PCGJ',  # Bochum
        '01JCREGNCR5C18RRB5K2M02504',  # Essen
        '01JCRENM1KCW43HAGA4ZHKHDM9',  # Dormagen
    ],
    'Hannover': [
        '01JCRE4P0P60PTDNXJJQGTVMZC',  # Weyhe (nearest active station to Hannover)
    ],
    'München': [
        '01JCR876D5E2V83RANH2V4ATJT',  # Berglern (Munich Airport area)
        '01JCR8EM5PTM7C3XEK4S6ATFWR',  # Gersthofen (Augsburg/Munich)
        '01JCR8QJ9K2K68BYKVSC0EE42Q',  # München proper
    ],
    'Marburg': [
        '01JCREA8S3YSVJ9A69X9XJDVR4',  # Marburg
        '01JCRF4562XWQ4XHWGSAEM7TZC',  # Frankfurt am Main
        '01JCRF40J4X1TZKGNRZ6EXPPGH',  # Mainz
    ],
}

ALL_HOME_STATION_REFS: list[str] = [
    ref for refs in HOME_STATION_REFS.values() for ref in refs
]

# Broad fetch: stop after this many consecutive pages with no new offer IDs
STALE_PAGE_STOP = 5
MAX_BROAD_PAGES = 60
# Origin-scoped fetch: cap pages per station so we don't loop forever
MAX_ORIGIN_PAGES = 20


def http_get(url: str, retries: int = 3) -> Any:
    last_err: Exception | None = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'eurokaefer-fetch/2.0',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'GET {url} failed after {retries} tries: {last_err}')


# ── Shared state: stations + prices collected across all fetches ──────────────

_stations: dict[str, dict] = {}   # station_id → attrs
_prices: dict[str, int] = {}      # price_id → amount_minor_units


def _ingest_included(included: list[dict]) -> None:
    for item in included:
        t = item.get('type')
        iid = item.get('id', '')
        attrs = item.get('attributes', {})
        if t == 'station':
            _stations[iid] = attrs
        elif t == 'monetary_amount':
            _prices[iid] = attrs.get('amount_minor_units', 999999)


# ── Collector A: broad paginated fetch ───────────────────────────────────────

def collector_broad() -> list[dict]:
    """Unfiltered paginated fetch. Stops on stale pages."""
    all_offers: list[dict] = []
    seen_ids: set[str] = set()
    stale = 0
    base = (
        f'{API_BASE}/v1/offers'
        f'?pickupDateFrom={WINDOW_START.isoformat()}'
        f'&pickupDateTo={WINDOW_END.isoformat()}'
    )
    for page in range(1, MAX_BROAD_PAGES + 1):
        raw = http_get(f'{base}&page={page}')
        batch = raw.get('data', [])
        if not batch:
            break
        _ingest_included(raw.get('included', []))
        new = [o for o in batch if o.get('id') not in seen_ids]
        seen_ids.update(o.get('id', '') for o in batch)
        all_offers.extend(new)
        stale = 0 if new else stale + 1
        print(f'  broad p{page}: {len(batch)} raw, {len(new)} new (total {len(all_offers)})')
        if stale >= STALE_PAGE_STOP or len(batch) < 100:
            break
    return all_offers


# ── Collector B: origin-scoped fetch for home clusters ───────────────────────

def collector_home_origins() -> list[dict]:
    """Query each home-cluster station by origin= param. Now paginates per origin."""
    all_offers: list[dict] = []
    seen_ids: set[str] = set()
    base = (
        f'{API_BASE}/v1/offers'
        f'?pickupDateFrom={WINDOW_START.isoformat()}'
        f'&pickupDateTo={WINDOW_END.isoformat()}'
    )
    for station_id in ALL_HOME_STATION_REFS:
        # Resolve display name: find station whose reference matches this ULID
        city = next(
            (a.get('city', station_id) for a in _stations.values() if a.get('reference') == station_id),
            station_id,
        )
        station_total = 0
        station_new = 0
        for page in range(1, MAX_ORIGIN_PAGES + 1):
            url = f'{base}&origin={station_id}&page={page}'
            raw = http_get(url)
            batch = raw.get('data', [])
            if not batch:
                break
            _ingest_included(raw.get('included', []))
            new = [o for o in batch if o.get('id') not in seen_ids]
            seen_ids.update(o.get('id', '') for o in batch)
            all_offers.extend(new)
            station_total += len(batch)
            station_new += len(new)
            # If page returned < 100 we're at the end
            if len(batch) < 100:
                break
        print(f'  origin {station_id} ({city}): {station_total} offers across pages, {station_new} new')
    return all_offers


# ── Discovery log: enumerate all stations we've seen ─────────────────────────

def log_station_discovery() -> None:
    """Print every station found in the broad fetch — helps spot new stations
    that should be added to HOME_STATION_REFS."""
    if not _stations:
        print('  (no stations discovered)')
        return
    home_refs = set(ALL_HOME_STATION_REFS)
    print(f'  Discovered {len(_stations)} stations (★ = already in HOME_STATION_REFS):')
    rows = sorted(
        _stations.values(),
        key=lambda a: (a.get('country') or '?', a.get('city') or '?'),
    )
    for a in rows:
        ref = a.get('reference', '?')
        mark = '★' if ref in home_refs else ' '
        print(f"    {mark} {a.get('country') or '?':3} {a.get('city') or '?':28} ref={ref}")


# ── Parse raw offer objects → CSV rows ───────────────────────────────────────

def parse_offers(raw_offers: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for offer in raw_offers:
        attrs = offer.get('attributes', {})
        rels = offer.get('relationships', {})

        price_id = (rels.get('base_price') or {}).get('data', {}).get('id', '')
        price_cents = _prices.get(price_id, 999999)
        if price_cents > 100:
            continue

        origin_id = (rels.get('origin') or {}).get('data', {}).get('id', '')
        dest_id = (rels.get('destination') or {}).get('data', {}).get('id', '')
        origin_st = _stations.get(origin_id, {})
        dest_st = _stations.get(dest_id, {})

        origin_name = origin_st.get('city') or origin_id
        dest_name = dest_st.get('city') or dest_id

        distance_m = float(attrs.get('distance') or 0)
        distance_km = distance_m / 1000.0

        rows.append({
            'offer_id': str(attrs.get('offer_id') or offer.get('id', '')),
            'origin_location_id': origin_id,
            'origin_name': origin_name,
            'destination_location_id': dest_id,
            'destination_name': dest_name,
            'origin_city': origin_st.get('city') or '',
            'origin_lat': str(origin_st.get('latitude') or ''),
            'origin_lng': str(origin_st.get('longitude') or ''),
            'dest_city': dest_st.get('city') or '',
            'dest_lat': str(dest_st.get('latitude') or ''),
            'dest_lng': str(dest_st.get('longitude') or ''),
            'start_date_utc': attrs.get('start_date') or '',
            'end_date_utc': attrs.get('end_date') or '',
            'period_hours': str(attrs.get('period') or 72),
            'distance_km': f'{distance_km:.1f}',
            'free_km': str(attrs.get('free_km') or 0),
            'make': attrs.get('make') or '',
            'model': attrs.get('model') or '',
            'vehicle_category': attrs.get('vehicle_category_name') or '',
            'price_eur': f'{price_cents / 100:.2f}',
            'is_eur_1': 'yes' if price_cents <= 100 else 'no',
        })
    return rows


# ── Dedup: one representative per (origin, destination, pickup_day) ───────────

def dedup_by_route_day(rows: list[dict]) -> list[dict]:
    """Keep best offer per (origin_id, dest_id, pickup_day).

    'Best' = most free_km. Preserves all date diversity for chain-building
    while eliminating duplicate vehicles on the same route+day.
    """
    best: dict[tuple, dict] = {}
    for row in rows:
        pickup_day = row['start_date_utc'][:10]
        key = (row['origin_location_id'], row['destination_location_id'], pickup_day)
        existing = best.get(key)
        if existing is None or float(row['free_km'] or 0) > float(existing['free_km'] or 0):
            best[key] = row
    return list(best.values())


FIELDS = [
    'offer_id', 'origin_location_id', 'origin_name',
    'destination_location_id', 'destination_name',
    'origin_city', 'origin_lat', 'origin_lng',
    'dest_city', 'dest_lat', 'dest_lng',
    'start_date_utc', 'end_date_utc', 'period_hours',
    'distance_km', 'free_km', 'make', 'model',
    'vehicle_category', 'price_eur', 'is_eur_1',
]


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f'→ Fetching offers {WINDOW_START} → {WINDOW_END}')

    print('  [A] Broad paginated fetch…')
    broad_raw = collector_broad()

    print('  [B] Home-origin scoped fetch (paginated)…')
    home_raw = collector_home_origins()

    all_raw = broad_raw + home_raw
    print(f'  Combined: {len(all_raw)} unique raw offers')

    print('  [C] Station discovery…')
    log_station_discovery()

    rows = parse_offers(all_raw)
    kept = len(rows)
    rejected = len(all_raw) - kept
    print(f'  {kept} are €1 (price ≤ €1.00), {rejected} rejected as non-€1')
    before_dedup = len(rows)
    rows = dedup_by_route_day(rows)
    print(f'  {before_dedup} → {len(rows)} after dedup by (origin, dest, day) [kept best free_km]')

    # Histogram: how many offers per week-ahead? Reveals Movacar's true horizon.
    from collections import Counter
    weeks = Counter()
    for r in rows:
        pickup_day = r['start_date_utc'][:10]
        try:
            d = datetime.fromisoformat(pickup_day).date()
            week_ahead = (d - TODAY).days // 7
            weeks[week_ahead] += 1
        except ValueError:
            pass
    print('  Offers per week ahead of today:')
    for w in sorted(weeks):
        bar = '█' * min(weeks[w], 40)
        print(f'    w+{w:2d}: {weeks[w]:3d}  {bar}')

    with OFFERS_CSV.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in sorted(rows, key=lambda r: r['start_date_utc']):
            writer.writerow(r)
    print(f'✓ {len(rows)} offers written to {OFFERS_CSV}')


if __name__ == '__main__':
    main()
