// Client-side chain engine — replaces scripts/search.py.
//
// Runs the full DFS over raw Movacar offers in the browser, so every knob
// (max legs, max trip days, date window) is live: change a filter and the
// search re-runs in milliseconds. Nothing is pre-pruned at build time.
//
// Scheduling uses interval propagation instead of sampling: each chain gets
// an exact departure window [departFrom, departTo] and a trip-length range
// [minDays, maxDays], rather than a handful of 12h-grid date variants.
//
// Semantics carried over from the Python engine:
// - period_hours is a deadline, not a minimum hold: the next leg's pickup
//   can be GAP after this leg's pickup (early car return).
// - Same-area = within sameAreaKm great-circle. Offers carry exact station
//   coords; CITY_COORDS is only a fallback for legacy data.
// - Loop tiers: perfect ≤ perfectLoopKm, imperfect ≤ imperfectLoopKm.
// - Pass-throughs allowed: an area may appear at most twice in a route, so
//   "Köln → Milan → Düsseldorf → Hamburg" exists but ping-pong spam doesn't.

import type { Chain, Leg, TripData, Variant } from './chains';
import { CITY_COORDS, COUNTRY_OF } from './constants';

export type EngineParams = {
  maxLegs: number;          // 1..6
  maxTripDays: number;      // hard cap on a chain's MINIMUM possible duration
  gapHours: number;         // min hours between consecutive pickups
  sameAreaKm: number;       // chaining radius
  perfectLoopKm: number;
  imperfectLoopKm: number;
  passThrough: boolean;     // true: any area max 2 visits; false: only start area may repeat
  dateFrom?: string;        // ISO date — earliest departure
  dateTo?: string;          // ISO date — latest final dropoff
  maxLegPriceEur?: number;  // only chain offers at or below this price (1 = €1-only mode)
};

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  maxLegs: 6,
  maxTripDays: 21,
  gapHours: 24,
  sameAreaKm: 80,
  perfectLoopKm: 15,
  imperfectLoopKm: 100,
  passThrough: true,
};

export type EngineStats = {
  offers: number;
  eur1Offers: number;
  rawPaths: number;
  routes: number;
  perfectLoops: number;
  imperfectLoops: number;
  homeOrigin: number;
  truncated: boolean;
  ms: number;
};

export type EngineResult = { chains: Chain[]; stats: EngineStats };

// Guards so a pathological dense graph can't freeze the tab.
const MAX_RAW_PATHS = 60_000;
const MAX_EXPANSIONS = 600_000;

const HOME_CENTERS = ['Bochum', 'Hannover', 'München', 'Marburg'] as const;

const DAY_MS = 86_400_000;

type Coord = [number, number];

type Node = {
  offer: TripData['offers'][number];
  oCoord: Coord | null;
  dCoord: Coord | null;
  oName: string;          // normalized origin
  dName: string;          // normalized dest
  wStart: number;         // pickup window start (ms)
  wEnd: number;           // pickup window end (ms)
  durMs: number;          // period (deadline) in ms
};

function normalizeCity(name: string): string {
  if (name === 'Munich') return 'München';
  if (name === 'Cologne') return 'Köln';
  if (name === 'Vienna') return 'Wien';
  return name;
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function coordOf(lat?: number, lng?: number, name?: string): Coord | null {
  if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0) return [lat, lng];
  if (name) {
    const c = CITY_COORDS[name] ?? CITY_COORDS[normalizeCity(name)];
    if (c) return c;
  }
  return null;
}

/** Same area: identical normalized name, or within radius by coords. */
function sameArea(aName: string, aCoord: Coord | null, bName: string, bCoord: Coord | null, radiusKm: number): boolean {
  if (aName === bName) return true;
  if (aCoord && bCoord) return haversineKm(aCoord, bCoord) <= radiusKm;
  return false;
}

// ── Scheduling: interval propagation ─────────────────────────────────────────

