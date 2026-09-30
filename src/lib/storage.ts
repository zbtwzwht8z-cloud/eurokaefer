'use client';
// localStorage that never throws (private mode, blocked storage, SSR).
import { useCallback, useSyncExternalStore } from 'react';

export function loadJSON<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function saveJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage unavailable — the feature just doesn't persist
  }
}

// ── Saved trips: an external store over localStorage ────────────────────────
// useSyncExternalStore gives an empty set during SSR/hydration and the stored
// set right after, with no hydration mismatch and no setState-in-effect.

const SAVED_KEY = 'ek:saved';
const EMPTY: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let cache: { raw: string | null; set: ReadonlySet<string> } = { raw: null, set: EMPTY };
let memoryOnly = false; // storage write failed once → keep saves in memory

function readSaved(): ReadonlySet<string> {
  if (memoryOnly) return cache.set;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(SAVED_KEY); } catch { return cache.set; }
  if (raw !== cache.raw) {
    let keys: unknown = [];
    try { keys = JSON.parse(raw ?? '[]'); } catch { /* corrupt → empty */ }
    cache = { raw, set: new Set(Array.isArray(keys) ? keys.filter(k => typeof k === 'string') : []) };
  }
  return cache.set;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange); // other tabs
  return () => { listeners.delete(onChange); window.removeEventListener('storage', onChange); };
}

/** Saved trips (route keys), persisted per browser. */
export function useSaved(): [ReadonlySet<string>, (key: string) => void] {
  const saved = useSyncExternalStore(subscribe, readSaved, () => EMPTY);
  const toggle = useCallback((key: string) => {
    const next = new Set(readSaved());
    if (next.has(key)) next.delete(key); else next.add(key);
    const raw = JSON.stringify([...next]);
    if (!saveJSON(SAVED_KEY, [...next])) memoryOnly = true;
    cache = { raw, set: next };
    listeners.forEach(l => l());
  }, []);
  return [saved, toggle];
}
