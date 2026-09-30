'use client';
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Filters, PlaceInfo } from '@/lib/filters';
import { countryName } from '@/lib/places';
import PlaceInput, { type PlaceOption } from './PlaceInput';

type Props = {
  filters: Filters;
  places: Map<string, PlaceInfo>;
  onChange: (patch: Partial<Filters>) => void;
  today: string;
};

const RADII = [0, 25, 50, 100, 200];

export default function SearchBar({ filters: f, places, onChange, today }: Props) {
  const fromOptions = useMemo<PlaceOption[]>(() =>
    [...places.values()]
      .filter(p => p.departures > 0)
      .sort((a, b) => b.departures - a.departures || a.name.localeCompare(b.name))
      .map(p => ({
        value: p.name,
        label: p.name,
        hint: `${p.departures} ${p.departures === 1 ? 'car' : 'cars'}`,
        search: `${p.towns.join(' ')} ${countryName(p.country)}`,
      })),
  [places]);

  const toOptions = useMemo<PlaceOption[]>(() => {
    const countries = new Map<string, number>();
    for (const p of places.values()) if (p.country) countries.set(p.country, (countries.get(p.country) ?? 0) + p.arrivals);
    const byCountry: PlaceOption[] = [...countries]
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => ({ value: `country:${code}`, label: countryName(code), group: 'Countries', search: code }));
    const byPlace: PlaceOption[] = [...places.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ value: p.name, label: p.name, group: 'Places', search: `${p.towns.join(' ')} ${countryName(p.country)}` }));
    return [...byCountry, ...byPlace];
  }, [places]);

  const dirty = f.from || f.to || f.dateFrom || f.dateTo;

  return (
    <div className="search" role="search">
      <div className="search-route">
        <PlaceInput label="From" value={f.from} placeholder="Anywhere" options={fromOptions} onChange={v => onChange({ from: v })} />
        <div className="field near">
          <label className="field-label" htmlFor="near">Radius</label>
          <select
            id="near"
            value={f.near}
            disabled={!f.from}
            onChange={e => onChange({ near: Number(e.target.value) })}
            aria-label="Also start from stations within"
          >
            {RADII.map(r => <option key={r} value={r}>{r === 0 ? 'Exact' : `+${r} km`}</option>)}
          </select>
        </div>
        <ArrowRight className="search-arrow" size={16} aria-hidden />
        <PlaceInput label="To" value={f.to} placeholder="Anywhere" options={toOptions} onChange={v => onChange({ to: v })} />
        <label className={'check' + (f.to ? '' : ' is-disabled')} title="Match the destination anywhere on the route, not only as the final stop">
          <input type="checkbox" checked={f.via} disabled={!f.to} onChange={e => onChange({ via: e.target.checked })} />
          <span>via</span>
        </label>
      </div>

      <div className="field dates">
        <span className="field-label">Dates</span>
        <div className="dates-box">
          <input
            type="date"
            aria-label="Depart from"
            min={today}
            value={f.dateFrom}
            onChange={e => onChange({ dateFrom: e.target.value && e.target.value < today ? today : e.target.value })}
          />
          <span aria-hidden>–</span>
          <input
            type="date"
            aria-label="Back by"
            min={f.dateFrom || today}
            value={f.dateTo}
            onChange={e => onChange({ dateTo: e.target.value })}
          />
        </div>
      </div>

      {dirty && (
        <button
          type="button"
          className="link"
          onClick={() => onChange({ from: '', to: '', via: false, dateFrom: '', dateTo: '' })}
        >Reset</button>
      )}
    </div>
  );
}
