#!/usr/bin/env python3
"""Fetch Movacar €1 relocation offers.

Movacar v1 API (2026):
  GET /v1/offers?pickupDateFrom=YYYY-MM-DD&pickupDateTo=YYYY-MM-DD
  Returns JSONAPI: { data: [...offers], included: [...stations, ...monetary_amounts] }

Writes data/movacar_offers.csv with one row per €1 offer.
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

# 90-day forward window from today
TODAY = datetime.now(timezone.utc).date()
WINDOW_START = TODAY
WINDOW_END = TODAY + timedelta(days=90)


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


def fetch_all_offers() -> list[dict]:
    """Fetch all offers for the window. Returns raw API response."""
    url = (
        f'{API_BASE}/v1/offers'
        f'?pickupDateFrom={WINDOW_START.isoformat()}'
        f'&pickupDateTo={WINDOW_END.isoformat()}'
    )
    print(f'  GET {url}')
    return http_get(url)


def parse_response(raw: dict) -> list[dict]:
    """Convert JSONAPI response to flat CSV rows. Only keeps €1 offers."""
    data = raw.get('data', [])
    included = raw.get('included', [])

    # Build lookup maps
    stations: dict[str, dict] = {}
    prices: dict[str, int] = {}  # id → amount_minor_units (cents)

    for item in included:
        t = item.get('type')
        iid = item.get('id', '')
        attrs = item.get('attributes', {})
        if t == 'station':
            stations[iid] = attrs
        elif t == 'monetary_amount':
            stations  # already handled above
            prices[iid] = attrs.get('amount_minor_units', 999999)

    rows: list[dict] = []
    for offer in data:
        attrs = offer.get('attributes', {})
        rels = offer.get('relationships', {})

        price_id = (rels.get('base_price') or {}).get('data', {}).get('id', '')
        price_cents = prices.get(price_id, 999999)
        if price_cents > 100:  # not €0 or €1
            continue

        origin_id = (rels.get('origin') or {}).get('data', {}).get('id', '')
        dest_id = (rels.get('destination') or {}).get('data', {}).get('id', '')
        origin_st = stations.get(origin_id, {})
        dest_st = stations.get(dest_id, {})

        # Use city for matching (search.py compares against name sets)
        # alternative_city has parenthetical info like "Berglern (bei München Flughafen)"
        origin_name = origin_st.get('city') or origin_id
        dest_name = dest_st.get('city') or dest_id

        # Distance is in metres in v1
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
    print(f'→ Fetching offers from {WINDOW_START} to {WINDOW_END}…')

    raw = fetch_all_offers()
    rows = parse_response(raw)
    print(f'  {len(raw.get("data", []))} total offers, {len(rows)} are €1')

    with OFFERS_CSV.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    print(f'✓ {len(rows)} €1 offers written to {OFFERS_CSV}')


if __name__ == '__main__':
    main()
