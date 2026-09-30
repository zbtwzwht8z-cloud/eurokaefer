// Chain engine: turns single Movacar offers into multi-leg road trips.
//
// Runs in the browser, so legs / trip length / dates / price are live knobs.
// ~200 offers → ~2,500 routes (7,000+ car/date variants) in a few ms.
//
// Model
// - Offer = pickup window [start, end] + `periodHours` to drop the car off.
//   Returning early is fine, so leg i+1 may be picked up `gapHours` after
//   leg i's pickup (not after its deadline).
// - Legs chain when leg i's destination and leg i+1's origin are the same
//   place or within `sameAreaKm` (you take a train/bus across town).
// - Scheduling is exact interval propagation: every chain gets a precise
//   departure window and min/max total duration, not sampled dates.
// - Anti-spam: an area may be visited at most twice and a road (area pair)
//   driven at most twice, so out-and-back loops exist but ping-pong doesn't.
//
// Performance: stations get integer ids and a precomputed "same area"
// matrix; the DFS mutates-and-undoes its state instead of copying it; and
// variants keep raw schedules — their legs are only built when opened.

import type { Chain, Coord, LoopTier, Offer, Variant } from './types';
import { variantLegs } from './types';
import { haversineKm } from './geo';

export type EngineParams = {
  maxLegs: number;
  maxTripDays: number;     // cap on a chain's shortest possible duration
  gapHours: number;        // min hours between consecutive pickups
  sameAreaKm: number;      // max hop between a drop-off and the next pickup
  perfectLoopKm: number;
  nearLoopKm: number;
  eur1Only: boolean;
  dateFrom?: string;       // yyyy-mm-dd, earliest departure
  dateTo?: string;         // yyyy-mm-dd, latest final drop-off
  nowMs: number;           // nothing may depart before now
};

export const DEFAULT_ENGINE: Omit<EngineParams, 'nowMs'> = {
  maxLegs: 6,
  maxTripDays: 21,
  gapHours: 24,
  sameAreaKm: 80,
  perfectLoopKm: 15,
  nearLoopKm: 100,
  eur1Only: false,
};

export type EngineStats = {
  offers: number;
  eur1Offers: number;
  routes: number;
  loops: number;
  truncated: boolean;
  ms: number;
};

export type EngineResult = { chains: Chain[]; stats: EngineStats };

// Guards so a pathological dense feed can't freeze the tab.
const MAX_RAW_PATHS = 60_000;
const MAX_EXPANSIONS = 600_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const EDGE_SLOTS = 9;      // anchor ids -1..7 → 0..8

type Node = {
  offer: Offer;
  o: number;               // origin station id
  d: number;               // destination station id
  wStart: number;
  wEnd: number;
  durMs: number;
};

type Raw = { idxs: number[]; e: number[]; l: number[]; minDays: number; maxDays: number };

function loopOf(first: Offer, last: Offer, p: EngineParams): { tier: LoopTier | null; km: number | null } {
  const km = first.originName === last.destName ? 0 : haversineKm(first.origin, last.dest);
  if (km <= p.perfectLoopKm) return { tier: 'perfect', km };
  if (km <= p.nearLoopKm) return { tier: 'near', km };
  return { tier: null, km };
}

function scoreOf(offers: Offer[], tier: LoopTier | null): number {
  let score = 100;
  score += Math.min(offers.length * 8, 30);                     // chaining is the point
  let km = 0, free = 0, price = 0, paidLegs = 0;
  for (const o of offers) {
    km += o.distanceKm; free += o.freeKm; price += o.priceEur;
    if (o.priceEur > 1) paidLegs++;
  }
  score += Math.min(km / 200, 40);                              // distance covered
  if (free > km) score += Math.min((free - km) / 200, 15);      // detour headroom
  if (tier === 'perfect') score += 18;
  else if (tier === 'near') score += 12;
  // Price dominates: each paid leg costs more than every bonus above
  // combined (max ≈ 103), so "Best" ranks by fewest paid legs first and
  // only then by how much trip you get.
  score -= paidLegs * 110 + Math.min(price / 100, 10);
  return score;
}

