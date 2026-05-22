// Pure filter + sort. Takes the master chain list and a filter state, returns
// the displayed subset. All UI-side filtering lives here so it's testable in isolation.

import { type Chain, chainFuelEur, chainDriveHours, endsInIceCity } from './chains';
import { HOME_CITY_SET, REGIONS, type HomeCity, type RegionKey } from './constants';

export type SortKey = 'best' | 'fuel' | 'shortest' | 'soonest' | 'legs-asc' | 'legs-desc';

export type FilterState = {
  from: HomeCity | 'mine' | 'any';
  to: RegionKey;
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
  from: 'mine',
  to: 'all',
  maxLegs: 2,
  search: '',
  sort: 'best',
};

function resolveFromSet(state: FilterState, myHome: HomeCity): Set<string> | null {
  if (state.from === 'any') return null;
  const key = state.from === 'mine' ? myHome : state.from;
  return HOME_CITY_SET[key] ?? null;
}

function matchesDateWindow(c: Chain, dateFrom?: string, dateTo?: string): boolean {
  if (!dateFrom && !dateTo) return true;
  const start = new Date(c.startUtc).getTime();
  const end = new Date(c.endUtc).getTime();
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    if (end < from) return false;
  }
  if (dateTo) {
    const to = new Date(dateTo + 'T23:59:59Z').getTime();
    if (start > to) return false;
  }
  return true;
}

export function applyFilters(
  all: Chain[],
  state: FilterState,
  myHome: HomeCity,
): Chain[] {
  const fromSet = resolveFromSet(state, myHome);
  const toRegion = REGIONS[state.to];
  const q = state.search.trim().toLowerCase();

  let pool = all.filter(c => {
    if (state.loopsOnly && c.type !== 'loop') return false;
    if (state.onewaysOnly && c.type === 'loop') return false;
    if (state.maxLegs && c.legs.length > state.maxLegs) return false;
    if (fromSet && !fromSet.has(c.route[0])) return false;
    if (toRegion && state.to !== 'all') {
      const dest = c.route[c.route.length - 1];
      if (!toRegion.cities.has(dest)) return false;
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
      pool = [...pool].sort((a, b) => b.score - a.score);
  }

  return pool;
}
