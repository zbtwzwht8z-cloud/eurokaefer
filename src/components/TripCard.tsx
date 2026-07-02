'use client';
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Chain } from '@/lib/chains';
import { chainFuelEur, chainDriveHours, chainPriceEur, chainIsAllEur1, endsInIceCity, countriesOfChain, tripKey } from '@/lib/chains';
import type { Highlight, User } from '@/lib/turso';
import { COUNTRY_FLAG } from '@/lib/constants';
import { riseItem, hoverSpring } from '@/lib/motion';
import MapView from './MapView';

type Props = {
  chain: Chain;
  highlights: Highlight[];
  usersById: Record<number, User>;
  myUserId: number;
  onOpen: () => void;
  onToggleHighlight: () => void;
  onHover?: (key: string | null) => void;
};

export default function TripCard({ chain, highlights, usersById, myUserId, onOpen, onToggleHighlight, onHover }: Props) {
  const fuel = chainFuelEur(chain);
  const driveH = chainDriveHours(chain);
  const rentalEur = chainPriceEur(chain);
  const allEur1 = chainIsAllEur1(chain);
  const ice = endsInIceCity(chain);
  const countries = useMemo(() => countriesOfChain(chain), [chain]);
  const isLoop = chain.isLoop ?? (chain.type === 'loop');
  const dest = chain.route[chain.route.length - 1];
  const variantCount = chain.variants?.length ?? 1;
  // Consecutive duplicate names happen when a leg hands off to a nearby
  // pickup city that displays the same — collapse for the route line only.
  const displayRoute = chain.route.filter((c, i, a) => i === 0 || c !== a[i - 1]);

  // Departure window (engine); falls back to fixed start date (legacy data)
  const departFrom = chain.departFrom ? new Date(chain.departFrom) : (chain.startUtc ? new Date(chain.startUtc) : null);
  const departTo = chain.departTo ? new Date(chain.departTo) : null;
  const departStr = departFrom
    ? (departTo && formatDate(departTo) !== formatDate(departFrom)
        ? `depart ${formatDate(departFrom)} – ${formatDate(departTo)}`
        : `depart ${formatDate(departFrom)}`)
    : '';

  const daysStr = (chain.minDays != null && chain.maxDays != null && chain.maxDays - chain.minDays >= 0.5)
    ? `${fmtDays(chain.minDays)}–${fmtDays(chain.maxDays)} d`
    : `${(chain.days || 0).toFixed(1)} d`;

  const minehighlight = highlights.some(h => h.user_id === myUserId);
  const kind = chain.loopTier === 'perfect' ? 'perfect'
    : chain.loopTier === 'imperfect' ? 'loop'
    : chain.homeOrigin ? 'home' : undefined;
  const reduce = useReducedMotion();

  return (
    <motion.article
      className="trip-card"
      data-kind={kind}
      variants={reduce ? undefined : riseItem}
      whileHover={reduce ? undefined : { y: -3 }}
      whileTap={reduce ? undefined : { scale: 0.992 }}
      transition={hoverSpring}
      onClick={onOpen}
      onMouseEnter={() => onHover?.(tripKey(chain))}
      onMouseLeave={() => onHover?.(null)}
    >
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
        <span
          className="status-dot"
          data-kind={kind}
          title={kind === 'perfect' ? 'Perfect loop' : kind === 'loop' ? 'Loop' : kind === 'home' ? `From ${chain.homeOrigin}` : undefined}
        />
        <div className="trip-card-route" style={{ flex: 1 }}>{displayRoute.join(' → ')}</div>
        {chain.tripId && <span className="trip-card-id">#{chain.tripId}</span>}
      </div>

      <div className="trip-card-meta">
        {allEur1 ? (
          <span className="badge badge-gold" title={`Every leg is a €1 relocation — €${chain.legs.length} total rental`}>
            €1 × {chain.legs.length}
          </span>
        ) : (
          <span className="badge badge-warn" title="Includes paid legs — total rental price">
            💶 €{Math.round(rentalEur)} rental
          </span>
        )}
        {chain.loopTier === 'perfect' && (
          <span className="badge badge-gold" title={`Start ↔ end ${Math.round(chain.startEndKm ?? 0)}km`}>
            ⭐ Perfect loop
          </span>
        )}
        {chain.loopTier === 'imperfect' && (
          <span className="badge badge-spark" title={`Start ↔ end ${Math.round(chain.startEndKm ?? 0)}km`}>
            🔄 Loop ~{Math.round(chain.startEndKm ?? 0)}km
          </span>
        )}
        {!chain.loopTier && isLoop && <span className="badge badge-accent">Round trip</span>}
        {!chain.loopTier && !isLoop && chain.homeOrigin && (
          <span className="badge badge-accent">🏠 from {chain.homeOrigin}</span>
        )}
        {!chain.loopTier && !isLoop && !chain.homeOrigin && chain.homeDestination && (
          <span className="badge badge-accent">🏠 to {chain.homeDestination}</span>
        )}
        {!chain.loopTier && !isLoop && !chain.homeOrigin && !chain.homeDestination && <span className="badge">Ends {dest}</span>}
        <span className="badge">{chain.legs.length} {chain.legs.length === 1 ? 'leg' : 'legs'}</span>
        <span className="badge" title="Shortest–longest possible trip length">{daysStr}</span>
        {variantCount > 1 && (
          <span className="badge" title={`${variantCount} car/date combinations for this route`}>
            📅 {variantCount} options
          </span>
        )}
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
          {countries.map(c => COUNTRY_FLAG[c] || '').filter(Boolean).join(' ')}{departStr && ` · ${departStr}`}
        </span>
        <button
          className="btn-icon"
          onClick={e => { e.stopPropagation(); onToggleHighlight(); }}
          title={minehighlight ? 'Unhighlight' : 'Highlight'}
          style={minehighlight ? { color: 'var(--gold)' } : {}}
        >
          {minehighlight ? '⭐' : '☆'}
        </button>
      </div>
    </motion.article>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDays(n: number): string {
  return Number.isInteger(Math.round(n * 2) / 2) ? String(Math.round(n)) : n.toFixed(1);
}
