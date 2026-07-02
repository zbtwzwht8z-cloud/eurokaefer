'use client';
import { useEffect, useRef } from 'react';
import { CITY_COORDS } from '@/lib/constants';

type Props = {
  route: string[];
  coords?: ([number, number] | null)[];  // exact station coords from the engine
  mini?: boolean;
};

// Palette-matched colors (Leaflet draws SVG, needs literals, not CSS vars).
const LINE = '#0284c7';    // sky blue — route
const ORIGIN = '#059669';  // green — start
const DEST = '#ea580c';    // sun orange — end
const MID = '#0284c7';

export default function MapViewImpl({ route, coords, mini }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let map: import('leaflet').Map | null = null;
    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !ref.current) return;

      // Prefer exact station coords; fall back to the city lookup table.
      const pts = route
        .map((c, i) => coords?.[i] ?? CITY_COORDS[c] ?? null)
        .filter((p): p is [number, number] => Array.isArray(p));

      if (pts.length < 2) {
        ref.current.style.cssText = 'background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--ink-3);font-size:13px;';
        ref.current.textContent = 'Map unavailable';
        return;
      }

      map = L.map(ref.current, {
        zoomControl: !mini,
        dragging: !mini,
        touchZoom: !mini,
        scrollWheelZoom: !mini,
        doubleClickZoom: !mini,
        boxZoom: !mini,
        keyboard: !mini,
        attributionControl: !mini,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      // White casing keeps the line crisp on the light basemap.
      L.polyline(pts, { color: '#ffffff', weight: mini ? 4.5 : 6, opacity: 0.9 }).addTo(map);
      L.polyline(pts, { color: LINE, weight: mini ? 2.5 : 3.5, opacity: 0.9 }).addTo(map);

      pts.forEach((pt, i) => {
        const isEnd = i === 0 || i === pts.length - 1;
        L.circleMarker(pt, {
          radius: isEnd ? 5 : 3.5,
          color: '#fff',
          weight: 1.5,
          fillColor: i === 0 ? ORIGIN : i === pts.length - 1 ? DEST : MID,
          fillOpacity: 1,
        }).addTo(map!);
      });

      const bounds = L.latLngBounds(pts);
      map.fitBounds(bounds, { padding: [12, 12] });
      setTimeout(() => map?.invalidateSize(), 60);
    })();

    return () => { cancelled = true; map?.remove(); };
  }, [route, coords, mini]);

  return <div ref={ref} style={{ width: '100%', height: '100%', isolation: 'isolate' }} />;
}
