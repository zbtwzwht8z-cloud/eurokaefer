// Shared data shapes. Pure types — safe on server and client.

export type Coord = [number, number]; // [lat, lng]

/** One Movacar relocation offer, normalized from the JSON:API response. */
export type Offer = {
  id: string;             // JSON:API id (unique per offer+route)
  offerId: string;        // Movacar offer number
  refkey: string;         // reference shown in Movacar's own UI
  originName: string;     // display place, e.g. "Barcelona"
  destName: string;
  originTown: string;     // Movacar's station town, e.g. "Viladecans"
  destTown: string;
  originCountry: string;  // ISO 3166-1 alpha-2, '' if unknown
  destCountry: string;
  origin: Coord;
  dest: Coord;
  originStreet?: string;
  destStreet?: string;
  startUtc: string;       // pickup window opens
  endUtc: string;         // pickup window closes
  periodHours: number;    // hours allowed from pickup to drop-off
  distanceKm: number;
  freeKm: number;
  extraKmCents?: number;
  priceEur: number;
  model: string;
  brand?: string;         // rental company, e.g. Roadsurfer
  imageUrl?: string;
  sleeps?: number;
  seats?: number;
};

export type OfferFeed = {
  offers: Offer[];
  generated: string;      // ISO time the feed was fetched
  error?: string;         // set when the live API could not be reached
};

export type Leg = {
  offer: Offer;
  pickup: number;         // earliest feasible pickup for this leg (epoch ms)
  pickupLatest: number;   // latest feasible pickup for this leg (epoch ms)
  dropoff: number;        // deadline if picked up at `pickup` (epoch ms)
};

/**
 * One concrete offer-sequence (cars + dates) for a route. Legs are built
 * lazily with `variantLegs` — most variants are never opened.
 */
export type Variant = {
  offers: Offer[];
  e: number[];            // earliest pickup per leg (epoch ms)
  l: number[];            // latest pickup per leg (epoch ms)
  departFrom: number;
  departTo: number;
  minDays: number;
  maxDays: number;
  priceEur: number;
};

export type LoopTier = 'perfect' | 'near';

export type Chain = {
  key: string;            // stable route key: "Köln → Milano → Köln"
  route: string[];        // city names, legs.length + 1
  coords: Coord[];        // exact station coords per stop
  legs: Leg[];
  isLoop: boolean;
  loopTier: LoopTier | null;
  loopGapKm: number | null;   // distance between start and end
  departFrom: number;     // epoch ms
  departTo: number;
  minDays: number;
  maxDays: number;
  routeKm: number;
  freeKm: number;
  priceEur: number;
  allEur1: boolean;
  score: number;
  variants: Variant[];    // sorted by departure; variants[canonical] is `legs`
  canonical: number;
};

export function variantLegs(v: Variant): Leg[] {
  return v.offers.map((offer, i) => ({
    offer,
    pickup: v.e[i],
    pickupLatest: v.l[i],
    dropoff: v.e[i] + offer.periodHours * 3_600_000,
  }));
}