export function runEngine(offers: Offer[], p: EngineParams): EngineResult {
  const t0 = performance.now();
  const gapMs = p.gapHours * HOUR_MS;
  const fromMs = Math.max(p.nowMs, p.dateFrom ? new Date(p.dateFrom).getTime() : -Infinity);
  const toMs = p.dateTo ? new Date(p.dateTo + 'T23:59:59Z').getTime() : Infinity;

  // ── Stations → ids, and an S×S "same area" matrix ────────────────────────
  const stationIds = new Map<string, number>();
  const stName: string[] = [];
  const stCoord: Coord[] = [];
  const station = (name: string, c: Coord) => {
    const k = `${name}|${c[0]},${c[1]}`;
    let id = stationIds.get(k);
    if (id === undefined) {
      id = stName.length;
      stationIds.set(k, id);
      stName.push(name);
      stCoord.push(c);
    }
    return id;
  };

  const nodes: Node[] = [];
  let eur1Offers = 0;
  for (const o of offers) {
    if (o.priceEur <= 1) eur1Offers++;
    if (p.eur1Only && o.priceEur > 1) continue;
    const wStart = Date.parse(o.startUtc);
    const wEnd = Date.parse(o.endUtc);
    if (!Number.isFinite(wStart) || !Number.isFinite(wEnd) || wEnd < fromMs) continue;
    nodes.push({
      offer: o,
      o: station(o.originName, o.origin),
      d: station(o.destName, o.dest),
      wStart, wEnd,
      durMs: o.periodHours * HOUR_MS,
    });
  }

  const S = stName.length;
  const near = new Uint8Array(S * S);
  for (let a = 0; a < S; a++) {
    near[a * S + a] = 1;
    for (let b = a + 1; b < S; b++) {
      const same = stName[a] === stName[b] || haversineKm(stCoord[a], stCoord[b]) <= p.sameAreaKm;
      if (same) near[a * S + b] = near[b * S + a] = 1;
    }
  }

  // b can follow a if a's drop-off is near b's pickup and b's window
  // doesn't close before a could even start + gap.
  const N = nodes.length;
  const next: number[][] = nodes.map(() => []);
  for (let i = 0; i < N; i++) {
    const a = nodes[i];
    for (let j = 0; j < N; j++) {
      if (i !== j && near[a.d * S + nodes[j].o] && a.wStart + gapMs <= nodes[j].wEnd) next[i].push(j);
    }
  }

  // ── DFS over offer paths (mutate + undo, no per-step copies) ─────────────
  const raw: Raw[] = [];
  let expansions = 0;
  let truncated = false;
  const idxs: number[] = [];
  const used = new Uint8Array(N);
  const anchors: number[] = [];                       // station id per area
  const counts: number[] = [];                        // visits per area
  const edges = new Uint8Array(EDGE_SLOTS * EDGE_SLOTS);
  const edgeKey = (a: number, b: number) =>
    a < b ? (a + 1) * EDGE_SLOTS + (b + 1) : (b + 1) * EDGE_SLOTS + (a + 1);
  const anchorOf = (st: number) => {
    for (let k = 0; k < anchors.length; k++) if (near[anchors[k] * S + st]) return k;
    return -1;
  };

  function schedule(): Raw | null {
    const n = idxs.length;
    const e = new Array<number>(n);
    const l = new Array<number>(n);
    e[0] = Math.max(nodes[idxs[0]].wStart, fromMs);
    for (let i = 1; i < n; i++) e[i] = Math.max(nodes[idxs[i]].wStart, e[i - 1] + gapMs);
    const last = nodes[idxs[n - 1]];
    l[n - 1] = Math.min(last.wEnd, toMs - last.durMs);
    for (let i = n - 2; i >= 0; i--) l[i] = Math.min(nodes[idxs[i]].wEnd, l[i + 1] - gapMs);
    for (let i = 0; i < n; i++) if (e[i] > l[i]) return null;
    // Shortest trip: last pickup as early as possible, first pickup as late
    // as that allows. Longest: first pickup earliest, last pickup latest.
    let latestStart = e[n - 1];
    for (let i = n - 2; i >= 0; i--) latestStart = Math.min(nodes[idxs[i]].wEnd, latestStart - gapMs);
    return {
      idxs: idxs.slice(), e, l,
      minDays: (e[n - 1] + last.durMs - latestStart) / DAY_MS,
      maxDays: (l[n - 1] + last.durMs - e[0]) / DAY_MS,
    };
  }

  function walk(): void {
    if (raw.length >= MAX_RAW_PATHS || expansions >= MAX_EXPANSIONS) { truncated = true; return; }
    expansions++;
    const r = schedule();
    // Infeasibility and minDays only get worse with more legs → prune.
    if (!r || r.minDays > p.maxTripDays) return;
    raw.push(r);
    if (idxs.length >= p.maxLegs) return;

    for (const j of next[idxs[idxs.length - 1]]) {
      if (used[j]) continue;
      const nd = nodes[j];
      const oi = anchorOf(nd.o);
      const di = anchorOf(nd.d);
      if (di >= 0 && counts[di] >= 2) continue;
      const target = di >= 0 ? di : anchors.length;
      const ek = edgeKey(oi, target);
      if (edges[ek] >= 2) continue;

      if (di >= 0) counts[di]++; else { anchors.push(nd.d); counts.push(1); }
      edges[ek]++; used[j] = 1; idxs.push(j);
      walk();
      idxs.pop(); used[j] = 0; edges[ek]--;
      if (di >= 0) counts[di]--; else { anchors.pop(); counts.pop(); }
    }
  }

  for (let i = 0; i < N && !truncated; i++) {
    const nd = nodes[i];
    anchors.push(nd.o); counts.push(1);
    const di = anchorOf(nd.d);
    if (di >= 0) counts[di]++; else { anchors.push(nd.d); counts.push(1); }
    const ek = edgeKey(0, di >= 0 ? di : 1);
    edges[ek]++; used[i] = 1; idxs.push(i);
    walk();
    idxs.pop(); used[i] = 0; edges[ek]--;
    anchors.length = 0; counts.length = 0;
  }

  // ── Group offer paths by route → one Chain per route ─────────────────────
  const byRoute = new Map<string, Raw[]>();
  for (const r of raw) {
    let key = nodes[r.idxs[0]].offer.originName;
    for (const i of r.idxs) key += ' → ' + nodes[i].offer.destName;
    const group = byRoute.get(key);
    if (group) group.push(r); else byRoute.set(key, [r]);
  }

  const chains: Chain[] = [];
  let loops = 0;
  for (const [key, group] of byRoute) {
    const variants: Variant[] = group.map(r => {
      const vo = r.idxs.map(i => nodes[i].offer);
      let price = 0;
      for (const o of vo) price += o.priceEur;
      return {
        offers: vo, e: r.e, l: r.l,
        departFrom: r.e[0], departTo: r.l[0],
        minDays: r.minDays, maxDays: Math.min(r.maxDays, p.maxTripDays),
        priceEur: Math.round(price * 100) / 100,
      };
    });
    variants.sort((a, b) => a.departFrom - b.departFrom);
    // Canonical = widest departure window, then earliest departure.
    let canonical = 0;
    for (let i = 1; i < variants.length; i++) {
      const w = variants[i].departTo - variants[i].departFrom;
      const bw = variants[canonical].departTo - variants[canonical].departFrom;
      if (w > bw) canonical = i;
    }
    const best = variants[canonical];
    const vo = best.offers;
    const { tier, km } = vo.length >= 2 ? loopOf(vo[0], vo[vo.length - 1], p) : { tier: null, km: null };
    if (tier) loops++;

    let routeKm = 0, freeKm = 0;
    for (const o of vo) { routeKm += o.distanceKm; freeKm += o.freeKm; }
    chains.push({
      key,
      route: [vo[0].originName, ...vo.map(o => o.destName)],
      coords: [vo[0].origin, ...vo.map(o => o.dest)],
      legs: variantLegs(best),
      isLoop: tier !== null,
      loopTier: tier,
      loopGapKm: km,
      departFrom: best.departFrom,
      departTo: best.departTo,
      minDays: best.minDays,
      maxDays: best.maxDays,
      routeKm,
      freeKm,
      priceEur: best.priceEur,
      allEur1: vo.every(o => o.priceEur <= 1),
      score: scoreOf(vo, tier),
      variants,
      canonical,
    });
  }
  chains.sort((a, b) => b.score - a.score);

  return {
    chains,
    stats: {
      offers: nodes.length,
      eur1Offers,
      routes: chains.length,
      loops,
      truncated,
      ms: Math.round(performance.now() - t0),
    },
  };
}
