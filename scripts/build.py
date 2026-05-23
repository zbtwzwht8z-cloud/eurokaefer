#!/usr/bin/env python3
"""Build src/data/trip-data.ts from the CSV outputs of fetch.py + search.py.

The emitted TypeScript exports a frozen TRIP_DATA constant the Next.js page
imports directly. Bundled = zero DB roundtrip for the read-only trip set.
"""
from __future__ import annotations
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OFFERS_CSV = ROOT / 'data' / 'movacar_offers.csv'
CHAINS_CSV = ROOT / 'data' / 'roadtrip_options.csv'
OUT_PATH = ROOT / 'src' / 'data' / 'trip-data.ts'

# Country map (lighter copy from src/lib/constants.ts; used for countries_hint)
COUNTRY_OF = {
    # Germany
    **{c: 'Germany' for c in [
        'Bochum', 'Essen', 'Dormagen', 'Bielefeld', 'Bonn', 'Duisburg', 'Dortmund', 'Düsseldorf',
        'Köln', 'Cologne', 'Münster', 'Aachen', 'Berlin', 'Hamburg', 'Frankfurt am Main',
        'München', 'Munich', 'Stuttgart', 'Leipzig', 'Dresden', 'Erfurt', 'Mainz', 'Marburg',
        'Kassel', 'Nürnberg', 'Regensburg', 'Trier', 'Kiel', 'Flensburg', 'Weyhe', 'Laatzen',
        'Bautzen', 'Chemnitz', 'Korntal-Münchingen', 'Gersthofen', 'Wangen', 'Würzburg',
        'Ihringen', 'Aach', 'Ettlingenweier', 'Neu-Ulm', 'Heidelberg', 'Karlsruhe', 'Sinsheim',
        'Freiburg', 'Konstanz', 'Friedrichshafen', 'Hannover', 'Bremen',
        'Berglern', 'Augsburg', 'Weingarten', 'Lörrach', 'Landsberg am Lech', 'Sindelfingen',
    ]},
    **{c: 'France' for c in [
        'Paris', 'Paris CDG', 'Champlan', 'Nantes', 'Mérignac', 'Lille', 'Strasbourg',
        'Cabriès', 'Gattières', 'Saint-Laurent-du-Var', 'Dagneux', 'Saint-Alban',
        'Saint-Jean-de-Gonville', 'Saint-Mesmes', 'Goussainville', 'Grigny',
        'Marseille', 'Nice', 'Montpellier', 'Nîmes', 'Avignon', 'Aix-en-Provence',
        'Toulouse', 'Lyon', 'Bordeaux',
    ]},
    **{c: 'Italy' for c in [
        'Milan', 'Milan / Castellanza', 'Castellanza', 'Bergamo', 'Bologna', 'Florence', 'Roma',
        'Turin', 'Venezia', 'Napoli', 'Genova', 'Palermo', 'Vizzola Ticino', 'Bastia',
    ]},
    **{c: 'Spain' for c in [
        'Barcelona', 'Viladecans', 'Madrid', 'Sevilla', 'Bilbao', 'Zamudio', 'A Coruña', 'Valencia',
    ]},
    **{c: 'Sweden' for c in ['Göteborgs Stad', 'Staffanstorps kommun', 'Stockholm']},
    **{c: 'Belgium' for c in ['Sint-Pieters-Leeuw / Brussels', 'Antwerp']},
    **{c: 'Netherlands' for c in ['Amsterdam / Amstelveen', 'Rotterdam']},
    **{c: 'Austria' for c in [
        'Wiener Neudorf', 'Wien', 'Vienna', 'Salzburg', 'Graz', 'Hörsching', 'Wiesing', 'Innsbruck',
    ]},
    'Porto': 'Portugal', 'Lisbon': 'Portugal',
    'Split': 'Croatia', 'Dubrovnik': 'Croatia',
    'Zürich': 'Switzerland', 'Basel': 'Switzerland', 'Geneva': 'Switzerland', 'Bern': 'Switzerland',
    'London': 'UK', 'Skedsmo': 'Norway', 'Blomsterdalen': 'Norway',
}

HOME_CITY_OF = {}
for hc, names in {
    'Bochum': {'Bochum', 'Essen', 'Dormagen', 'Bielefeld', 'Bonn', 'Duisburg',
               'Dortmund', 'Düsseldorf', 'Köln', 'Cologne', 'Münster', 'Aachen'},
    'Hannover': {'Hannover', 'Laatzen', 'Weyhe'},
    'München': {'München', 'Munich', 'Berglern', 'Augsburg', 'Gersthofen', 'Rosenheim'},
    'Marburg': {'Marburg', 'Kassel', 'Frankfurt am Main', 'Mainz'},
}.items():
    for n in names:
        HOME_CITY_OF[n] = hc


