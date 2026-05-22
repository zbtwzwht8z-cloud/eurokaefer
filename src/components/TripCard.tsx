'use client';
import { useMemo } from 'react';
import type { Chain } from '@/lib/chains';
import { chainFuelEur, chainDriveHours, endsInIceCity, countriesOfChain } from '@/lib/chains';
import type { Highlight, User } from '@/lib/turso';
import { COUNTRY_FLAG } from '@/lib/constants';
import MapView from './MapView';

type Props = {
  chain: Chain;
  highlights: Highlight[];
  usersById: Record<number, User>;
  myUserId: number;
  onOpen: () => void;
  onToggleHighlight: () => void;
};

export default function TripCard({ chain, highlights, usersById, myUserId, onOpen, onToggleHighlight }: Props) {
  const fuel = chainFuelEur(chain);
  const driveH = chainDriveHours(chain);
  const ice = endsInIceCity(chain);
  const countries = useMemo(() => countriesOfChain(chain), [chain]);
  const isLoop = chain.type === 'loop';
  const dest = chain.route[chain.route.length - 1];

  const startDate = chain.startUtc ? new Date(chain.startUtc) : null;
  const endDate = chain.endUtc ? new Date(chain.endUtc) : null;
  const startStr = startDate ? formatDate(startDate) : '';
  const endStr = endDate ? formatDate(endDate) : '';

  const minehighlight = highlights.some(h => h.user_id === myUserId);

  return (
    <article className="trip-card" onClick={onOpen}>
      {/* Highlight avatars */}
      {highlights.length > 0 && (
        <div className="highlight-stack" onClick={e => e.stopPropagation()}>
          {highlights.slice(0, 4).map(h => {
            const u = usersById[h.user_id];
            return (
              <span
                key={h.id}
                className="highlight-avatar"
                title={u?.name || 'someone'}
              >{u?.emoji || '⭐'}</span>
            );
          })}
        </div>
      )}

      <div className="trip-card-top">
        <div className="trip-card-route">{chain.route.join(' → ')}</div>
        {chain.tripId && <span className="trip-card-id">#{chain.tripId}</span>}
      </div>

      <div className="trip-card-meta">
        {isLoop && <span className="badge badge-accent">Round trip</span>}
        {!isLoop && <span className="badge">Ends {dest}</span>}
        <span className="badge">{chain.legs.length} {chain.legs.length === 1 ? 'leg' : 'legs'}</span>
        <span className="badge">{(chain.days || 0).toFixed(1)} d</span>
        {ice.ok && <span className="badge badge-ice">🚄 {ice.label}</span>}
      </div>

      <div className="trip-card-map">
        <MapView route={chain.route} mini />
      </div>

      <div className="trip-card-stats">
        <div className="trip-card-stat">
          <div className="trip-card-stat-val">{Math.round(chain.routeKm).toLocaleString()}</div>
          <div className="trip-card-stat-lbl">km</div>
        </div>
        <div className="trip-card-stat">
          <div className="trip-card-stat-val">~€{Math.round(fuel)}</div>
          <div className="trip-card-stat-lbl">fuel</div>
        </div>
        <div className="trip-card-stat">
          <div className="trip-card-stat-val">{driveH.toFixed(1)}h</div>
          <div className="trip-card-stat-lbl">drive</div>
        </div>
      </div>

      <div className="trip-card-footer">
        <span>
          {countries.map(c => COUNTRY_FLAG[c] || '').filter(Boolean).join(' ')} · {startStr}{endStr && ` → ${endStr}`}
        </span>
        <button
          className="btn-icon"
          onClick={e => { e.stopPropagation(); onToggleHighlight(); }}
          title={minehighlight ? 'Unhighlight' : 'Highlight'}
          style={minehighlight ? { color: '#f59e0b' } : {}}
        >
          {minehighlight ? '⭐' : '☆'}
        </button>
      </div>
    </article>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
