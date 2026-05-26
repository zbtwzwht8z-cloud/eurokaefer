// Pure filter + sort. Takes the master chain list and a filter state, returns
// the displayed subset. All UI-side filtering lives here so it's testable in isolation.

import { type Chain, chainFuelEur, chainDriveHours, endsInIceCity } from './chains';
import { HOME_CITY_SET, REGIONS, type HomeCity, type RegionKey } from './constants';

export type SortKey = 'best' | 'fuel' | 'shortest' | 'soonest' | 'legs-asc' | 'legs-desc';

export type FilterState = {
  from: HomeCity | 'mine' | 'any';
  flexFrom: boolean;           // if true, also match nearby cities in same home region
  to: RegionKey;
  flexTo: boolean;             // if true, also match any city in the broader region group
  maxLegs: number;             // 1 | 2 | 3 | 6 (=no limit)
  dateFrom?: string;           // ISO date (yyyy-mm-dd)
  dateTo?: string;             // ISO date (yyyy-mm-dd)
  search: string;
  sort: SortKey;
  loopsOnly?: boolean;
  onewaysOnly?: boolean;
  iceOnly?: boolean;
};

export const DEFAULT_FILTER: FilterState = {
  from: 'any',
  flexFrom: false,
  to: 'all',
  flexTo: false,
  maxLegs: 6,
  search: '',
  sort: 'best',
};

function priority(c: Chain): number {
  let p = 0;
  if (c.homeOrigin) p += 4;
  if (c.loopTier === 'perfect') p += 3;
  else if (c.loopTier === 'imperfect') p += 2;
  else if (c.isLoop ?? (c.type === 'loop')) p += 1;
  return p;
}

function resolveFromSet(state: FilterState, myHome: HomeCity): { set: Set<string>; key: string } | null {
  if (state.from === 'any') return null;
  const key = state.from === 'mine' ? myHome : state.from;
  const set = HOME_CITY_SET[key] ?? new Set<string>();
  return { set, key };
}

function resolveToSet(state: FilterState): Set<string> | null {
  if (state.to === 'all') return null;
  return REGIONS[state.to]?.cities ?? null;
}

function matchesDateWindow(c: Chain, dateFrom?: string, dateTo?: string): boolean {
  if (!dateFrom && !dateTo) return true;
  // Match if ANY variant falls in the window. Falls back to canonical
  // start/end if variants aren't populated (legacy data).
  const candidates = (c.variants && c.variants.length)
    ? c.variants.map(v => ({ start: v.startUtc, end: v.endUtc }))
    : [{ start: c.startUtc, end: c.endUtc }];
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
  const toMs = dateTo ? new Date(dateTo + 'T23:59:59Z').getTime() : Infinity;
  return candidates.some(({ start, end }) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return e >= fromMs && s <= toMs;
  });
}

export function applyFilters(
  all: Chain[],
  state: FilterState,
  myHome: HomeCity,
): Chain[] {
  const fromSet = resolveFromSet(state, myHome);
  const toSet = resolveToSet(state);
  const q = state.search.trim().toLowerCase();

  let pool = all.filter(c => {
    const isLoop = c.isLoop ?? (c.type === 'loop');
    if (state.loopsOnly && !isLoop) return false;
    if (state.onewaysOnly && isLoop) return false;
    if (state.maxLegs && c.legs.length > state.maxLegs) return false;

    // FROM filter
    if (fromSet) {
      const { set: fromCitySet, key: fromKey } = fromSet;
      if (state.flexFrom) {
        // Flexible: accept if the home area appears ANYWHERE in the route
        if (!c.route.some(city => fromCitySet.has(city))) return false;
      } else {
        // Strict: chain must DEPART from the home area (route[0])
        if (!fromCitySet.has(c.route[0])) return false;
      }
    }

    // TO filter
    if (toSet && state.to !== 'all') {
      if (state.flexTo) {
        // Flexible: destination region appears ANYWHERE in the route (mid-stop or end)
        if (!c.route.some(city => toSet.has(city))) return false;
      } else {
        // Strict: chain must END at the destination region
        const dest = c.route[c.route.length - 1];
        if (!toSet.has(dest)) return false;
      }
    }

    if (state.iceOnly && !endsInIceCity(c).ok) return false;
    if (!matchesDateWindow(c, state.dateFrom, state.dateTo)) return false;
    if (q) {
      const blob = (c.route.join(' ') + ' ' + (c.countries || []).join(' ')).toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  switch (state.sort) {
    case 'fuel':
      pool = [...pool].sort((a, b) => chainFuelEur(a) - chainFuelEur(b));
      break;
    case 'shortest':
      pool = [...pool].sort((a, b) => chainDriveHours(a) - chainDriveHours(b));
      break;
    case 'soonest':
      pool = [...pool].sort((a, b) =>
        new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime());
      break;
    case 'legs-asc':
      pool = [...pool].sort((a, b) => a.legs.length - b.legs.length || b.score - a.score);
      break;
    case 'legs-desc':
      pool = [...pool].sort((a, b) => b.legs.length - a.legs.length || b.score - a.score);
      break;
    default:
      // Priority weights:
      //   home_origin: +4 (single biggest factor — these are MY trips)
      //   perfect loop: +3
      //   imperfect loop: +2
      //   any loop fallback (no tier): +1
      // So home+perfect > home+imperfect > home alone > perfect alone > etc.
      // Score breaks ties.
      pool = [...pool].sort((a, b) => {
        const aPri = priority(a);
        const bPri = priority(b);
        if (aPri !== bPri) return bPri - aPri;
        return b.score - a.score;
      });
  }

  return pool;
}