type Schedule = {
  e: number[];       // earliest pickup per leg
  l: number[];       // latest pickup per leg
  minDays: number;   // shortest possible total trip
  maxDays: number;   // longest possible total trip
};

/**
 * Exact feasibility for a path of offers. Constraints:
 *   pickup_i ∈ [wStart_i, wEnd_i]
 *   pickup_{i+1} ≥ pickup_i + gap
 *   pickup_0 ≥ dateFrom (if set)
 *   pickup_last + dur_last ≤ dateTo (if set)
 * Returns null if infeasible.
 */
function schedulePath(path: Node[], gapMs: number, fromMs: number, toMs: number): Schedule | null {
  const n = path.length;
  const e = new Array<number>(n);
  const l = new Array<number>(n);

  e[0] = Math.max(path[0].wStart, fromMs);
  for (let i = 1; i < n; i++) e[i] = Math.max(path[i].wStart, e[i - 1] + gapMs);

  l[n - 1] = Math.min(path[n - 1].wEnd, toMs - path[n - 1].durMs);
  for (let i = n - 2; i >= 0; i--) l[i] = Math.min(path[i].wEnd, l[i + 1] - gapMs);

  for (let i = 0; i < n; i++) if (e[i] > l[i]) return null;

  // minDays: fix last pickup at its earliest, then push the first pickup as
  // late as that allows (backward pass anchored at e[last]).
  let latestStart = e[n - 1];
  for (let i = n - 2; i >= 0; i--) latestStart = Math.min(path[i].wEnd, latestStart - gapMs);
  const minDays = (e[n - 1] + path[n - 1].durMs - latestStart) / DAY_MS;
  const maxDays = (l[n - 1] + path[n - 1].durMs - e[0]) / DAY_MS;

  return { e, l, minDays, maxDays };
}

// ── Classification ────────────────────────────────────────────────────────────

const SOUTH_NAMES = new Set([
  'Milan', 'Milan / Castellanza', 'Bergamo', 'Bologna', 'Florence', 'Roma',
  'Turin', 'Venezia', 'Napoli', 'Genova', 'Palermo', 'Cagliari', 'Olbia',
  'Barcelona', 'Viladecans', 'Madrid', 'Sevilla', 'Bilbao', 'Zamudio',
  'A Coruña', 'Valencia', 'Porto', 'Lisbon',
  'Wiener Neudorf', 'Wien', 'Vienna', 'Salzburg', 'Graz', 'Hörsching',
  'Wiesing', 'Innsbruck', 'Zürich', 'Basel', 'Geneva', 'Bern',
  'Cabriès', 'Marseille', 'Nice', 'Montpellier', 'Nîmes', 'Avignon',
  'Aix-en-Provence', 'Toulouse',
]);

function homeOriginOf(coord: Coord | null, name: string, radiusKm: number): string | null {
  let best: { center: string; d: number } | null = null;
  for (const center of HOME_CENTERS) {
    if (normalizeCity(name) === center) return center;
    const cc = CITY_COORDS[center];
    if (!coord || !cc) continue;
    const d = haversineKm(coord, cc);
    if (d <= radiusKm && (!best || d < best.d)) best = { center, d };
  }
  return best ? best.center : null;
}

/** Like homeOriginOf but for the trip's final destination — flags inbound trips
 *  (e.g. Milan → Bochum) that are just as useful to a home user as outbound. */
function homeDestinationOf(coord: Coord | null, name: string, radiusKm: number): string | null {
  return homeOriginOf(coord, name, radiusKm);
}

function loopTierOf(
  startName: string, startCoord: Coord | null,
  endName: string, endCoord: Coord | null,
  p: EngineParams,
): { tier: 'perfect' | 'imperfect' | null; km: number | null } {
  if (normalizeCity(startName) === normalizeCity(endName)) return { tier: 'perfect', km: 0 };
  if (!startCoord || !endCoord) return { tier: null, km: null };
  const km = haversineKm(startCoord, endCoord);
  if (km <= p.perfectLoopKm) return { tier: 'perfect', km };
  if (km <= p.imperfectLoopKm) return { tier: 'imperfect', km };
  return { tier: null, km };
}

