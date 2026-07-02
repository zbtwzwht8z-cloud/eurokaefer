'use client';
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Chain } from '@/lib/chains';
import { chainFuelEur, chainDriveHours, chainPriceEur, chainIsAllEur1, countriesOfChain, tripKey } from '@/lib/chains';
import type { Highlight, User } from '@/lib/turso';
import { COUNTRY_FLAG } from '@/lib/constants';
import { EASE_OUT } from '@/lib/motion';
import MapView from './MapView';
import AnimatedNumber from './AnimatedNumber';
import CommentThread from './CommentThread';

type Props = {
  chain: Chain;
  user: User;
  usersById: Record<number, User>;
  highlights: Highlight[];
  onClose: () => void;
  onToggleHighlight: () => void;
};

export default function TripDialog({ chain, user, usersById, highlights, onClose, onToggleHighlight }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dialog = dialogRef.current;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    dialog?.addEventListener('cancel', onCancel);
    return () => dialog?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const reduce = useReducedMotion();
  const fuel = chainFuelEur(chain);
  const driveH = chainDriveHours(chain);
  const rentalEur = chainPriceEur(chain);
  const allEur1 = chainIsAllEur1(chain);
  const countries = countriesOfChain(chain);
  const key = tripKey(chain);
  const mineHighlight = highlights.some(h => h.user_id === user.id);
  const startD = chain.startUtc ? new Date(chain.startUtc) : null;
  const endD = chain.endUtc ? new Date(chain.endUtc) : null;
  const departFrom = chain.departFrom ? new Date(chain.departFrom) : startD;
  const departTo = chain.departTo ? new Date(chain.departTo) : null;
  const displayRoute = chain.route.filter((c, i, a) => i === 0 || c !== a[i - 1]);
  const daysStr = (chain.minDays != null && chain.maxDays != null && chain.maxDays - chain.minDays >= 0.5)
    ? `${chain.minDays.toFixed(1)}–${chain.maxDays.toFixed(1)}`
    : (chain.days || 0).toFixed(1);

  function copyShare() {
    const url = `${window.location.origin}/?trip=${chain.tripId}`;
    navigator.clipboard?.writeText(url);
  }

  function googleMapsUrl() {
    // https://www.google.com/maps/dir/City1/City2/City3/
    return 'https://www.google.com/maps/dir/' + chain.route.map(c => encodeURIComponent(c)).join('/') + '/';
  }

  return (
    <dialog id="tripDialog" ref={dialogRef} onClick={e => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={reduce ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        style={{ transformOrigin: 'center' }}
      >
      <div className="dialog-head">
        <div>
          <div className="eyebrow">Trip #{chain.tripId} · {(chain.isLoop ?? (chain.type === 'loop')) ? 'Round trip' : 'One-way'}</div>
          <h2 className="h-2" style={{ marginTop: 4 }}>{displayRoute.join(' → ')}</h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a
            href={googleMapsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            title="Open in Google Maps"
          >
            🗺<span className="dialog-btn-label"> Maps</span>
          </a>
          <button className="btn btn-ghost btn-sm" onClick={copyShare} title="Copy share link">
            🔗<span className="dialog-btn-label"> Share</span>
          </button>
          <button
            className="btn-icon"
            onClick={onToggleHighlight}
            style={mineHighlight ? { color: '#f59e0b' } : {}}
            title={mineHighlight ? 'Unhighlight' : 'Highlight'}
          >
            {mineHighlight ? '⭐' : '☆'}
          </button>
          <button className="btn-icon" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="dialog-body">
        {/* Map */}
        <div className="dialog-map">
          <MapView route={chain.route} />
        </div>

        {/* Stats */}
        <div className="stats" style={{ margin: 0 }}>
          <div className="stat">
            <div className="stat-val">{daysStr}</div>
            <div className="stat-lbl">Days</div>
          </div>
          <div className="stat">
            <div className="stat-val"><AnimatedNumber value={chain.routeKm} locale /></div>
            <div className="stat-lbl">km</div>
          </div>
          <div className="stat">
            <div className="stat-val"><AnimatedNumber value={driveH} decimals={1} suffix="h" /></div>
            <div className="stat-lbl">Drive</div>
          </div>
          <div className="stat">
            <div className="stat-val"><AnimatedNumber value={fuel} prefix="~€" /></div>
            <div className="stat-lbl">Fuel</div>
          </div>
          <div className="stat">
            <div className="stat-val" style={allEur1 ? { color: 'var(--gold)' } : undefined}>
              <AnimatedNumber value={rentalEur} prefix="€" />
            </div>
            <div className="stat-lbl">{allEur1 ? 'Rental (all €1!)' : 'Rental'}</div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 6, flexWrap: 'wrap', color: 'var(--ink-3)', fontSize: 14 }}>
          <span>{countries.map(c => COUNTRY_FLAG[c] || '').filter(Boolean).join(' · ')}</span>
          {departFrom && departTo && fmtDay(departFrom) !== fmtDay(departTo) ? (
            <span>· 🗓 depart anytime {fmtDay(departFrom)} – {fmtDay(departTo)}</span>
          ) : startD && endD ? (
            <span>· {fmtDay(startD)} → {fmtDay(endD)}</span>
          ) : null}
        </div>

        {/* Legs */}
        <h3 className="h-3" style={{ marginTop: 28, marginBottom: 12 }}>Legs</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chain.legs.map((leg, i) => (
            <div key={i} style={{
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-sm)',
              padding: '14px 18px',
              fontSize: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {leg.originName} → {leg.destName}
                  </div>
                  <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
                    {formatLegTime(leg.pickup)} → {formatLegTime(leg.dropoff)} ·{' '}
                    {Math.round(leg.distanceKm)} km · {leg.vehicle || leg.model || 'Camper'}
                    {leg.priceEur != null && (
                      <span style={leg.priceEur <= 1
                        ? { color: 'var(--gold)', fontWeight: 600 }
                        : { color: 'var(--warn)', fontWeight: 600 }}>
                        {' '}· €{leg.priceEur <= 1 ? '1' : Math.round(leg.priceEur)}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ color: 'var(--ink-4)', fontSize: 11, fontFamily: 'monospace' }}>
                  #{leg.offerId.slice(0, 12)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Car/date options for this route */}
        {chain.variants && chain.variants.length > 1 && (
          <div style={{ marginTop: 28 }}>
            <h3 className="h-3" style={{ marginBottom: 12 }}>
              Car & date options · {chain.variants.length}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chain.variants.map((v, i) => {
                const sd = new Date(v.startUtc);
                const dt = v.departTo ? new Date(v.departTo) : null;
                const isCanonical = v.startUtc === chain.startUtc
                  && (!v.departTo || v.departTo === chain.departTo);
                const window = dt && fmtDay(dt) !== fmtDay(sd)
                  ? `depart ${fmtDay(sd)} – ${fmtDay(dt)}`
                  : `depart ${sd.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
                const days = v.minDays != null && v.maxDays != null && v.maxDays - v.minDays >= 0.5
                  ? `${v.minDays.toFixed(1)}–${v.maxDays.toFixed(1)}d`
                  : `${v.days.toFixed(1)}d`;
                return (
                  <div key={i} style={{
                    background: isCanonical ? 'var(--surface-3, var(--surface-2))' : 'var(--surface-2)',
                    borderRadius: 'var(--r-sm)',
                    padding: '10px 14px',
                    fontSize: 13,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    border: isCanonical ? '1px solid var(--accent)' : '1px solid transparent',
                  }}>
                    <span style={{ color: 'var(--ink)' }}>{window}</span>
                    <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                      {days} · {v.pickups.length} {v.pickups.length === 1 ? 'leg' : 'legs'}
                      {isCanonical && ' · widest window'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 className="h-3" style={{ marginBottom: 8 }}>Highlighted by</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {highlights.map(h => {
                const u = usersById[h.user_id];
                return (
                  <span key={h.id} className="badge">
                    {u?.emoji || '⭐'} {u?.name || 'someone'}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Comments */}
        <CommentThread tripKey={key} user={user} usersById={usersById} />
      </div>
      </motion.div>
    </dialog>
  );
}

function formatLegTime(iso: string): string {
  if (!iso) return '?';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
