'use client';
import { useEffect, useMemo, useState } from 'react';
import type { User, Highlight } from '@/lib/turso';
import type { TripData, Chain } from '@/lib/chains';
import { tripKey } from '@/lib/chains';
import { runEngine, DEFAULT_ENGINE_PARAMS } from '@/lib/engine';
import { applyFilters, DEFAULT_FILTER, type FilterState } from '@/lib/filters';
import type { HomeCity } from '@/lib/constants';
import FilterToolbar from './FilterToolbar';
import TripCard from './TripCard';
import TripDialog from './TripDialog';
import LoungeChat from './LoungeChat';
import RefreshButton from './RefreshButton';
import RoutesMap from './RoutesMap';

type Props = {
  data: TripData;
  user: User;
  users: User[];
  initialHighlights: Highlight[];
};

export default function EurokaeferApp({ data, user, users, initialHighlights }: Props) {
  const myHome = (user.home_city as HomeCity) || 'Bochum';

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);

  // The chain engine runs LIVE in the browser: legs / trip length / date
  // window change the search itself, not just the display.
  const { chains: allChains, stats } = useMemo(
    () => runEngine(data.offers, {
      ...DEFAULT_ENGINE_PARAMS,
      maxLegs: filter.maxLegs,
      maxTripDays: filter.maxDays,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    }),
    [data.offers, filter.maxLegs, filter.maxDays, filter.dateFrom, filter.dateTo],
  );

  const filtered = useMemo(() => applyFilters(allChains, filter, myHome), [allChains, filter, myHome]);

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  // Pagination: 24 visible per "page". Reset whenever filters change.
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter]);

  const [openTrip, setOpenTrip] = useState<Chain | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [loungeOpen, setLoungeOpen] = useState(false);

  // Build user lookup for avatars
  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);

  // Group highlights by trip_key
  const highlightsByTrip = useMemo(() => {
    const map = new Map<string, Highlight[]>();
    for (const h of highlights) {
      const arr = map.get(h.trip_key) ?? [];
      arr.push(h);
      map.set(h.trip_key, arr);
    }
    return map;
  }, [highlights]);

  // Handle #ID and ?trip= URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tripParam = params.get('trip');
    if (tripParam) {
      const id = parseInt(tripParam);
      const found = allChains.find(c => c.tripId === id);
      if (found) setOpenTrip(found);
    }
  }, [allChains]);

  // Refresh highlights when toggling
  async function refreshHighlights() {
    try {
      const res = await fetch('/api/highlights', { cache: 'no-store' });
      const data = await res.json();
      setHighlights(data.highlights || []);
    } catch {/* ignore */}
  }

  async function toggleHighlight(trip: Chain) {
    const key = tripKey(trip);
    const mine = (highlightsByTrip.get(key) || []).find(h => h.user_id === user.id);
    try {
      if (mine) {
        await fetch('/api/highlights', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_key: key }),
        });
      } else {
        await fetch('/api/highlights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_key: key }),
        });
      }
      await refreshHighlights();
    } catch {/* ignore */}
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
  }

  return (
    <div className="app-shell">
      {/* ── Topbar ──────────────────────────────────────────── */}
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <span className="brand-mark">🚐</span>
            <span>Eurokäfer</span>
          </div>
          <div className="top-actions">
            <RefreshButton lastGenerated={data.meta.generated} />
            <button className="btn btn-ghost btn-sm" onClick={() => setLoungeOpen(true)}>
              💬 Lounge
            </button>
            <span className="user-chip">
              <span className="user-chip-emoji">{user.emoji || '🚐'}</span>
              <span className="user-chip-name">{user.name}</span>
            </span>
            <button className="btn-icon" title="Sign out" onClick={logout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="hero">
        <div className="container hero-inner">
          <h1 className="h-display">€1 road trips, planned.</h1>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <p style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 'clamp(20px, 2.2vw, 30px)',
              letterSpacing: 0, direction: 'rtl', lineHeight: 1.8,
              color: '#ffffff',
            }}>
              هُوَ الَّذِي جَعَلَ لَكُمُ الْأَرْضَ ذَلُولًا فَامْشُوا فِي مَنَاكِبِهَا وَكُلُوا مِن رِّزْقِهِ ۖ وَإِلَيْهِ النُّشُورُ
            </p>
            <p style={{
              fontSize: 13, color: 'rgba(255,255,255,0.55)',
              marginTop: 14, lineHeight: 1.6, fontStyle: 'italic',
            }}>
              Surah Al-Mulk 67:15 — Ibn Kathīr: "Allah made the earth submissive and subservient, so travel its regions, walk its paths, and eat of what He has provided. The earth has been tamed for you as a riding animal is tamed."
            </p>
          </div>
          <div className="hero-meta">
            <span className="hero-meta-dot" />
            {stats.routes} possible trips · {stats.offers} offers
            · ⭐ {stats.perfectLoops + stats.imperfectLoops} loops
            {data.meta.generated && ' · ' + relativeTime(data.meta.generated)}
          </div>
        </div>
      </section>

      {/* ── Toolbar + grid ─────────────────────────────────── */}
      <div className="toolbar">
        <div className="container">
          <FilterToolbar value={filter} onChange={setFilter} resultCount={filtered.length} />
        </div>
      </div>

      {/* ── Route map ──────────────────────────────────────── */}
      <section className="container routes-map-section">
        <div className="routes-map-head">
          <span className="routes-map-title">🗺 All routes, live</span>
          <span className="routes-map-legend">
            <span className="legend-dot" style={{ background: '#f59e0b' }} /> perfect loop
            <span className="legend-dot" style={{ background: '#fb923c' }} /> loop
            <span className="legend-dot" style={{ background: '#06544a' }} /> home start
            <span className="legend-dot" style={{ background: '#9bb4b1' }} /> other
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowMap(v => !v)}>
            {showMap ? 'Hide' : 'Show'}
          </button>
        </div>
        {showMap && (
          <RoutesMap
            chains={filtered}
            hoverKey={hoverKey}
            onSelect={c => setOpenTrip(c)}
            onHover={setHoverKey}
          />
        )}
      </section>

      <main className="container section">
        {filtered.length === 0 ? (
          <div className="empty">
            <span className="empty-emoji">🤷</span>
            <strong>No trips match.</strong>
            <p style={{ marginTop: 8 }}>
              Try ticking <em>flex</em> on the To filter, picking a wider region,
              or clear the filters above.
            </p>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => setFilter(DEFAULT_FILTER)}
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <div className="trip-grid">
              {filtered.slice(0, visibleCount).map(c => (
                <TripCard
                  key={tripKey(c)}
                  chain={c}
                  highlights={highlightsByTrip.get(tripKey(c)) || []}
                  usersById={usersById}
                  myUserId={user.id}
                  onOpen={() => setOpenTrip(c)}
                  onToggleHighlight={() => toggleHighlight(c)}
                  onHover={setHoverKey}
                />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
                  <span style={{ color: 'var(--ink-3)', marginLeft: 8, fontSize: 13 }}>
                    ({filtered.length - visibleCount} remaining)
                  </span>
                </button>
              </div>
            )}
            {visibleCount >= filtered.length && filtered.length > PAGE_SIZE && (
              <div style={{ textAlign: 'center', marginTop: 24, color: 'var(--ink-3)', fontSize: 13 }}>
                Showing all {filtered.length} trips ·{' '}
                <button
                  className="btn-link"
                  onClick={() => setVisibleCount(PAGE_SIZE)}
                  style={{ background: 'none', border: 0, color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
                >
                  collapse
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Dialog ────────────────────────────────────────── */}
      {openTrip && (
        <TripDialog
          chain={openTrip}
          user={user}
          usersById={usersById}
          highlights={highlightsByTrip.get(tripKey(openTrip)) || []}
          onClose={() => setOpenTrip(null)}
          onToggleHighlight={() => toggleHighlight(openTrip)}
        />
      )}

      {/* ── Lounge drawer ─────────────────────────────────── */}
      <LoungeChat
        open={loungeOpen}
        onClose={() => setLoungeOpen(false)}
        user={user}
        usersById={usersById}
      />
    </div>
  );
}

function relativeTime(iso: string): string {
  if (!iso || iso.startsWith('1970')) return 'no data yet';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `updated ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `updated ${days}d ago`;
}
