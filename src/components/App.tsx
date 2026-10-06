'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { OfferFeed } from '@/lib/types';
import { variantLegs } from '@/lib/types';
import { runEngine, DEFAULT_ENGINE } from '@/lib/engine';
import {
  applyFilters, DEFAULT_FILTERS, filtersFromParams, filtersToParams, placeIndex, type Filters,
} from '@/lib/filters';
import { fmtAgo, fmtDay } from '@/lib/format';
import { countryName } from '@/lib/places';
import { loadJSON, saveJSON, useSaved } from '@/lib/storage';
import Logo from './Logo';
import SearchBar from './SearchBar';
import TripList from './TripList';
import TripDetail from './TripDetail';

const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => <div className="map-loading" aria-hidden />,
});

const PAGE = 80;          // list rows per "show more"

export default function App({ feed }: { feed: OfferFeed }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [ready, setReady] = useState(false);
  // Server render uses the feed time; the client switches to real "now".
  const [nowMs, setNowMs] = useState(() => Date.parse(feed.generated));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [variant, setVariant] = useState(0);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'results' | 'saved'>('results');
  // Pagination resets whenever the list changes (derived, not an effect).
  const [page, setPage] = useState<{ of: unknown; limit: number }>({ of: null, limit: PAGE });
  const [searchOpen, setSearchOpen] = useState(false);   // mobile: search collapsed to a summary
  const [saved, toggleSaved] = useSaved();
  const listScroll = useRef({ panel: 0, page: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  // ── URL / localStorage ⇄ state ───────────────────────────────────────────
  // The page is static (ISR), so URL and localStorage can only be read after
  // hydration. This one-time sync from browser state is deliberate.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Any URL state (a shared search or a shared trip) wins over the last
    // search remembered in this browser — a friend's trip link must not be
    // filtered by your own "€1 only" or it could look unavailable.
    const stored = params.size > 0 ? undefined : loadJSON<Partial<Filters>>('ek:filters');
    setFilters(filtersFromParams(params, { ...DEFAULT_FILTERS, ...stored }));
    setSelectedKey(params.get('trip'));
    setNowMs(Date.now());
    setReady(true);
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return;
    const params = filtersToParams(filters);
    if (selectedKey) params.set('trip', selectedKey);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    saveJSON('ek:filters', filters);
  }, [filters, selectedKey, ready]);

  // ── Engine + filtering (deferred so controls never feel sluggish) ────────
  const deferred = useDeferredValue(filters);
  const stale = deferred !== filters;
  // Engine "now" only moves in whole minutes to avoid recomputing every tick.
  const engineNow = Math.floor(nowMs / 60_000) * 60_000;

  const places = useMemo(() => placeIndex(feed.offers), [feed.offers]);
  const engine = useMemo(
    () => runEngine(feed.offers, {
      ...DEFAULT_ENGINE,
      eur1Only: deferred.eur1,
      maxLegs: deferred.legs,
      maxTripDays: deferred.days,
      dateFrom: deferred.dateFrom || undefined,
      dateTo: deferred.dateTo || undefined,
      nowMs: engineNow,
    }),
    [feed.offers, deferred.eur1, deferred.legs, deferred.days, deferred.dateFrom, deferred.dateTo, engineNow],
  );
  const byKey = useMemo(() => new Map(engine.chains.map(c => [c.key, c])), [engine.chains]);
  const results = useMemo(() => applyFilters(engine.chains, deferred, places), [engine.chains, deferred, places]);
  const savedChains = useMemo(
    () => [...saved].map(k => byKey.get(k)).filter((c): c is NonNullable<typeof c> => !!c),
    [saved, byKey],
  );
  const list = tab === 'saved' ? savedChains : results;
  const selected = selectedKey ? byKey.get(selectedKey) ?? null : null;
  const selectedLegs = useMemo(
    () => (selected ? (selected.variants[variant] ? variantLegs(selected.variants[variant]) : selected.legs) : null),
    [selected, variant],
  );

  const listId = tab === 'saved' ? 'saved' : deferred;
  const limit = page.of === listId ? page.limit : PAGE;

  // ── Navigation ───────────────────────────────────────────────────────────
  const open = useCallback((key: string) => {
    listScroll.current = { panel: listRef.current?.scrollTop ?? 0, page: window.scrollY };
    // Show the canonical (widest-window) variant first.
    setVariant(byKey.get(key)?.canonical ?? 0);
    setSelectedKey(key);
    setHoverKey(null);
    setSearchOpen(false);
  }, [byKey]);

  const back = useCallback(() => {
    setSelectedKey(null);
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listScroll.current.panel;
      if (window.matchMedia('(max-width: 860px)').matches) window.scrollTo(0, listScroll.current.page);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedKey && !(e.target instanceof HTMLInputElement)) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, back]);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setSelectedKey(null);
    setTab('results');
  }, []);

  const pickPlace = useCallback((name: string) => update({ from: name }), [update]);

  const mapSelected = useMemo(
    () => (selected && selectedLegs ? { chain: selected, legs: selectedLegs } : null),
    [selected, selectedLegs],
  );

  return (
    <div className="app">
      <header className={'bar' + (searchOpen ? ' is-open' : '')}>
        <Link className="brand" href="/" aria-label="Eurokäfer home">
          <Logo size={30} />
        </Link>
        <button className="search-summary" onClick={() => setSearchOpen(o => !o)} aria-expanded={searchOpen}>
          <span className="search-summary-route">
            {filters.from || 'Anywhere'} <span className="arrow">→</span> {filters.to.startsWith('country:') ? countryName(filters.to.slice(8)) : filters.to || 'Anywhere'}
          </span>
          <span className="search-summary-sub">
            {filters.dateFrom || filters.dateTo
              ? `${filters.dateFrom ? fmtDay(filters.dateFrom) : 'now'} – ${filters.dateTo ? fmtDay(filters.dateTo) : 'any time'}`
              : 'Any dates'}
            {' · '}{searchOpen ? 'Done' : 'Edit'}
          </span>
        </button>
        <SearchBar filters={filters} places={places} onChange={update} today={new Date(engineNow).toISOString().slice(0, 10)} />
        <div className="bar-status" title={`Movacar feed fetched ${new Date(feed.generated).toUTCString()}`}>
          {feed.error ? 'Movacar unreachable' : <>
            <b>{engine.stats.offers}</b> live offers · {ready ? fmtAgo(feed.generated, nowMs) : 'live'}
          </>}
        </div>
      </header>

      <main className="main">
        <section className="panel" aria-label="Trips">
          <div ref={listRef} className="pane" hidden={!!selected}>
            <TripList
              chains={list}
              limit={limit}
              onMore={() => setPage({ of: listId, limit: limit + PAGE })}
              tab={tab}
              onTab={t => { setTab(t); setSelectedKey(null); }}
              savedCount={saved.size}
              saved={saved}
              onToggleSave={toggleSaved}
              filters={filters}
              onChange={update}
              hoverKey={hoverKey}
              onHover={setHoverKey}
              onOpen={open}
              stale={stale}
              stats={engine.stats}
              feedError={feed.error}
            />
          </div>
          {selected && selectedLegs && (
            <div className="pane" key={selected.key}>
              <TripDetail
                chain={selected}
                legs={selectedLegs}
                variant={variant}
                onVariant={setVariant}
                onBack={back}
                isSaved={saved.has(selected.key)}
                onToggleSave={() => toggleSaved(selected.key)}
              />
            </div>
          )}
          {selectedKey && !selected && ready && (
            <div className="pane">
              <div className="gone">
                <p><b>That trip isn’t available any more.</b></p>
                <p>Its offers were booked or expired. Here’s everything that’s live right now.</p>
                <button className="btn" onClick={back}>Show all trips</button>
              </div>
            </div>
          )}
        </section>

        <div className="mapwrap">
          <RouteMap
            chains={list}
            selected={mapSelected}
            hoverKey={hoverKey}
            places={places}
            focusPlace={filters.from}
            onSelect={open}
            onHover={setHoverKey}
            onPickPlace={pickPlace}
          />
        </div>
      </main>
    </div>
  );
}
