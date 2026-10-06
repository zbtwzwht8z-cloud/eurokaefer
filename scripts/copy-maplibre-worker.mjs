// MapLibre v6 is ESM-only and spawns its tile worker from a URL, which the
// bundler can't follow. Serve the worker (and the shared chunk it imports)
// as static files from /maplibre/, matching the installed version exactly.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', 'maplibre-gl', 'dist');
const out = join(root, 'public', 'maplibre');
mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(src, f), join(out, f));
