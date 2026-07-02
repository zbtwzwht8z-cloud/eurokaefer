// Sanity-run the client-side engine against data/movacar_offers.csv.
// Usage: npx tsx scripts/engine-sanity.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runEngine, DEFAULT_ENGINE_PARAMS } from '../src/lib/engine';
import type { TripData } from '../src/lib/chains';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const csv = parseCsv(readFileSync(join(ROOT, 'data', 'movacar_offers.csv'), 'utf-8'));
const offers: TripData['offers'] = csv
  .map(r => ({
    offerId: r.offer_id,
    originName: r.origin_name,
    destName: r.destination_name,
    originLat: parseFloat(r.origin_lat) || undefined,
    originLng: parseFloat(r.origin_lng) || undefined,
    destLat: parseFloat(r.dest_lat) || undefined,
    destLng: parseFloat(r.dest_lng) || undefined,
    startUtc: r.start_date_utc,
    endUtc: r.end_date_utc,
    periodHours: parseFloat(r.period_hours) || 72,
    distanceKm: parseFloat(r.distance_km) || 0,
    freeKm: parseFloat(r.free_km) || 0,
    make: r.make,
    model: r.model,
    priceEur: parseFloat(r.price_eur) || 0,
  }));

const eur1Count = offers.filter(o => (o.priceEur ?? 1) <= 1).length;
console.log(`${offers.length} offers loaded (${eur1Count} at €1)`);

for (const priceMode of ['€1-only', 'all-prices'] as const) {
  const maxLegPriceEur = priceMode === '€1-only' ? 1 : undefined;
  for (const maxDays of [14, 21, 365]) {
    const res = runEngine(offers, { ...DEFAULT_ENGINE_PARAMS, maxTripDays: maxDays, maxLegPriceEur });
    const s = res.stats;
    const byLegs = new Map<number, number>();
    for (const c of res.chains) byLegs.set(c.legs.length, (byLegs.get(c.legs.length) || 0) + 1);
    const legsStr = [...byLegs.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}L:${n}`).join(' ');
    console.log(
      `${priceMode.padEnd(10)} maxDays=${String(maxDays).padEnd(3)} → ${s.routes} routes (${s.rawPaths} raw) · ` +
      `⭐${s.perfectLoops} 🔄${s.imperfectLoops} loops · 🏠${s.homeOrigin} home · ` +
      `[${legsStr}] · ${s.ms}ms${s.truncated ? ' · ⚠ TRUNCATED' : ''}`,
    );
  }
}

// Spot-check: show top 5 loops
const res = runEngine(offers, DEFAULT_ENGINE_PARAMS);
const loops = res.chains.filter(c => c.loopTier).slice(0, 5);
console.log('\nTop loops:');
for (const c of loops) {
  console.log(
    `  [${c.loopTier}${c.startEndKm != null ? ` ${Math.round(c.startEndKm)}km` : ''}] ` +
    `${c.route.join(' → ')} · depart ${c.departFrom?.slice(0, 10)}…${c.departTo?.slice(0, 10)} · ` +
    `${c.minDays?.toFixed(1)}–${c.maxDays?.toFixed(1)}d · ${c.variants?.length} variant(s)`,
  );
}

// Invariant checks
let bad = 0;
for (const c of res.chains) {
  const counts = new Map<string, number>();
  for (const city of c.route) counts.set(city, (counts.get(city) || 0) + 1);
  for (const [city, n] of counts) {
    if (n > 2) { console.error(`✗ ${city} appears ${n}× in ${c.route.join(' → ')}`); bad++; }
  }
  if (c.minDays! > 21.0001) { console.error(`✗ minDays ${c.minDays} > cap in ${c.route.join(' → ')}`); bad++; }
  if (c.departFrom && c.departTo && c.departFrom > c.departTo) { console.error(`✗ depart window inverted in ${c.route.join(' → ')}`); bad++; }
}
console.log(bad === 0 ? '\n✓ all invariants hold' : `\n✗ ${bad} invariant violations`);
