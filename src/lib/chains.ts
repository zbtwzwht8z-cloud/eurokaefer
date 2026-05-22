// Pure helpers for working with chain objects from trip-data.ts.
// No DOM, no React — used by both server and client code.

import { COUNTRY_OF, ICE_RETURN } from './constants';

export type Leg = {
  originName: string;
  destName: string;
  pickup: string;        // ISO datetime
  dropoff: string;       // ISO datetime
  vehicle?: string;
  make?: string;
  model?: string;
  distanceKm: number;
  offerId: string;
};

export type Chain = {
  tripId?: number;       // assigned client-side after dedup
  homeCity?: string;     // 'Bochum' | 'Hannover' | 'München' — tagged by pipeline
  score: number;
  route: string[];       // city names, length = legs.length + 1
  legs: Leg[];
  type: 'loop' | 'oneway' | 'inbound' | 'nrw_start' | 'nrw_end' | 'nrw_mid';
  startUtc: string;
  endUtc: string;
  days: number;
  routeKm: number;
  freeKm?: number;
  spareKm?: number;
  driveHours?: number;
  countries?: string[];
  appointment?: string;
  endType?: string;
};

export type TripData = {
  meta: {
    generated: string;
    offerCount: number;
    recommendedCount: number;
  };
  offers: Array<{
    offerId: string;
    originName: string;
    destName: string;
    startUtc: string;
    endUtc: string;
    periodHours: number;
    distanceKm: number;
    freeKm: number;
    make: string;
    model: string;
    homeCity?: string;
  }>;
  recommended: Chain[];
};

// ── Fuel + drive estimates ────────────────────────────────────────────────────

const FUEL_PRICE_EUR_PER_L = 1.75;
const FUEL_CONSUMPTION_L_PER_100KM = 11;       // VW Crafter / Transit average
const AVG_SPEED_KPH = 85;

export function chainFuelEur(c: Chain): number {
  const km = c.routeKm ?? c.legs.reduce((t, l) => t + (l.distanceKm || 0), 0);
  return (km * FUEL_CONSUMPTION_L_PER_100KM / 100) * FUEL_PRICE_EUR_PER_L;
}

export function chainDriveHours(c: Chain): number {
  if (c.driveHours) return c.driveHours;
  const km = c.routeKm ?? c.legs.reduce((t, l) => t + (l.distanceKm || 0), 0);
  return km / AVG_SPEED_KPH;
}

// ── Trip key (stable identifier for highlights / messages) ────────────────────

export function tripKey(c: Chain): string {
  return c.route.join(' → ') + '|' + c.legs.map(l => l.offerId).join(',');
}

// ── ICE return city ───────────────────────────────────────────────────────────

export function endsInIceCity(c: Chain): { ok: boolean; label?: string } {
  const dest = c.route[c.route.length - 1];
  const label = ICE_RETURN[dest];
  return { ok: !!label, label };
}

// ── Countries inferred from route ─────────────────────────────────────────────

export function countriesOfChain(c: Chain): string[] {
  if (c.countries?.length) return c.countries;
  const seen: string[] = [];
  for (const city of c.route) {
    const co = COUNTRY_OF[city];
    if (co && !seen.includes(co)) seen.push(co);
  }
  return seen;
}

// ── Synthetic 1-leg chain from a raw offer ────────────────────────────────────

export function singleLegChainFromOffer(o: TripData['offers'][number]): Chain {
  return {
    score: 60,
    route: [o.originName, o.destName],
    legs: [{
      originName: o.originName,
      destName: o.destName,
      pickup: o.startUtc,
      dropoff: o.endUtc,
      vehicle: o.make ? `${o.make} ${o.model}`.trim() : o.model,
      make: o.make,
      model: o.model,
      distanceKm: o.distanceKm,
      offerId: o.offerId,
    }],
    type: 'oneway',
    homeCity: o.homeCity,
    startUtc: o.startUtc,
    endUtc: o.endUtc,
    days: (o.endUtc && o.startUtc)
      ? (new Date(o.endUtc).getTime() - new Date(o.startUtc).getTime()) / 86_400_000
      : 1,
    routeKm: o.distanceKm,
    freeKm: o.freeKm,
    spareKm: (o.freeKm || 0) - (o.distanceKm || 0),
    driveHours: o.distanceKm / AVG_SPEED_KPH,
    countries: undefined,
  };
}

// ── Build the master chain list (loops + recommended + synthetic singles) ─────

export function buildAllChains(data: TripData): Chain[] {
  const all: Chain[] = [];

  // 1) Single-leg synthetic chains from raw offers
  for (const o of data.offers) {
    all.push(singleLegChainFromOffer(o));
  }

  // 2) Recommended (multi-leg) chains from the algorithm
  for (const c of data.recommended) {
    all.push(c);
  }

  // Dedup by tripKey, keep highest-score variant
  const byKey = new Map<string, Chain>();
  for (const c of all) {
    const k = tripKey(c);
    const existing = byKey.get(k);
    if (!existing || existing.score < c.score) byKey.set(k, c);
  }

  const final = [...byKey.values()].sort((a, b) => b.score - a.score);
  final.forEach((c, i) => { c.tripId = i + 1; });
  return final;
}