function scorePath(path: Node[], isLoop: boolean): number {
  let score = 100;
  score += path.length === 1 ? 15 : Math.min(path.length * 8, 30);
  const km = path.reduce((t, n) => t + (n.offer.distanceKm || 0), 0);
  score += Math.min(km / 200, 40);
  // Spare-km headroom: rewards trips with more free-km slack than the route
  // needs — these are more flexible (detours, side trips) and better value.
  const freeKm = path.reduce((t, n) => t + (n.offer.freeKm || 0), 0);
  const spareKm = freeKm - km;
  if (spareKm > 0) score += Math.min(spareKm / 200, 15);
  if (path.some(n => SOUTH_NAMES.has(n.offer.destName))) score += 20;
  if (isLoop) score += 10;
  // Price: the €1 premise is the product. A chain of €1 legs keeps its full
  // score; every paid leg drags it down (€99 leg ≈ -12), so cheap chains
  // float without banishing paid ones the user explicitly wants to see.
  const totalPrice = path.reduce((t, n) => t + (n.offer.priceEur ?? 1), 0);
  score -= Math.min(totalPrice / 8, 30);
  return score;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function runEngine(offers: TripData['offers'], params: EngineParams): EngineResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const p = params;
  const gapMs = p.gapHours * 3_600_000;
  const fromMs = p.dateFrom ? new Date(p.dateFrom).getTime() : -Infinity;
  const toMs = p.dateTo ? new Date(p.dateTo + 'T23:59:59Z').getTime() : Infinity;

  const nodes: Node[] = [];
  let eur1Offers = 0;
  for (const o of offers) {
    const wStart = new Date(o.startUtc).getTime();
    const wEnd = new Date(o.endUtc).getTime();
    if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) continue;
    if (p.maxLegPriceEur != null && (o.priceEur ?? 1) > p.maxLegPriceEur) continue;
    if ((o.priceEur ?? 1) <= 1) eur1Offers++;
    nodes.push({
      offer: o,
      oCoord: coordOf(o.originLat, o.originLng, o.originName),
      dCoord: coordOf(o.destLat, o.destLng, o.destName),
      oName: normalizeCity(o.originName),
      dName: normalizeCity(o.destName),
      wStart,
      wEnd,
      durMs: (o.periodHours || 72) * 3_600_000,
    });
  }

  // Static adjacency: b can follow a if a.dest ≈ b.origin and b's window
  // doesn't end before a could even start + gap.
  const nextOf: number[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const b = nodes[j];
      if (!sameArea(a.dName, a.dCoord, b.oName, b.oCoord, p.sameAreaKm)) continue;
      if (a.wStart + gapMs > b.wEnd) continue;
      nextOf[i].push(j);
    }
  }

  // DFS. Areas are anchored at the first coordinate (or name) seen; a later
  // city joins an anchor if within sameAreaKm. Visit caps:
  //   passThrough: every anchor ≤ 2
  //   strict:      start anchor ≤ 2 (loop close), others ≤ 1
  // Edge cap: each undirected area-pair may be traversed at most twice —
  // out-and-back loops survive, "same road three times" ping-pong doesn't.
  type Anchor = { name: string; coord: Coord | null; count: number };

  type RawPath = { idxs: number[]; sched: Schedule };
  const raw: RawPath[] = [];
  let expansions = 0;
  let truncated = false;

  const usedOffer = new Set<string>();

  function anchorIndexFor(anchors: Anchor[], name: string, coord: Coord | null): number {
    for (let k = 0; k < anchors.length; k++) {
      if (sameArea(anchors[k].name, anchors[k].coord, name, coord, p.sameAreaKm)) return k;
    }
    return -1;
  }

  function walk(idxs: number[], anchors: Anchor[], edges: Map<string, number>): void {
    if (raw.length >= MAX_RAW_PATHS || expansions >= MAX_EXPANSIONS) {
      truncated = true;
      return;
    }
    expansions++;

    const path = idxs.map(i => nodes[i]);
    const sched = schedulePath(path, gapMs, fromMs, toMs);
    // Infeasibility and minDays both only get worse with more legs — prune.
    if (!sched || sched.minDays > p.maxTripDays) return;
    raw.push({ idxs: [...idxs], sched });

    if (idxs.length >= p.maxLegs) return;

    for (const j of nextOf[idxs[idxs.length - 1]]) {
      const nxt = nodes[j];
      if (usedOffer.has(nxt.offer.offerId)) continue;

      // Next leg departs from the same area the last leg arrived in, so its
      // origin anchor always resolves.
      const oi = anchorIndexFor(anchors, nxt.oName, nxt.oCoord);
      const ai = anchorIndexFor(anchors, nxt.dName, nxt.dCoord);
      const isStartAnchor = ai === 0;
      const maxVisits = p.passThrough ? 2 : (isStartAnchor ? 2 : 1);
      if (ai >= 0 && anchors[ai].count >= maxVisits) continue;

      const di = ai >= 0 ? ai : anchors.length;
      const edgeKey = oi < di ? `${oi}-${di}` : `${di}-${oi}`;
      if ((edges.get(edgeKey) || 0) >= 2) continue;

      const nextAnchors = anchors.map(a => ({ ...a }));
      if (ai >= 0) nextAnchors[ai].count++;
      else nextAnchors.push({ name: nxt.dName, coord: nxt.dCoord, count: 1 });
      const nextEdges = new Map(edges);
      nextEdges.set(edgeKey, (nextEdges.get(edgeKey) || 0) + 1);

      usedOffer.add(nxt.offer.offerId);
      idxs.push(j);
      walk(idxs, nextAnchors, nextEdges);
      idxs.pop();
      usedOffer.delete(nxt.offer.offerId);
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (raw.length >= MAX_RAW_PATHS || expansions >= MAX_EXPANSIONS) { truncated = true; break; }
    const n = nodes[i];
    const anchors: Anchor[] = [{ name: n.oName, coord: n.oCoord, count: 1 }];
    const ai = anchorIndexFor(anchors, n.dName, n.dCoord);
    if (ai >= 0) anchors[ai].count++;
    else anchors.push({ name: n.dName, coord: n.dCoord, count: 1 });
    const di = ai >= 0 ? ai : anchors.length - 1;
    const edges = new Map<string, number>([[di === 0 ? '0-0' : `0-${di}`, 1]]);
    usedOffer.add(n.offer.offerId);
    walk([i], anchors, edges);
    usedOffer.delete(n.offer.offerId);
  }

  // ── Group by route, build Chain objects ────────────────────────────────────
  const byRoute = new Map<string, RawPath[]>();
  for (const r of raw) {
    const cities = [nodes[r.idxs[0]].oName, ...r.idxs.map(i => nodes[i].dName)];
    const key = cities.join(' → ');
    const arr = byRoute.get(key);
    if (arr) arr.push(r);
    else byRoute.set(key, [r]);
  }

  const chains: Chain[] = [];
  let perfectLoops = 0, imperfectLoops = 0, homeCount = 0;

  for (const group of byRoute.values()) {
    // Canonical = the offer-sequence with the widest departure window,
    // tie-break earliest departure.
    group.sort((a, b) =>
      (b.sched.l[0] - b.sched.e[0]) - (a.sched.l[0] - a.sched.e[0]) ||
      a.sched.e[0] - b.sched.e[0]);
    const best = group[0];
    const path = best.idxs.map(i => nodes[i]);
    const first = path[0];
    const lastN = path[path.length - 1];

    const route = [first.offer.originName, ...path.map(n => n.offer.destName)];
    const { tier, km: seKm } = path.length >= 2
      ? loopTierOf(first.offer.originName, first.oCoord, lastN.offer.destName, lastN.dCoord, p)
      : { tier: null, km: null };
    const homeOrigin = homeOriginOf(first.oCoord, first.offer.originName, p.sameAreaKm);
    const homeDestination = homeDestinationOf(lastN.dCoord, lastN.offer.destName, p.sameAreaKm);
    const isLoop = !!tier;

    const legs: Leg[] = path.map((n, i) => ({
      originName: n.offer.originName,
      destName: n.offer.destName,
      pickup: new Date(best.sched.e[i]).toISOString(),
      dropoff: new Date(best.sched.e[i] + n.durMs).toISOString(),
      vehicle: `${n.offer.make || ''} ${n.offer.model || ''}`.trim(),
      make: n.offer.make,
      model: n.offer.model,
      distanceKm: n.offer.distanceKm || 0,
      offerId: n.offer.offerId,
      priceEur: n.offer.priceEur,
    }));

    const routeKm = path.reduce((t, n) => t + (n.offer.distanceKm || 0), 0);
    const freeKm = path.reduce((t, n) => t + (n.offer.freeKm || 0), 0);
    const totalPriceEur = path.reduce((t, n) => t + (n.offer.priceEur ?? 1), 0);
    const allEur1 = path.every(n => (n.offer.priceEur ?? 1) <= 1);

    const variants: Variant[] = group.map(g => {
      const gp = g.idxs.map(i => nodes[i]);
      const endMs = g.sched.e[gp.length - 1] + gp[gp.length - 1].durMs;
      return {
        startUtc: new Date(g.sched.e[0]).toISOString(),
        endUtc: new Date(endMs).toISOString(),
        departTo: new Date(g.sched.l[0]).toISOString(),
        pickups: g.sched.e.map(ms => new Date(ms).toISOString()),
        dropoffs: g.sched.e.map((ms, i) => new Date(ms + gp[i].durMs).toISOString()),
        offerIds: gp.map(n => n.offer.offerId),
        days: g.sched.minDays,
        minDays: g.sched.minDays,
        maxDays: g.sched.maxDays,
      };
    });
    variants.sort((a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime());

    const countries: string[] = [];
    for (const city of route) {
      const co = COUNTRY_OF[city] || COUNTRY_OF[normalizeCity(city)];
      if (co && !countries.includes(co)) countries.push(co);
    }

    const endMs = best.sched.e[path.length - 1] + lastN.durMs;
    const chain: Chain = {
      score: scorePath(path, isLoop),
      route,
      legs,
      type: isLoop ? 'loop' : 'oneway',
      isLoop,
      loopTier: tier,
      startEndKm: seKm,
      homeOrigin,
      ...(homeOrigin ? { homeCity: homeOrigin } : {}),
      homeDestination,
      startUtc: new Date(best.sched.e[0]).toISOString(),
      endUtc: new Date(endMs).toISOString(),
      departFrom: new Date(best.sched.e[0]).toISOString(),
      departTo: new Date(best.sched.l[0]).toISOString(),
      minDays: best.sched.minDays,
      maxDays: Math.min(best.sched.maxDays, p.maxTripDays),
      days: best.sched.minDays,
      routeKm,
      freeKm,
      spareKm: freeKm - routeKm,
      driveHours: routeKm / 85,
      countries,
      coords: [first.oCoord, ...path.map(n => n.dCoord)],
      variants,
      totalPriceEur: Math.round(totalPriceEur * 100) / 100,
      allEur1,
    };
    chains.push(chain);
    if (tier === 'perfect') perfectLoops++;
    if (tier === 'imperfect') imperfectLoops++;
    if (homeOrigin) homeCount++;
  }

  chains.sort((a, b) => b.score - a.score);
  chains.forEach((c, i) => { c.tripId = i + 1; });

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    chains,
    stats: {
      offers: nodes.length,
      eur1Offers,
      rawPaths: raw.length,
      routes: chains.length,
      perfectLoops,
      imperfectLoops,
      homeOrigin: homeCount,
      truncated,
      ms: Math.round(t1 - t0),
    },
  };
}
