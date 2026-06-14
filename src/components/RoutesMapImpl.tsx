'use client';
import { useEffect, useRef } from 'react';
import type { Chain } from '@/lib/chains';
import { tripKey } from '@/lib/chains';
import { CITY_COORDS } from '@/lib/constants';

type Props = {
  chains: Chain[];
  hoverKey: string | null;
  onSelect: (chain: Chain) => void;
  onHover?: (key: string | null) => void;
};

const MAX_LINES = 200;

function lineColor(c: Chain): string {
  if (c.loopTier === 'perfect') return '#d9920a';
  if (c.loopTier === 'imperfect') return '#f97316';
  if (c.homeOrigin) return '#0284c7';
  return '#5f7d8a';   // muted slate — darker than before so "other" routes read
}

function lineWeight(c: Chain): number {
  return c.loopTier ? 4.5 : c.homeOrigin ? 4 : 3;
}

function lineOpacity(c: Chain): number {
  return c.loopTier || c.homeOrigin ? 0.95 : 0.7;
}

function chainPoints(c: Chain): [number, number][] {
  const pts: [number, number][] = [];
  c.route.forEach((city, i) => {
    const p = c.coords?.[i] ?? CITY_COORDS[city] ?? null;
    if (p) pts.push(p);
  });
  return pts;
}

export default function RoutesMapImpl({ chains, hoverKey, onSelect, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const linesRef = useRef<Map<string, import('leaflet').Polyline>>(new Map());
  const baseStyleRef = useRef<Map<string, { color: string; weight: number; opacity: number }>>(new Map());
  // Keep latest callbacks without re-binding leaflet handlers
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: true, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
      map.setView([48.5, 8.5], 5);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      linesRef.current.clear();
    };
  }, []);

  // Sync polylines with the chain list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled) return;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();
      linesRef.current.clear();
      baseStyleRef.current.clear();

      const subset = chains.slice(0, MAX_LINES);
      const allPts: [number, number][] = [];

      // Draw boring lines first so loops/home routes sit on top.
      const ordered = [...subset].sort((a, b) => lineWeight(a) - lineWeight(b));

      for (const c of ordered) {
        const pts = chainPoints(c);
        if (pts.length < 2) continue;
        allPts.push(...pts);
        const key = tripKey(c);
        const weight = lineWeight(c);
        const style = { color: lineColor(c), weight, opacity: lineOpacity(c) };
        // White casing underneath so each colored line stays crisp against the
        // map and separates from overlapping routes (the "vague lines" fix).
        L.polyline(pts, {
          color: '#ffffff', weight: weight + 3.5, opacity: 0.9,
          lineCap: 'round', lineJoin: 'round', interactive: false,
        }).addTo(layer);
        const line = L.polyline(pts, {
          ...style, interactive: true, lineCap: 'round', lineJoin: 'round',
        });
        line.bindTooltip(
          `${c.route.join(' → ')}<br><span style="opacity:.7">${c.legs.length} leg${c.legs.length > 1 ? 's' : ''}` +
          `${c.loopTier ? ' · ' + (c.loopTier === 'perfect' ? '⭐ perfect loop' : '🔄 loop') : ''}</span>`,
          { sticky: true, direction: 'top', opacity: 0.95 },
        );
        line.on('mouseover', () => {
          highlight(key, true);
          onHoverRef.current?.(key);
        });
        line.on('mouseout', () => {
          highlight(key, false);
          onHoverRef.current?.(null);
        });
        line.on('click', () => onSelectRef.current(c));
        line.addTo(layer);
        linesRef.current.set(key, line);
        baseStyleRef.current.set(key, style);
      }

      if (allPts.length >= 2) {
        map.fitBounds(L.latLngBounds(allPts), { padding: [28, 28] });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chains]);

  function highlight(key: string, on: boolean) {
    const line = linesRef.current.get(key);
    const base = baseStyleRef.current.get(key);
    if (!line || !base) return;
    if (on) {
      line.setStyle({ weight: base.weight + 2.5, opacity: 1 });
      line.bringToFront();
      line.getElement()?.classList.add('route-flow');
    } else {
      line.setStyle({ weight: base.weight, opacity: base.opacity });
      line.getElement()?.classList.remove('route-flow');
    }
  }

  // External hover (from trip cards)
  const prevHover = useRef<string | null>(null);
  useEffect(() => {
    if (prevHover.current && prevHover.current !== hoverKey) highlight(prevHover.current, false);
    if (hoverKey) highlight(hoverKey, true);
    prevHover.current = hoverKey;
  }, [hoverKey]);

  return <div ref={ref} className="routes-map" style={{ isolation: 'isolate' }} />;
}
