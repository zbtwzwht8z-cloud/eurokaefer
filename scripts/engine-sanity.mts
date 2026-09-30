// Run the chain engine against data/snapshot.json and check invariants.
// Usage: npm run snapshot && npm run engine:sanity
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEngine, DEFAULT_ENGINE } from '../src/lib/engine';
import type { Offer } from '../src/lib/types';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const snap = JSON.parse(readFileSync(join(ROOT, 'data', 'snapshot.json'), 'utf-8')) as {
  generated: string; offers: Offer[];
};
const nowMs = new Date(snap.generated).getTime();
console.log(`${snap.offers.length} offers from snapshot ${snap.generated}`);

for (const eur1Only of [true, false]) {
  for (const maxTripDays of [7, 21, 365]) {
    const { chains, stats } = runEngine(snap.offers, { ...DEFAULT_ENGINE, eur1Only, maxTripDays, nowMs });
    const byLegs = new Map<number, number>();
    for (const c of chains) byLegs.set(c.legs.length, (byLegs.get(c.legs.length) ?? 0) + 1);
    const legs = [...byLegs].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}L:${n}`).join(' ');
    console.log(
      `${eur1Only ? '€1 only ' : 'all €   '} ≤${String(maxTripDays).padEnd(3)}d → ` +
      `${String(stats.routes).padStart(4)} routes · ${String(stats.loops).padStart(3)} loops · ` +
      `[${legs}] · ${stats.ms} ms${stats.truncated ? ' · TRUNCATED' : ''}`,
    );
  }
}

const { chains } = runEngine(snap.offers, { ...DEFAULT_ENGINE, nowMs });
console.log('\nTop loops:');
for (const c of chains.filter(c => c.isLoop).slice(0, 6)) {
  console.log(`  ${c.key} · €${c.priceEur} · ${c.minDays.toFixed(1)}–${c.maxDays.toFixed(1)} d · ${c.variants.length} variant(s)`);
}

let bad = 0;
const fail = (msg: string) => { console.error('✗', msg); bad++; };
for (const c of chains) {
  const counts = new Map<string, number>();
  for (const city of c.route) counts.set(city, (counts.get(city) ?? 0) + 1);
  for (const [city, n] of counts) if (n > 2 && !(n === 3 && c.isLoop && c.route[0] === city)) fail(`${city} ×${n} in ${c.key}`);
  if (c.route.length !== c.legs.length + 1) fail(`route/legs mismatch in ${c.key}`);
  if (c.minDays > DEFAULT_ENGINE.maxTripDays + 1e-6) fail(`minDays ${c.minDays} over cap in ${c.key}`);
  if (c.departFrom > c.departTo) fail(`inverted departure window in ${c.key}`);
  if (c.departTo < nowMs) fail(`departs in the past: ${c.key}`);
  for (let i = 1; i < c.legs.length; i++) {
    if (c.legs[i].pickup < c.legs[i - 1].pickup) fail(`legs out of order in ${c.key}`);
  }
  if (c.allEur1 !== c.legs.every(l => l.offer.priceEur <= 1)) fail(`allEur1 wrong in ${c.key}`);
  if (c.variants[c.canonical]?.departFrom !== c.departFrom) fail(`canonical variant mismatch in ${c.key}`);
  for (const v of c.variants) {
    if (v.offers.length !== c.legs.length) fail(`variant leg count mismatch in ${c.key}`);
    for (let i = 1; i < v.e.length; i++) if (v.e[i] < v.e[i - 1] + DEFAULT_ENGINE.gapHours * 3_600_000) fail(`variant gap violated in ${c.key}`);
  }
}
console.log(bad === 0 ? '\n✓ all invariants hold' : `\n✗ ${bad} invariant violations`);
process.exit(bad === 0 ? 0 : 1);
