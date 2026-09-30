'use client';
import { memo } from 'react';
import { Repeat2, Star } from 'lucide-react';
import type { Chain } from '@/lib/types';
import type { Filters, Mode, Sort } from '@/lib/filters';
import type { EngineStats } from '@/lib/engine';
import { fmtDays, fmtEur, fmtKm, fmtNum, fmtWindow } from '@/lib/format';

type Props = {
  chains: Chain[];
  limit: number;
  onMore: () => void;
  tab: 'results' | 'saved';
  onTab: (t: 'results' | 'saved') => void;
  savedCount: number;
  saved: ReadonlySet<string>;
  onToggleSave: (key: string) => void;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  hoverKey: string | null;
  onHover: (key: string | null) => void;
  onOpen: (key: string) => void;
  stale: boolean;
  stats: EngineStats;
  feedError?: string;
};

const MODES: Array<[Mode, string]> = [['all', 'All'], ['loop', 'Loops'], ['oneway', 'One-way']];

const SORTS: Array<[Sort, string]> = [
  ['best', 'Best match'], ['soonest', 'Soonest'], ['cheapest', 'Cheapest'],
  ['quickest', 'Shortest trip'], ['longest', 'Most km'],
];

export default function TripList(p: Props) {
  const { chains, filters: f } = p;
  const shown = chains.slice(0, p.limit);

  return (
    <div className={'list' + (p.stale ? ' is-stale' : '')}>
      <div className="list-head">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={p.tab === 'results'} onClick={() => p.onTab('results')}>
            Trips <span className="count">{p.tab === 'results' ? fmtNum(chains.length) : ''}</span>
          </button>
          <button role="tab" aria-selected={p.tab === 'saved'} onClick={() => p.onTab('saved')}>
            Saved <span className="count">{p.savedCount || ''}</span>
          </button>
        </div>
        {p.tab === 'results' && (
          <div className="list-filters">
            <div className="seg" role="radiogroup" aria-label="Trip type">
              {MODES.map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={f.mode === m}
                  className={f.mode === m ? 'is-on' : undefined}
                  onClick={() => p.onChange({ mode: m })}
                >{label}</button>
              ))}
            </div>
            <button
              type="button"
              className={'chip' + (f.eur1 ? ' is-on' : '')}
              aria-pressed={f.eur1}
              onClick={() => p.onChange({ eur1: !f.eur1 })}
              title="Only chain offers that cost €1 (drops the €129 legs)"
            >€1 legs only</button>
          </div>
        )}
        {p.tab === 'results' && (
          <div className="list-controls">
            <select aria-label="Sort" value={f.sort} onChange={e => p.onChange({ sort: e.target.value as Sort })}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Maximum legs" value={f.legs} onChange={e => p.onChange({ legs: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 1 ? 'Single leg' : `≤ ${n} legs`}</option>)}
            </select>
            <select aria-label="Maximum trip length" value={f.days} onChange={e => p.onChange({ days: Number(e.target.value) })}>
              {[3, 7, 14, 21, 30, 60].map(n => <option key={n} value={n}>≤ {n} days</option>)}
            </select>
          </div>
        )}
      </div>

      {p.feedError && (
        <div className="notice">
          Movacar’s API didn’t answer when this page was built. It retries automatically every few minutes.
        </div>
      )}

      {shown.length === 0 ? (
        p.tab === 'saved' ? (
          <div className="empty">
            <p><b>No saved trips yet.</b></p>
            <p>Tap the star on any trip to keep it here. Saved trips live in this browser only.</p>
          </div>
        ) : (
          <EmptyResults filters={f} onChange={p.onChange} />
        )
      ) : (
        <ol className="rows">
          {shown.map(c => (
            <Row
              key={c.key}
              chain={c}
              hover={p.hoverKey === c.key}
              saved={p.saved.has(c.key)}
              onOpen={p.onOpen}
              onHover={p.onHover}
              onToggleSave={p.onToggleSave}
            />
          ))}
        </ol>
      )}

      {chains.length > shown.length && (
        <button className="more" onClick={p.onMore}>
          Show more · {fmtNum(chains.length - shown.length)} left
        </button>
      )}

      {p.tab === 'results' && (
        <footer className="list-foot">
          {fmtNum(p.stats.routes)} routes from {p.stats.offers} offers ({p.stats.eur1Offers} at €1),
          computed in <span suppressHydrationWarning>{p.stats.ms}</span> ms in your browser.
          {p.stats.truncated && ' Search space was capped — narrow the dates for the full set.'}
          {' '}Data: <a href="https://movacar.com/" target="_blank" rel="noreferrer">Movacar</a>. Not affiliated.
        </footer>
      )}
    </div>
  );
}

