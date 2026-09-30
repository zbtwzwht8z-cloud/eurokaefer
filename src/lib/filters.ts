// Search state + display-side filtering over the engine's chains.
// Engine params (legs, days, dates, €1-only) change which chains exist;
// everything else here only narrows and orders them.

import type { Chain, Coord, Offer } from './types';
import { haversineKm } from './geo';

export type Mode = 'all' | 'loop' | 'oneway';
export type Sort = 'best' | 'soonest' | 'cheapest' | 'longest' | 'quickest';

export type Filters = {
  from: string;        // place name, '' = anywhere
  near: number;        // km radius around `from`; 0 = that place only
  to: string;          // '' | place name | 'country:XX'
  via: boolean;        // `to` may be any stop, not just the last
  mode: Mode;
  eur1: boolean;       // engine: chain €1 offers only
  legs: number;        // engine: max legs
  days: number;        // engine: max trip length
  dateFrom: string;    // engine: yyyy-mm-dd or ''
  dateTo: string;
  sort: Sort;
};

export const DEFAULT_FILTERS: Filters = {
  from: '', near: 50, to: '', via: false, mode: 'all',
  eur1: false, legs: 6, days: 21, dateFrom: '', dateTo: '', sort: 'best',
};

export type PlaceInfo = {
  name: string;
  coord: Coord;
  country: string;
  towns: string[];       // Movacar station towns grouped under this place
  departures: number;
  arrivals: number;
};

/** Every place in the feed, with how many offers leave from / arrive at it. */
export function placeIndex(offers: Offer[]): Map<string, PlaceInfo> {
  const map = new Map<string, PlaceInfo>();
  const touch = (name: string, town: string, coord: Coord, country: string) => {
    let p = map.get(name);
    if (!p) map.set(name, (p = { name, coord, country, towns: [], departures: 0, arrivals: 0 }));
    if (!p.towns.includes(town)) p.towns.push(town);
    return p;
  };
  for (const o of offers) {
    touch(o.originName, o.originTown, o.origin, o.originCountry).departures++;
    touch(o.destName, o.destTown, o.dest, o.destCountry).arrivals++;
  }
  return map;
}

function stopCountry(c: Chain, i: number): string {
  return i === 0 ? c.legs[0].offer.originCountry : c.legs[i - 1].offer.destCountry;
}

export function applyFilters(chains: Chain[], f: Filters, places: Map<string, PlaceInfo>): Chain[] {
  const fromPlace = f.from ? places.get(f.from) : undefined;
  const toCountry = f.to.startsWith('country:') ? f.to.slice(8) : '';
  const toPlace = !toCountry && f.to ? f.to : '';

  const out = chains.filter(c => {
    if (f.mode === 'loop' && !c.isLoop) return false;
    if (f.mode === 'oneway' && c.isLoop) return false;

    if (f.from) {
      const atStart = c.route[0] === f.from;
      const near = fromPlace && f.near > 0 && haversineKm(c.coords[0], fromPlace.coord) <= f.near;
      if (!atStart && !near) return false;
    }

    if (toCountry || toPlace) {
      const last = c.route.length - 1;
      const hit = (i: number) => (toCountry ? stopCountry(c, i) === toCountry : c.route[i] === toPlace);
      if (f.via) {
        let any = false;
        for (let i = 1; i <= last && !any; i++) any = hit(i);
        if (!any) return false;
      } else if (!hit(last)) return false;
    }
    return true;
  });

  const by: Record<Sort, (a: Chain, b: Chain) => number> = {
    best: (a, b) => b.score - a.score,
    soonest: (a, b) => a.departFrom - b.departFrom || b.score - a.score,
    cheapest: (a, b) => a.priceEur - b.priceEur || b.score - a.score,
    longest: (a, b) => b.routeKm - a.routeKm,
    quickest: (a, b) => a.minDays - b.minDays || b.score - a.score,
  };
  return out.sort(by[f.sort]);
}

// ── URL ⇄ filters (shareable searches) ──────────────────────────────────────

const KEYS: Record<keyof Filters, string> = {
  from: 'from', near: 'near', to: 'to', via: 'via', mode: 'mode', eur1: 'eur1',
  legs: 'legs', days: 'days', dateFrom: 'df', dateTo: 'dt', sort: 'sort',
};

export function filtersToParams(f: Filters, params = new URLSearchParams()): URLSearchParams {
  for (const k of Object.keys(KEYS) as (keyof Filters)[]) {
    const v = f[k], d = DEFAULT_FILTERS[k];
    if (v === d) params.delete(KEYS[k]);
    else params.set(KEYS[k], typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return params;
}

export function filtersFromParams(params: URLSearchParams, base: Filters = DEFAULT_FILTERS): Filters {
  const f: Filters = { ...base };
  const get = (k: keyof Filters) => params.get(KEYS[k]);
  const int = (k: keyof Filters, lo: number, hi: number) => {
    const n = Number(get(k));
    return get(k) != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : undefined;
  };
  f.from = get('from') ?? f.from;
  f.to = get('to') ?? f.to;
  f.near = int('near', 0, 500) ?? f.near;
  f.legs = int('legs', 1, 6) ?? f.legs;
  f.days = int('days', 1, 365) ?? f.days;
  if (get('via') != null) f.via = get('via') === '1';
  if (get('eur1') != null) f.eur1 = get('eur1') === '1';
  const mode = get('mode');
  if (mode === 'all' || mode === 'loop' || mode === 'oneway') f.mode = mode;
  const sort = get('sort');
  if (sort && sort in { best: 1, soonest: 1, cheapest: 1, longest: 1, quickest: 1 }) f.sort = sort as Sort;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const df = get('dateFrom'), dt = get('dateTo');
  if (df != null) f.dateFrom = iso.test(df) ? df : '';
  if (dt != null) f.dateTo = iso.test(dt) ? dt : '';
  return f;
}
