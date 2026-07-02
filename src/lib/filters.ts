// Pure filter + sort. Takes the engine's chain list and a filter state,
// returns the displayed subset.
//
// Division of labour since the engine overhaul:
//   - maxLegs, maxDays, dateFrom/dateTo are ENGINE parameters — they change
//     which chains exist at all (see src/lib/engine.ts).
//   - Everything below (from/to/search/loops/sort) is display-side filtering
//     over the engine's output.

import { type Chain, chainFuelEur, chainDriveHours, chainPriceEur, chainIsAllEur1, endsInIceCity } from './chains';
import { HOME_CITY_SET, REGIONS, type HomeCity, type RegionKey } from './constants';

export type SortKey = 'best' | 'price' | 'fuel' | 'shortest' | 'soonest' | 'legs-asc' | 'legs-desc' | 'spare';

export type TripMode = 'any' | 'loop' | 'oneway';

export type PriceMode = 'eur1' | 'any';   // engine param: which offers may chain at all

export type FilterState = {
  from: string;                // 'any' | 'mine' | home city | any origin city in the network
  flexFrom: boolean;           // if true, also match nearby cities in same home region
  to: string;                  // RegionKey | 'city:<name>' — a region or one specific city
  flexTo: boolean;             // if true, also match any city in the broader region group
  maxLegs: number;             // engine param: 1 | 2 | 3 | 6
  maxDays: number;             // engine param: cap on minimum possible trip length
  dateFrom?: string;           // engine param: earliest departure (yyyy-mm-dd)
  dateTo?: string;             // engine param: latest final dropoff (yyyy-mm-dd)
  priceMode: PriceMode;        // engine param: 'eur1' builds chains from €1 offers only
  search: string;
  sort: SortKey;
  tripMode: TripMode;          // any | loop | oneway (replaces loopsOnly/onewaysOnly)
  endsAtHome?: boolean;        // only trips that end in a home cluster (inbound)
  iceOnly?: boolean;
};

export const DEFAULT_FILTER: FilterState = {
  from: 'any',
  flexFrom: false,
  to: 'all',
  flexTo: false,
  maxLegs: 6,
  maxDays: 21,
  priceMode: 'any',
  search: '',
  sort: 'best',
  tripMode: 'any',
};

function priority(c: Chain): number {
  let p = 0;
  // Home relevance: trips starting OR ending at home are most useful.
  if (c.homeOrigin) p += 4;
  else if (c.homeDestination) p += 3;
  if (c.loopTier === 'perfect') p += 3;
  else if (c.loopTier === 'imperfect') p += 2;
  else if (c.isLoop ?? (c.type === 'loop')) p += 1;
  // The €1 premise: all-€1 chains edge out paid ones at equal relevance.
  if (chainIsAllEur1(c)) p += 1;
  return p;
}

function resolveFromSet(state: FilterState, myHome: HomeCity): { set: Set<string>; key: string } | null {
  if (state.from === 'any') return null;
  const key = state.from === 'mine' ? myHome : state.from;
  // Home cities expand to their cluster; any other city matches exactly.
  const set = HOME_CITY_SET[key as HomeCity] ?? new Set<string>([key]);
  return { set, key };
}

function resolveToSet(state: FilterState): Set<string> | null {
  if (state.to === 'all') return null;
  // 'city:<name>' pins one exact destination city; else it's a region key.
  if (state.to.startsWith('city:')) return new Set([state.to.slice(5)]);
  return REGIONS[state.to as RegionKey]?.cities ?? null;
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
    if (state.tripMode === 'loop' && !isLoop) return false;
    if (state.tripMode === 'oneway' && isLoop) return false;

    // FROM filter
    if (fromSet) {
      const { set: fromCitySet } = fromSet;
      if (state.flexFrom) {
        // Flexible: accept if the home area appears ANYWHERE in the route
        if (!c.route.some(city => fromCitySet.has(city))) return false;
      } else {
        // Strict: chain must DEPART from the home area (route[0])
        if (!fromCitySet.has(c.route[0])) return false;
      }
    }

    // "Ends at home" — inbound trips that finish in a home cluster
    if (state.endsAtHome && !c.homeDestination) return false;

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
    if (q) {
      // Searchable: route cities, countries, trip #ID, vehicle make/model —
      // everything the placeholder promises.
      const blob = (
        c.route.join(' ') + ' ' +
        (c.countries || []).join(' ') + ' ' +
        (c.tripId != null ? `#${c.tripId}` : '') + ' ' +
        c.legs.map(l => `${l.make || ''} ${l.model || ''}`).join(' ')
      ).toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  switch (state.sort) {
    case 'price':
      // Cheapest all-in: rental price first, fuel breaks ties.
      pool = [...pool].sort((a, b) =>
        chainPriceEur(a) - chainPriceEur(b) || chainFuelEur(a) - chainFuelEur(b));
      break;
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
    case 'spare':
      pool = [...pool].sort((a, b) => (b.spareKm ?? 0) - (a.spareKm ?? 0));
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
