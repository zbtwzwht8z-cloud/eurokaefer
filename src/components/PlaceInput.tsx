'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

export type PlaceOption = {
  value: string;
  label: string;
  hint?: string;         // right-aligned, e.g. "12 departures"
  search?: string;       // extra matchable text (station towns)
  group?: string;
};

type Props = {
  label: string;
  value: string;
  placeholder: string;
  options: PlaceOption[];
  onChange: (value: string) => void;
};

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function PlaceInput({ label, value, placeholder, options, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = options.find(o => o.value === value);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    const hits = q
      ? options.filter(o => fold(o.label).includes(q) || (o.search && fold(o.search).includes(q)))
      : options;
    // Prefix matches first when searching.
    if (q) hits.sort((a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)));
    return hits.slice(0, 80);
  }, [options, query]);

  function choose(o: PlaceOption | undefined) {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open) choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur(); }
  }

  return (
    <div className="field place">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="place-box">
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={current ? current.label : placeholder}
          className={current && !open ? 'has-value' : undefined}
          value={open ? query : current?.label ?? ''}
          onFocus={() => { setOpen(true); setActive(0); }}
          onBlur={() => { setOpen(false); setQuery(''); }}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            className="place-clear"
            aria-label={`Clear ${label}`}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(''); setQuery(''); }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      {open && (
        <ul className="place-list" id={`${id}-list`} role="listbox" onMouseDown={e => e.preventDefault()}>
          {matches.length === 0 && <li className="place-empty">No station matches “{query}”</li>}
          {matches.map((o, i) => {
            const header = o.group && o.group !== matches[i - 1]?.group ? o.group : null;
            return [
              header && <li key={`g-${header}`} className="place-group" role="presentation">{header}</li>,
              <li
                key={o.value}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                {o.hint && <span className="place-hint">{o.hint}</span>}
              </li>,
            ];
          })}
        </ul>
      )}
    </div>
  );
}
