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

  const showFlexFrom = value.from !== 'any';
  const showFlexTo   = value.to !== 'all';

  return (
    <div className="toolbar-inner">
      {/* From */}
      <div className="toolbar-group" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
            From
          </span>
          <select
            value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value as HomeCity | 'mine' | 'any', flexFrom: false })}
          >
            <option value="mine">Mine</option>
            <option value="any">Anywhere</option>
            {HOME_CITIES.filter(c => c !== 'Other').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {showFlexFrom && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={value.flexFrom}
              onChange={e => onChange({ ...value, flexFrom: e.target.checked })}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            Flexible departure
          </label>
        )}
      </div>

      {/* To */}
      <div className="toolbar-group" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
            To
          </span>
          <select
            value={value.to}
            onChange={e => onChange({ ...value, to: e.target.value as RegionKey, flexTo: false })}
          >
            {Object.entries(REGIONS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        {showFlexTo && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={value.flexTo}
              onChange={e => onChange({ ...value, flexTo: e.target.checked })}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            Flexible destination
          </label>
        )}
      </div>

      {/* Legs */}
      <div className="toolbar-group">
        <span style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
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

      {/* Sort */}
      <div className="toolbar-group">
        <span style={{ padding: '6px 12px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>
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
