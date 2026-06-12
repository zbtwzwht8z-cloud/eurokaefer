# Eurokäfer

Shared road-trip planner for the crew (Bochum · Hannover · München).

Live €1 Movacar relocations chained into round-trips and one-ways. Refreshed every 6h via GitHub Actions.

## Stack

- **Next.js 16** (App Router) on Vercel
- **Turso** (SQLite edge) — users, highlights, chat
- **Leaflet** + Carto tiles — maps
- **Python 3.11** — fetch + chain algorithm, runs in GitHub Actions

## Setup

### 1. Tooling (already installed)

```bash
brew install node gh tursodatabase/tap/turso
npm i -g vercel
```

### 2. Turso database

```bash
turso auth login
turso db create eurokaefer-db
turso db tokens create eurokaefer-db   # save the token

turso db shell eurokaefer-db <<SQL
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  home_city TEXT NOT NULL,
  emoji TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER
);
CREATE TABLE highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trip_key TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(user_id, trip_key)
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trip_key TEXT,
  body TEXT NOT NULL,
  created_at INTEGER
);
CREATE INDEX idx_messages_trip ON messages(trip_key);
CREATE INDEX idx_messages_recent ON messages(created_at DESC);

INSERT INTO users (name, key, home_city, emoji, is_admin, created_at)
VALUES ('Bebo', 'bebo-2026', 'Bochum', '🚐', 1, strftime('%s','now')*1000);
SQL
```

### 3. Environment

```bash
cp .env.example .env.local
# edit .env.local with TURSO_URL, TURSO_TOKEN
```

### 4. First data refresh

```bash
npm run refresh
```

Runs the Python pipeline (fetch → build). Chain search itself happens
client-side in the browser (`src/lib/engine.ts`) — Python only ships the
raw €1 offers with exact station coordinates.

### 5. Develop locally

```bash
npm run dev
# open http://localhost:3000
# enter key: bebo-2026
```

### 6. Deploy

```bash
gh auth login
gh repo create eurokaefer --public --source=. --push
vercel
# add env vars (TURSO_URL, TURSO_TOKEN, GH_PAT, GH_REPO) in Vercel project settings
vercel --prod
```

## Architecture

```
[Movacar API]
    ↓ (every 6h via GitHub Actions cron, OR manual workflow_dispatch)
[Python pipeline: fetch.py → build.py]
    ↓ commits src/data/trip-data.ts (~44KB: raw €1 offers + station coords)
[Vercel auto-deploys on push]
    ↓
[Next.js: server reads cookie + Turso, client renders UI]
    ↓
[src/lib/engine.ts: chain DFS runs IN THE BROWSER (~25ms for ~90 offers)]
    ↓
[Turso: users · highlights (⭐) · messages (💬)]
```

### The chain engine (src/lib/engine.ts)

All possible 1–6-leg trips are computed live in the browser, so the
"Legs", "Days" and date-window filters re-run the actual search:

- **Chaining rule**: leg B can follow leg A if B's pickup station is within
  80 km of A's dropoff station (exact coordinates from the Movacar API) and
  B's pickup window still allows ≥24h after A's pickup. `period_hours` is a
  deadline, not a minimum hold — cars can be returned early.
- **Scheduling**: interval propagation gives each route an exact departure
  window (depart between X and Y) and trip-length range (min–max days)
  instead of sampled date variants.
- **Loops**: start↔end ≤15 km ⇒ ⭐ perfect, ≤100 km ⇒ 🔄 imperfect.
- **Anti-spam**: an area may appear at most twice per route, and the same
  road (area pair) may be driven at most twice — out-and-back loops
  survive, "Berlin and back ×3" doesn't.
- **Sanity check**: `npm run engine:sanity` runs the engine against
  `data/movacar_offers.csv` and prints route/loop counts + invariants.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Local dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run refresh` | Re-fetch + rebuild trip data |
| `npm run engine:sanity` | Run the chain engine against the offers CSV, print stats |
| `npm run typecheck` | TypeScript check |

## Adding friends

Visit `/admin` after logging in. Admins can add name + key + home city + emoji.
