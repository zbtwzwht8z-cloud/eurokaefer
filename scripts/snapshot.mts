// Save the live Movacar feed to data/snapshot.json for offline dev and the
// engine sanity suite. The site itself never reads this — it fetches live.
// Usage: npm run snapshot
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedUrl, parseFeed } from '../src/lib/movacar';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const t0 = Date.now();
const res = await fetch(feedUrl(), { headers: { Accept: 'application/json' } });
if (!res.ok) throw new Error(`Movacar API responded ${res.status}`);
const json = await res.json();
const offers = parseFeed(json, Date.now());

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(
  join(ROOT, 'data', 'snapshot.json'),
  JSON.stringify({ generated: new Date().toISOString(), offers }, null, 1),
);
const eur1 = offers.filter(o => o.priceEur <= 1).length;
console.log(`${json.data?.length ?? 0} raw → ${offers.length} offers (${eur1} at €1) in ${Date.now() - t0} ms`);