type RowProps = {
  chain: Chain;
  hover: boolean;
  saved: boolean;
  onOpen: (key: string) => void;
  onHover: (key: string | null) => void;
  onToggleSave: (key: string) => void;
};

const Row = memo(function Row({ chain: c, hover, saved, onOpen, onHover, onToggleSave }: RowProps) {
  const paid = c.legs.filter(l => l.offer.priceEur > 1).length;
  return (
    <li
      className={'row' + (hover ? ' is-hover' : '')}
      onMouseEnter={() => onHover(c.key)}
      onMouseLeave={() => onHover(null)}
    >
      <button className="row-hit" onClick={() => onOpen(c.key)} onFocus={() => onHover(c.key)} onBlur={() => onHover(null)}>
        <span className="row-route">
          {c.route.map((city, i) => (
            <span key={i}>{i > 0 && <span className="arrow" aria-hidden> → </span>}{city}</span>
          ))}
        </span>
        <span className="row-meta">
          {c.isLoop && <span className="tag"><Repeat2 size={12} strokeWidth={2.2} aria-hidden />Loop</span>}
          <span>{c.legs.length} {c.legs.length === 1 ? 'leg' : 'legs'}</span>
          <span>{fmtKm(c.routeKm)}</span>
          <span>{fmtDays(c.minDays, c.maxDays)}</span>
        </span>
        <span className="row-when">Departs {fmtWindow(c.departFrom, c.departTo)}</span>
      </button>
      <div className="row-side">
        <span className={'price' + (c.allEur1 ? ' is-deal' : '')}>{fmtEur(c.priceEur)}</span>
        <span className="price-sub">{c.allEur1 ? (c.legs.length > 1 ? `€1 × ${c.legs.length}` : '€1 deal') : `${paid} paid ${paid === 1 ? 'leg' : 'legs'}`}</span>
        <button
          className={'star' + (saved ? ' is-on' : '')}
          aria-label={saved ? 'Remove from saved' : 'Save trip'}
          aria-pressed={saved}
          onClick={() => onToggleSave(c.key)}
        >
          <Star size={15} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </li>
  );
});

function EmptyResults({ filters: f, onChange }: { filters: Filters; onChange: (p: Partial<Filters>) => void }) {
  const tips: Array<[string, Partial<Filters>]> = [];
  if (f.from && f.near < 100) tips.push([`Start within 100 km of ${f.from}`, { near: 100 }]);
  if (f.eur1) tips.push(['Allow €129 legs', { eur1: false }]);
  if (f.days < 30) tips.push(['Allow trips up to 30 days', { days: 30 }]);
  if (f.to && !f.via) tips.push(['Match destination as a stop too', { via: true }]);
  if (f.mode !== 'all') tips.push(['Show all trip types', { mode: 'all' }]);
  if (f.dateFrom || f.dateTo) tips.push(['Any dates', { dateFrom: '', dateTo: '' }]);
  if (f.legs < 6) tips.push(['Allow up to 6 legs', { legs: 6 }]);
  return (
    <div className="empty">
      <p><b>No trips match.</b></p>
      <p>Relocations are one-directional and go fast. Try loosening something:</p>
      <div className="empty-tips">
        {tips.slice(0, 4).map(([label, patch]) => (
          <button key={label} className="btn" onClick={() => onChange(patch)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
