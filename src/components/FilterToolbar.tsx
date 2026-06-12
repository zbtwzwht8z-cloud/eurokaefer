'use client';
import { useState } from 'react';
import { type FilterState, type SortKey } from '@/lib/filters';
import { HOME_CITIES, REGIONS, type HomeCity, type RegionKey } from '@/lib/constants';

type Props = {
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
};

export default function FilterToolbar({ value, onChange, resultCount }: Props) {
  const [localSearch, setLocalSearch] = useState(value.search);

  // Debounce search updates
  function onSearchChange(s: string) {
    setLocalSearch(s);
    // Detect #ID lookup early — could be handled in parent, but for simplicity we pass through
    setTimeout(() => onChange({ ...value, search: s }), 0);
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
          <label
            title="Also show trips where this region appears as a mid-stop, not just the final destination"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, marginLeft: 6,
              padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
              fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
              background: value.flexTo ? 'var(--accent)' : 'var(--line)',
              color: value.flexTo ? '#fff' : 'var(--ink-3)',
              transition: 'background .15s, color .15s',
            }}>
            <input type="checkbox" checked={value.flexTo}
              onChange={e => onChange({ ...value, flexTo: e.target.checked })}
              style={{ display: 'none' }} />
            flex
          </label>
        )}
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
          onChange={e => onChange({ ...value, dateFrom: e.target.value || undefined })}
          title="Earliest pickup"
          style={{ padding: '6px 8px', fontSize: 13 }}
        />
        <span style={{ padding: '0 4px', color: 'var(--ink-4)' }}>→</span>
        <input
          type="date"
          value={value.dateTo || ''}
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

      {/* Loops toggle */}
      <div className="toolbar-group">
        <label
          title="Show only round trips (start area == end area)"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
            fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            background: value.loopsOnly ? 'var(--accent)' : 'var(--line)',
            color: value.loopsOnly ? '#fff' : 'var(--ink-3)',
            transition: 'background .15s, color .15s',
          }}>
          <input type="checkbox" checked={!!value.loopsOnly}
            onChange={e => onChange({ ...value, loopsOnly: e.target.checked, onewaysOnly: e.target.checked ? false : value.onewaysOnly })}
            style={{ display: 'none' }} />
          🔄 Loops only
        </label>
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
          <option value="soonest">Soonest start</option>
          <option value="legs-asc">Fewest legs</option>
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
