// Live Movacar feed. Replaces the old Python fetch → CSV → committed
// trip-data.ts → redeploy pipeline (6h cron, 4-minute manual refresh).
//
// The page is ISR (see app/page.tsx): visitors always get an instant static
// page, and Next re-fetches this feed in the background at most every
// REVALIDATE_SECONDS. If a background re-fetch fails we throw, and ISR keeps
// serving the last good page instead of replacing it with an error.
//
// API notes (verified 2026-09):
// - One `?size=1000` request returns the whole live inventory (~250 offers).
//   `?page=N` is ignored by the API; origin-scoped queries add nothing.
// - JSON:API shape: offers in `data`, stations + prices in `included`.

import type { Coord, Offer, OfferFeed } from './types';
import { resolvePlace } from './places';

export const REVALIDATE_SECONDS = 600;

const API = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/offers';
const WINDOW_DAYS = 90;

type JsonApiRef = { data?: { id?: string; type?: string } | null };
type RawOffer = {
  id: string;
  attributes: Record<string, unknown>;
  relationships: { origin?: JsonApiRef; destination?: JsonApiRef; base_price?: JsonApiRef };
};
type RawIncluded = { id: string; type: string; attributes: Record<string, unknown> };

const BRANDS: Record<string, string> = {
  roadsurfer: 'Roadsurfer',
  sixtlogo: 'Sixt',
  camperhuren: 'Camperhuren',
};

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function brandFromLogo(url?: string): string | undefined {
  if (!url) return undefined;
  const file = url.split('/').pop()?.replace(/\.\w+$/, '').toLowerCase() ?? '';
  if (!file) return undefined;
  return BRANDS[file] ?? file.charAt(0).toUpperCase() + file.slice(1);
}

/** Pure parser — exported for the snapshot/sanity scripts. */
export function parseFeed(json: { data?: RawOffer[]; included?: RawIncluded[] }, nowMs: number): Offer[] {
  const stations = new Map<string, Record<string, unknown>>();
  const prices = new Map<string, number>();
  for (const inc of json.included ?? []) {
    if (inc.type === 'station') stations.set(inc.id, inc.attributes);
    else if (inc.type === 'monetary_amount') {
      const cents = num(inc.attributes.amount_minor_units);
      if (cents != null) prices.set(inc.id, cents);
    }
  }

  const offers: Offer[] = [];
  for (const raw of json.data ?? []) {
    const a = raw.attributes;
    const o = stations.get(raw.relationships.origin?.data?.id ?? '');
    const d = stations.get(raw.relationships.destination?.data?.id ?? '');
    const cents = prices.get(raw.relationships.base_price?.data?.id ?? '');
    if (!o || !d || cents == null) continue;

    const oLat = num(o.latitude), oLng = num(o.longitude);
    const dLat = num(d.latitude), dLng = num(d.longitude);
    if (oLat == null || oLng == null || dLat == null || dLng == null) continue;

    const startUtc = str(a.start_date), endUtc = str(a.end_date);
    if (!startUtc || !endUtc) continue;
    // Pickup window already closed → nobody can book it.
    if (new Date(endUtc).getTime() < nowMs) continue;

    const origin: Coord = [oLat, oLng];
    const dest: Coord = [dLat, dLng];
    const op = resolvePlace(str(o.city) ?? 'Unknown', str(o.alternative_city), origin);
    const dp = resolvePlace(str(d.city) ?? 'Unknown', str(d.alternative_city), dest);
    offers.push({
      id: raw.id,
      offerId: String(a.offer_id ?? raw.id),
      refkey: str(a.refkey) ?? String(a.offer_id ?? raw.id),
      originName: op.name,
      destName: dp.name,
      originTown: op.town,
      destTown: dp.town,
      originCountry: op.country,
      destCountry: dp.country,
      origin,
      dest,
      originStreet: str(o.street),
      destStreet: str(d.street),
      startUtc,
      endUtc,
      periodHours: num(a.period) ?? 72,
      distanceKm: Math.round((num(a.distance) ?? 0) / 100) / 10,
      freeKm: num(a.free_km) ?? 0,
      extraKmCents: num(a.cents_per_extra_km),
      priceEur: cents / 100,
      model: str(a.model) ?? str(a.vehicle_category_name) ?? 'Vehicle',
      brand: brandFromLogo(str(a.brand_image_url)),
      imageUrl: str(a.vehicle_image_url),
      sleeps: num(a.sleeping),
      seats: num(a.seats),
    });
  }
  return dedupRouteDay(offers);
}

/**
 * One representative per (origin station, destination station, pickup day):
 * cheapest first, then most free km. The same route on the same day with
 * several identical vans would otherwise multiply every chain through it.
 */
function dedupRouteDay(offers: Offer[]): Offer[] {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const key = `${o.origin.join(',')}|${o.dest.join(',')}|${o.startUtc.slice(0, 10)}`;
    const cur = best.get(key);
    if (!cur || o.priceEur < cur.priceEur || (o.priceEur === cur.priceEur && o.freeKm > cur.freeKm)) {
      best.set(key, o);
    }
  }
  return [...best.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

export function feedUrl(now = new Date()): string {
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return `${API}?pickupDateFrom=${from}&pickupDateTo=${to}&size=1000`;
}

export async function getOfferFeed(): Promise<OfferFeed> {
  const now = new Date();
  try {
    const res = await fetch(feedUrl(now), {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`Movacar API responded ${res.status}`);
    const offers = parseFeed(await res.json(), now.getTime());
    return { offers, generated: now.toISOString() };
  } catch (err) {
    // During a background revalidation, throwing keeps the last good page.
    // Only the very first build has no good page to fall back to.
    if (process.env.NEXT_PHASE !== 'phase-production-build') throw err;
    return {
      offers: [],
      generated: now.toISOString(),
      error: err instanceof Error ? err.message : 'Movacar API unreachable',
    };
  }
}
