# Eurokäfer

Every live Movacar relocation, chained into multi-leg road trips and loops —
on one map. Public, no accounts. **https://eurokaefer.vercel.app**

## How it works

```
Movacar API ──(1 request, ISR every 10 min)──▶ page.tsx (server)
                                                   │ normalized offers (~200)
                                                   ▼
                                    engine.ts (browser, ~16 ms)
                                    DFS over offers → ~2,500 routes
                                                   ▼
                              filters.ts → list + Leaflet map (client)
```

- **Data** — `src/lib/movacar.ts` fetches the whole inventory in one
  `?size=1000` request (the API ignores `?page`). The page is ISR with
  `revalidate = 600`: visitors always get an instant static page, and it
  refreshes in the background. If Movacar is down during a refresh, the last
  good page keeps being served.
- **Places** — `src/lib/places.ts` maps depot towns to the places people
  actually search for (Viladecans → Barcelona, Champlan → Paris,
  Goussainville → Paris CDG) plus a country code.
- **Engine** — `src/lib/engine.ts` chains offers whose drop-off and next
  pickup are within 80 km, with exact interval scheduling (departure window,
  min/max trip length). Areas may be visited twice, roads driven twice.
  Paid legs dominate the ranking, so all-€1 trips come first.
- **UI** — map-first: list/detail panel on the left, Leaflet map (Esri Light
  Gray tiles — CARTO now requires an API key) on the right; stacked on phones.
  Search state lives in the URL, so every search and trip is shareable.
  Saved trips live in `localStorage`.

## Develop

```bash
npm install
npm run dev              # http://localhost:3000, fetches live data
npm run typecheck && npm run lint
npm run snapshot         # save the live feed to data/snapshot.json
npm run engine:sanity    # run the engine on the snapshot + check invariants
```

No environment variables are needed.

Data from [Movacar](https://movacar.com). Not affiliated with Movacar.
