'use client';
import { useState } from 'react';
import { type FilterState, type SortKey, type TripMode } from '@/lib/filters';
import { HOME_CITIES, REGIONS, type HomeCity, type RegionKey } from '@/lib/constants';

type Props = {
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
};

const TODAY = new Date().toISOString().slice(0, 10);

export default function FilterToolbar({ value, onChange, resultCount }: Props) {
  const [localSearch, setLocalSearch] = useState(value.search);

  function onSearchChange(s: string) {
    setLocalSearch(s);
    setTimeout(() => onChange({ ...value, search: s }), 0);
  }

  // Guard against past dates — the engine can't build usable trips on
  // offers whose pickup window already closed.
  function clampDate(d: string | undefined): string | undefined {
    if (!d) return undefined;
    return d < TODAY ? TODAY : d;
  }

  function pill(
    active: boolean,
    label: string,
    title: string,
    onClick: () => void,
  ) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className="seg"
        style={{
          padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
          fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? '#fff' : 'var(--ink-3)',
          border: 0, transition: 'background .15s, color .15s',
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="toolbar-inner">
      {/* From */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>From</span>
        <select
          value={value.from}
          onChange={e => onChange({ ...value, from: e.target.value as HomeCity | 'mine' | 'any', flexFrom: false })}
        >
          <option value="any">Anywhere</option>
          {HOME_CITIES.filter(c => c !== 'Other').map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {value.from !== 'any' && (
          pill(value.flexFrom, 'flex',
            'Also show trips where this home area appears anywhere in the route, not just as the start',
            () => onChange({ ...value, flexFrom: !value.flexFrom }))
        )}
      </div>

      {/* To */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>To</span>
        <select
          value={value.to}
          onChange={e => onChange({ ...value, to: e.target.value as RegionKey, flexTo: false })}
        >
          {Object.entries(REGIONS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {value.to !== 'all' && (
          pill(value.flexTo, 'flex',
            'Also show trips where this region appears as a mid-stop, not just the final destination',
            () => onChange({ ...value, flexTo: !value.flexTo }))
        )}
      </div>

      {/* Trip mode: 3-way segmented control */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>Type</span>
        {([
          ['any', 'Any'],
          ['loop', '🔄 Loops'],
          ['oneway', '→ One-ways'],
        ] as Array<[TripMode, string]>).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={'seg' + (value.tripMode === mode ? ' active' : '')}
            onClick={() => onChange({ ...value, tripMode: mode })}
            style={{
              padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              background: value.tripMode === mode ? 'var(--ink)' : 'transparent',
              color: value.tripMode === mode ? '#fff' : 'var(--ink-3)',
              border: 0, transition: 'background .15s, color .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ends at home (inbound) */}
      <div className="toolbar-group">
        {pill(!!value.endsAtHome, '🏠 ends home',
          'Only show trips that finish in your home area (inbound relocs)',
          () => onChange({ ...value, endsAtHome: !value.endsAtHome }))}
      </div>

      {/* Legs */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
          Legs
        </span>
        <select
          value={value.maxLegs}
          onChange={e => onChange({ ...value, maxLegs: Number(e.target.value) })}
        >
          <option value={1}>1 only</option>
          <option value={2}>≤ 2</option>
          <option value={3}>≤ 3</option>
          <option value={6}>Any</option>
        </select>
      </div>

      {/* Max trip length (engine param — changes which chains exist) */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
          Days
        </span>
        <select
          value={value.maxDays}
          onChange={e => onChange({ ...value, maxDays: Number(e.target.value) })}
          title="Longest trip you'd consider — the engine only builds chains doable within this"
        >
          <option value={7}>≤ 7</option>
          <option value={14}>≤ 14</option>
          <option value={21}>≤ 21</option>
          <option value={30}>≤ 30</option>
          <option value={365}>Any</option>
        </select>
      </div>

      {/* Date range */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
          When
        </span>
        <input
          type="date"
          value={value.dateFrom || ''}
          min={TODAY}
          onChange={e => onChange({ ...value, dateFrom: clampDate(e.target.value) || undefined })}
          title="Earliest pickup"
          style={{ padding: '6px 8px', fontSize: 13 }}
        />
        <span style={{ padding: '0 4px', color: 'var(--ink-4)' }}>→</span>
        <input
          type="date"
          value={value.dateTo || ''}
          min={value.dateFrom || TODAY}
          onChange={e => onChange({ ...value, dateTo: e.target.value || undefined })}
          title="Latest dropoff"
          style={{ padding: '6px 8px', fontSize: 13 }}
        />
        {(value.dateFrom || value.dateTo) && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => onChange({ ...value, dateFrom: undefined, dateTo: undefined })}
            title="Clear dates"
            style={{ fontSize: 12 }}
          >✕</button>
        )}
      </div>

      {/* Sort */}
      <div className="toolbar-group">
        <span className="filter-label" style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
          Sort
        </span>
        <select
          value={value.sort}
          onChange={e => onChange({ ...value, sort: e.target.value as SortKey })}
        >
          <option value="best">Best</option>
          <option value="fuel">Cheapest fuel</option>
          <option value="shortest">Shortest drive</option>
          <option value="spare">Most spare km</option>
          <option value="soonest">Soonest start</option>
          <option value="legs-asc">Fewest legs</option>
          <option value="legs-desc">Most legs</option>
        </select>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          placeholder="City, country, or #ID"
          value={localSearch}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      <span className="result-count">{resultCount} trips</span>
    </div>
  );
}