def country_of(city: str) -> str:
    return COUNTRY_OF.get(city, 'Europe')


def home_city_of(city: str) -> str | None:
    return HOME_CITY_OF.get(city)


def read_offers() -> list[dict]:
    if not OFFERS_CSV.exists():
        return []
    with OFFERS_CSV.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def read_chains() -> list[dict]:
    if not CHAINS_CSV.exists():
        return []
    with CHAINS_CSV.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def build_offer_obj(o: dict) -> dict | None:
    if o.get('is_eur_1') != 'yes':
        return None
    try:
        return {
            'offerId': o['offer_id'],
            'originName': o['origin_name'],
            'destName': o['destination_name'],
            'startUtc': o['start_date_utc'],
            'endUtc': o['end_date_utc'],
            'periodHours': int(float(o.get('period_hours') or 72)),
            'distanceKm': float(o.get('distance_km') or 0),
            'freeKm': float(o.get('free_km') or 0),
            'make': o.get('make', ''),
            'model': o.get('model', ''),
            **({'homeCity': hc} if (hc := home_city_of(o['origin_name'])) else {}),
        }
    except (ValueError, KeyError):
        return None


def build_chain_obj(c: dict, offers_by_id: dict[str, dict]) -> dict | None:
    cities = [x.strip() for x in (c.get('route') or '').split(' -> ') if x.strip()]
    if len(cities) < 2:
        return None
    offer_ids = [x.strip() for x in (c.get('offer_ids') or '').split(' -> ') if x.strip()]
    pickups = [x.strip() for x in (c.get('planned_pickups') or '').split(' -> ')]
    dropoffs = [x.strip() for x in (c.get('planned_dropoffs') or '').split(' -> ')]
    vehicles = [x.strip() for x in (c.get('vehicles') or '').split(' | ')]

    legs = []
    for i, oid in enumerate(offer_ids):
        o = offers_by_id.get(oid, {})
        legs.append({
            'originName': cities[i] if i < len(cities) - 1 else '',
            'destName': cities[i + 1] if i + 1 < len(cities) else '',
            'pickup': pickups[i] if i < len(pickups) else '',
            'dropoff': dropoffs[i] if i < len(dropoffs) else '',
            'vehicle': vehicles[i] if i < len(vehicles) else '',
            'make': o.get('make', ''),
            'model': o.get('model', ''),
            'distanceKm': float(o.get('distance_km') or 0),
            'offerId': oid,
        })

    countries = []
    for city in cities:
        co = country_of(city)
        if co not in countries:
            countries.append(co)

    route_km = float(c.get('route_km') or 0)
    return {
        'score': float(c.get('score') or 0),
        'route': cities,
        'legs': legs,
        'type': c.get('chain_type') or 'oneway',
        **({'homeCity': hc} if (hc := c.get('home_city') or '') else {}),
        'startUtc': c.get('start') or '',
        'endUtc': c.get('end') or '',
        'days': float(c.get('days') or 0),
        'routeKm': route_km,
        'freeKm': float(c.get('included_km') or 0),
        'spareKm': float(c.get('spare_km') or 0),
        'driveHours': route_km / 85,
        'countries': countries,
        'appointment': c.get('appointment') or '',
    }


def main() -> None:
    print('→ Reading offers…')
    offers_raw = read_offers()
    offers_by_id = {o['offer_id']: o for o in offers_raw}
    offers = [obj for obj in (build_offer_obj(o) for o in offers_raw) if obj]
    print(f'  {len(offers)} €1 offers')

    print('→ Reading chains…')
    chains_raw = read_chains()
    chains = [obj for obj in (build_chain_obj(c, offers_by_id) for c in chains_raw) if obj]
    print(f'  {len(chains)} chains')

    generated = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    payload = {
        'meta': {
            'generated': generated,
            'offerCount': len(offers),
            'recommendedCount': len(chains),
        },
        'offers': offers,
        'recommended': chains,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = (
        '// AUTO-GENERATED by scripts/build.py — do not edit manually.\n'
        f'// Generated: {generated}\n'
        '// Run `npm run refresh` to regenerate.\n\n'
        "import type { TripData } from '@/lib/chains';\n\n"
        'export const TRIP_DATA: TripData = '
    )
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT_PATH.write_text(header + body + ' as const;\n', encoding='utf-8')
    print(f'✓ Written to {OUT_PATH}')
    print(f'  offers={len(offers)} chains={len(chains)}')


if __name__ == '__main__':
    main()
