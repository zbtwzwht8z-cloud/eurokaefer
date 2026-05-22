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

Runs the Python pipeline (fetch → search → build). ~60 seconds.

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
[Python pipeline: fetch.py → search.py → build.py]
    ↓ commits src/data/trip-data.ts
[Vercel auto-deploys on push]
    ↓
[Next.js: server reads cookie + Turso, client renders Apple-style UI]
    ↓
[Turso: users · highlights (⭐) · messages (💬)]
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Local dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run refresh` | Re-fetch + rebuild trip data |
| `npm run typecheck` | TypeScript check |

## Adding friends

Visit `/admin` after logging in. Admins can add name + key + home city + emoji.
