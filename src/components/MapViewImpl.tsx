'use client';
import { useEffect, useRef } from 'react';
import { CITY_COORDS } from '@/lib/constants';

type Props = { route: string[]; mini?: boolean };

export default function MapViewImpl({ route, mini }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let map: import('leaflet').Map | null = null;
    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !ref.current) return;

      const pts = route
        .map(c => CITY_COORDS[c])
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

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.polyline(pts, { color: '#06544a', weight: mini ? 2 : 3, opacity: 0.85 }).addTo(map);

      pts.forEach((pt, i) => {
        const isEnd = i === 0 || i === pts.length - 1;
        L.circleMarker(pt, {
          radius: isEnd ? 5 : 3.5,
          color: '#fff',
          weight: 1.5,
          fillColor: i === 0 ? '#0a6640' : i === pts.length - 1 ? '#b91c1c' : '#06544a',
          fillOpacity: 1,
        }).addTo(map!);
      });

      const bounds = L.latLngBounds(pts);
      map.fitBounds(bounds, { padding: [12, 12] });
      setTimeout(() => map?.invalidateSize(), 60);
    })();

    return () => { cancelled = true; map?.remove(); };
  }, [route, mini]);

  return <div ref={ref} style={{ width: '100%', height: '100%', isolation: 'isolate' }} />;
}
