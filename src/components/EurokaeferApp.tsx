'use client';
import { useEffect, useMemo, useState } from 'react';
import type { User, Highlight } from '@/lib/turso';
import type { TripData, Chain } from '@/lib/chains';
import { buildAllChains, tripKey } from '@/lib/chains';
import { applyFilters, DEFAULT_FILTER, type FilterState } from '@/lib/filters';
import type { HomeCity } from '@/lib/constants';
import FilterToolbar from './FilterToolbar';
import TripCard from './TripCard';
import TripDialog from './TripDialog';
import LoungeChat from './LoungeChat';
import RefreshButton from './RefreshButton';

type Props = {
  data: TripData;
  user: User;
  users: User[];
  initialHighlights: Highlight[];
};

export default function EurokaeferApp({ data, user, users, initialHighlights }: Props) {
  const allChains = useMemo(() => buildAllChains(data), [data]);
  const myHome = (user.home_city as HomeCity) || 'Bochum';

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const filtered = useMemo(() => applyFilters(allChains, filter, myHome), [allChains, filter, myHome]);

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
            <RefreshButton />
            <button className="btn btn-ghost btn-sm" onClick={() => setLoungeOpen(true)}>
              💬 Lounge
            </button>
            <span className="user-chip">
              <span className="user-chip-emoji">{user.emoji || '🚐'}</span>
              {user.name}
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
      <section className="hero container">
        <h1 className="h-display">€1 road trips, planned.</h1>
        <p>
          Live Movacar relocations chained into round-trips and one-ways from{' '}
          Bochum, Hannover, and Munich. Refreshed every six hours.
        </p>
        <div className="hero-meta">
          <span className="hero-meta-dot" />
          {data.meta.recommendedCount} chains · {data.meta.offerCount} offers
          {data.meta.generated && ' · ' + relativeTime(data.meta.generated)}
        </div>
      </section>

      {/* ── Toolbar + grid ─────────────────────────────────── */}
      <div className="toolbar">
        <div className="container">
          <FilterToolbar value={filter} onChange={setFilter} resultCount={filtered.length} />
        </div>
      </div>

      <main className="container section">
        {filtered.length === 0 ? (
          <div className="empty">
            <span className="empty-emoji">🤷</span>
            <strong>No trips match.</strong>
            <p style={{ marginTop: 8 }}>Loosen the filters or try a different region.</p>
          </div>
        ) : (
          <div className="trip-grid">
            {filtered.slice(0, 60).map(c => (
              <TripCard
                key={tripKey(c)}
                chain={c}
                highlights={highlightsByTrip.get(tripKey(c)) || []}
                usersById={usersById}
                myUserId={user.id}
                onOpen={() => setOpenTrip(c)}
                onToggleHighlight={() => toggleHighlight(c)}
              />
            ))}
          </div>
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
