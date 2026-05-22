'use client';
import { useEffect, useRef } from 'react';
import type { Chain } from '@/lib/chains';
import { chainFuelEur, chainDriveHours, countriesOfChain, tripKey } from '@/lib/chains';
import type { Highlight, User } from '@/lib/turso';
import { COUNTRY_FLAG } from '@/lib/constants';
import MapView from './MapView';
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

  const fuel = chainFuelEur(chain);
  const driveH = chainDriveHours(chain);
  const countries = countriesOfChain(chain);
  const key = tripKey(chain);
  const mineHighlight = highlights.some(h => h.user_id === user.id);
  const startD = chain.startUtc ? new Date(chain.startUtc) : null;
  const endD = chain.endUtc ? new Date(chain.endUtc) : null;

  function copyShare() {
    const url = `${window.location.origin}/?trip=${chain.tripId}`;
    navigator.clipboard?.writeText(url);
  }

  return (
    <dialog id="tripDialog" ref={dialogRef} onClick={e => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <div className="dialog-head">
        <div>
          <div className="eyebrow">Trip #{chain.tripId} · {chain.type === 'loop' ? 'Round trip' : 'One-way'}</div>
          <h2 className="h-2" style={{ marginTop: 4 }}>{chain.route.join(' → ')}</h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={copyShare} title="Copy share link">
            🔗 Share
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
            <div className="stat-val">{(chain.days || 0).toFixed(1)}</div>
            <div className="stat-lbl">Days</div>
          </div>
          <div className="stat">
            <div className="stat-val">{Math.round(chain.routeKm).toLocaleString()}</div>
            <div className="stat-lbl">km</div>
          </div>
          <div className="stat">
            <div className="stat-val">{driveH.toFixed(1)}h</div>
            <div className="stat-lbl">Drive</div>
          </div>
          <div className="stat">
            <div className="stat-val">~€{Math.round(fuel)}</div>
            <div className="stat-lbl">Fuel</div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 6, flexWrap: 'wrap', color: 'var(--ink-3)', fontSize: 14 }}>
          <span>{countries.map(c => COUNTRY_FLAG[c] || '').filter(Boolean).join(' · ')}</span>
          {startD && endD && <span>· {startD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} → {endD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
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
                  </div>
                </div>
                <span style={{ color: 'var(--ink-4)', fontSize: 11, fontFamily: 'monospace' }}>
                  #{leg.offerId.slice(0, 12)}
                </span>
              </div>
            </div>
          ))}
        </div>

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
    </dialog>
  );
}

function formatLegTime(iso: string): string {
  if (!iso) return '?';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
