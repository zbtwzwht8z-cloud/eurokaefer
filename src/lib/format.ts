// Display formatting. Every Movacar station is in Central/Western Europe, so
// times are pinned to Europe/Berlin — which also makes the server render
// and the browser agree (no hydration flicker).

const TZ = 'Europe/Berlin';
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
const WDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const PARTS = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ });
const NUM = new Intl.NumberFormat('en-GB');

function ymd(d: Date): { day: string; month: string; year: string } {
  const p = Object.fromEntries(PARTS.formatToParts(d).map(x => [x.type, x.value]));
  return { day: p.day, month: p.month, year: p.year };
}

type When = string | number;
export const fmtDay = (t: When) => DAY.format(new Date(t));
export const fmtWeekday = (t: When) => WDAY.format(new Date(t));
export const fmtTime = (t: When) => TIME.format(new Date(t));
export const fmtNum = (n: number) => NUM.format(Math.round(n));
export const fmtKm = (km: number) => `${NUM.format(Math.round(km))} km`;

export function fmtEur(eur: number): string {
  return Number.isInteger(eur) ? `€${NUM.format(eur)}` : `€${eur.toFixed(2)}`;
}

/** "2 Oct" or "2 – 5 Oct" or "30 Sep – 3 Oct". */
export function fmtWindow(from: When, to: When): string {
  const a = new Date(from), b = new Date(to);
  const da = DAY.format(a), db = DAY.format(b);
  if (da === db) return da;
  const pa = ymd(a), pb = ymd(b);
  if (pa.month === pb.month && pa.year === pb.year) return `${pa.day} – ${db}`;
  return `${da} – ${db}`;
}

function roundDays(n: number): number {
  return Math.max(1, Math.round(n));
}

/** "4 days" or "4–9 days". */
export function fmtDays(min: number, max: number): string {
  const a = roundDays(min), b = roundDays(max);
  return a === b ? `${a} day${a === 1 ? '' : 's'}` : `${a}–${b} days`;
}

export function fmtAgo(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// Campervan ballpark: ~11 L/100 km diesel at ~€1.75/L.
export const fuelEur = (km: number) => (km * 11 / 100) * 1.75;
export const driveHours = (km: number) => km / 80;
