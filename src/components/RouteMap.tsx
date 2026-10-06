'use client';
// Client-only (loaded via next/dynamic, ssr: false) — MapLibre needs WebGL.
//
// What's drawn, and why:
// - The *network*, not every trip. Trips share legs, so drawing each trip
//   stacks the same road dozens of times. Each distinct relocation A→B is one
//   line (width = how many cars run it; dashed = no €1 car on it).
// - Places as dots sized by how many cars leave from them.
// - Hovered / selected trip on top, everything else fades back.
import { useEffect, useLayoutEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Chain, Coord, Leg } from '@/lib/types';
import type { PlaceInfo } from '@/lib/filters';
import { arc, haversineKm } from '@/lib/geo';
import { fmtEur } from '@/lib/format';

type Props = {
  chains: Chain[];
  selected: { chain: Chain; legs: Leg[] } | null;
  hoverKey: string | null;
  places: Map<string, PlaceInfo>;
  focusPlace: string;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
  onPickPlace: (name: string) => void;
};

// Keyless vector tiles (CARTO raster tiles now demand an API key).
// "Liberty" has terrain relief and real colours; softened on load below.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const FONT_BOLD = ['Noto Sans Bold'];

const NET = '#2c4a7c';      // deep blue: routes with a €1 car
const NET_PAID = '#7b8594'; // grey: routes with only paid cars
const ACCENT = '#f0521a';   // selection
const INK = '#16181b';

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };

/** [lat,lng] → [lng,lat] for GeoJSON. */
const ll = (c: Coord): [number, number] => [c[1], c[0]];
const line = (pts: Coord[]) => ({ type: 'LineString' as const, coordinates: pts.map(ll) });

function networkOf(chains: Chain[]): FC {
  type Edge = { from: string; to: string; a: Coord; b: Coord; ids: Set<string>; eur1: boolean; min: number; trips: number };
  const edges = new Map<string, Edge>();
  for (const c of chains) {
    for (const v of c.variants) {
      for (const o of v.offers) {
        const k = `${o.originName}→${o.destName}`;
        let e = edges.get(k);
        if (!e) edges.set(k, (e = { from: o.originName, to: o.destName, a: o.origin, b: o.dest, ids: new Set(), eur1: false, min: Infinity, trips: 0 }));
        e.ids.add(o.id);
        if (o.priceEur <= 1) e.eur1 = true;
        e.min = Math.min(e.min, o.priceEur);
      }
    }
    for (const l of c.legs) {
      const e = edges.get(`${l.offer.originName}→${l.offer.destName}`);
      if (e) e.trips++;
    }
  }
  // Fading paid-only routes only helps when there are €1 routes to compare
  // against; for a small or all-paid result set, draw everything at full
  // strength so the results are actually visible.
  const all = [...edges.values()];
  const fadePaid = all.length > 20 && all.some(e => e.eur1);
  return {
    type: 'FeatureCollection',
    features: all.map(e => ({
      type: 'Feature',
      geometry: line(arc(e.a, e.b, 0.14, 32)),
      properties: {
        from: e.from, to: e.to, cars: e.ids.size, eur1: e.eur1, min: e.min, trips: e.trips,
        emph: e.eur1 || !fadePaid,
        // width multiplier: few routes → bolder; faded paid routes → thinner
        w: all.length <= 20 ? 1.7 : e.eur1 || !fadePaid ? 1 : 0.7,
      },
    })),
  };
}

function placesOf(places: Map<string, PlaceInfo>, focus: string): FC {
  return {
    type: 'FeatureCollection',
    features: [...places.values()].map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll(p.coord) },
      properties: { name: p.name, dep: p.departures, arr: p.arrivals, focus: p.name === focus },
    })),
  };
}

function legsLine(legs: Leg[]): FC {
  const features: GeoJSON.Feature[] = legs.map(l => ({
    type: 'Feature', geometry: line(arc(l.offer.origin, l.offer.dest, 0.14, 40)), properties: { kind: 'drive' },
  }));
  legs.forEach((l, i) => {
    const n = legs[i + 1];
    if (n && haversineKm(l.offer.dest, n.offer.origin) > 2) {
      features.push({ type: 'Feature', geometry: line([l.offer.dest, n.offer.origin]), properties: { kind: 'hop' } });
    }
  });
  return { type: 'FeatureCollection', features };
}

function stopsOf(chain: Chain, legs: Leg[]): FC {
  const stops = [
    { at: legs[0].offer.origin, name: legs[0].offer.originName },
    ...legs.map(l => ({ at: l.offer.dest, name: l.offer.destName })),
  ];
  return {
    type: 'FeatureCollection',
    features: stops.flatMap((s, i) => {
      const closesLoop = i === stops.length - 1 && chain.isLoop && haversineKm(s.at, stops[0].at) < 3;
      if (closesLoop) return [];
      return [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: ll(s.at) }, properties: { n: String(i + 1), name: s.name } }];
    }),
  };
}

function boundsOf(fc: FC): LngLatBoundsLike | null {
  let w = 180, s = 90, e = -180, n = -90, any = false;
  const visit = (c: number[]) => { any = true; w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); };
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === 'Point') visit(g.coordinates);
    else if (g.type === 'LineString') g.coordinates.forEach(visit);
  }
  return any ? [[w, s], [e, n]] : null;
}

/** White chevron used as a direction marker along the selected route. */
function arrowImage(): ImageData {
  const size = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(11, 8); ctx.lineTo(21, 16); ctx.lineTo(11, 24);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

// Worker served from /public (see scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function RouteMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const cb = useRef(props);
  useLayoutEffect(() => { cb.current = props; });

  // ── Create the map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [9, 48.5],
      zoom: 4.2,
      minZoom: 2.5,
      maxZoom: 14,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'ek-pop', maxWidth: '260px' });

    map.on('load', () => {
      soften(map);
      // Compact attribution starts expanded; collapse it to the ⓘ button so it
      // doesn't cover stops on small maps (still one tap away).
      el.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      // Basemap sprites already contain an "arrow" — namespace ours.
      if (!map.hasImage('ek-arrow')) map.addImage('ek-arrow', arrowImage(), { pixelRatio: 2 });

      for (const id of ['network', 'places', 'hover', 'sel', 'stops']) {
        map.addSource(id, { type: 'geojson', data: EMPTY });
      }

      // Network — under the place dots, width by number of cars.
      map.addLayer({
        id: 'net', type: 'line', source: 'network',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['get', 'emph'], NET, NET_PAID],
          'line-opacity': ['case', ['get', 'emph'], 0.7, 0.22],
          'line-width': ['interpolate', ['linear'], ['zoom'],
            4, ['*', ['get', 'w'], ['interpolate', ['linear'], ['get', 'cars'], 1, 1.1, 6, 2.8]],
            9, ['*', ['get', 'w'], ['interpolate', ['linear'], ['get', 'cars'], 1, 2.4, 6, 5.5]]],
        },
      });
      // Fat invisible line = comfortable hover target.
      map.addLayer({
        id: 'net-hit', type: 'line', source: 'network',
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 },
      });

      map.addLayer({
        id: 'hover-casing', type: 'line', source: 'hover',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'hover-line', type: 'line', source: 'hover',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': INK, 'line-width': 3 },
      });

      map.addLayer({
        id: 'sel-hop', type: 'line', source: 'sel', filter: ['==', ['get', 'kind'], 'hop'],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': INK, 'line-width': 2, 'line-dasharray': [0.5, 2.5], 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'sel-casing', type: 'line', source: 'sel', filter: ['==', ['get', 'kind'], 'drive'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 10 },
      });
      map.addLayer({
        id: 'sel-line', type: 'line', source: 'sel', filter: ['==', ['get', 'kind'], 'drive'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': 5 },
      });
      map.addLayer({
        id: 'sel-arrows', type: 'symbol', source: 'sel', filter: ['==', ['get', 'kind'], 'drive'],
        layout: {
          'symbol-placement': 'line', 'symbol-spacing': 110, 'icon-image': 'ek-arrow',
          'icon-size': 0.9, 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map',
        },
      });

      // Places — dots sized by departures; labels for real hubs only.
      map.addLayer({
        id: 'place-dots', type: 'circle', source: 'places',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            4, ['case', ['get', 'focus'], 7, ['interpolate', ['linear'], ['get', 'dep'], 0, 2, 1, 3, 12, 6.5]],
            9, ['case', ['get', 'focus'], 10, ['interpolate', ['linear'], ['get', 'dep'], 0, 3, 1, 5, 12, 10]]],
          'circle-color': ['case', ['get', 'focus'], ACCENT, ['>', ['get', 'dep'], 0], '#ffffff', '#e7e9ec'],
          'circle-stroke-color': ['case', ['get', 'focus'], '#ffffff', NET],
          'circle-stroke-width': ['case', ['get', 'focus'], 2.5, ['>', ['get', 'dep'], 0], 1.8, 1],
        },
      });
      map.addLayer({
        id: 'place-labels', type: 'symbol', source: 'places',
        filter: ['get', 'focus'],
        layout: {
          'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-size': 12,
          'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true,
          'symbol-sort-key': ['-', 0, ['get', 'dep']],
        },
        paint: { 'text-color': '#2a3340', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });

      // Selected stops on top of everything.
      map.addLayer({
        id: 'stop-dots', type: 'circle', source: 'stops',
        paint: { 'circle-radius': 11, 'circle-color': INK, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
      });
      map.addLayer({
        id: 'stop-nums', type: 'symbol', source: 'stops',
        layout: { 'text-field': ['get', 'n'], 'text-font': FONT_BOLD, 'text-size': 11.5, 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'stop-names', type: 'symbol', source: 'stops',
        layout: {
          'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-size': 13,
          'text-anchor': 'left', 'text-offset': [1.3, 0], 'text-allow-overlap': true,
        },
        paint: { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });

      // ── Interactions ──────────────────────────────────────────────────────
      map.on('mouseenter', 'place-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mousemove', 'place-dots', e => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        popup.setLngLat(e.lngLat).setHTML(
          `<b>${esc(p.name)}</b><span>${p.dep} leaving · ${p.arr} arriving</span>` +
          (p.dep > 0 ? '<em>Click for trips from here</em>' : ''),
        ).addTo(map);
      });
      map.on('mouseleave', 'place-dots', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      map.on('click', 'place-dots', e => {
        const p = e.features?.[0]?.properties;
        if (p && p.dep > 0) cb.current.onPickPlace(p.name);
      });

      map.on('mousemove', 'net-hit', e => {
        if (map.queryRenderedFeatures(e.point, { layers: ['place-dots'] }).length) return;
        const p = e.features?.[0]?.properties;
        if (!p) return;
        popup.setLngLat(e.lngLat).setHTML(
          `<b>${esc(p.from)} → ${esc(p.to)}</b><span>${p.cars} ${p.cars === 1 ? 'car' : 'cars'} · from ${fmtEur(p.min)}</span>`,
        ).addTo(map);
      });
      map.on('mouseleave', 'net-hit', () => popup.remove());

      ready.current = true;
      const p = cb.current;
      syncNetwork(map, p);
      syncPlaces(map, p);
      syncSelected(map, p);
      syncHover(map, p);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); popup.remove(); map.remove(); mapRef.current = null; ready.current = false; };
  }, []);

  // ── Keep sources in sync with props ──────────────────────────────────────
  const live = () => (ready.current ? mapRef.current : null);
  useEffect(() => { const m = live(); if (m) syncNetwork(m, props); }, [props.chains]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = live(); if (m) syncPlaces(m, props); }, [props.places, props.focusPlace]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = live(); if (m) syncSelected(m, props); }, [props.selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = live(); if (m) syncHover(m, props); }, [props.hoverKey, props.selected, props.chains]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map" role="region" aria-label="Map of trips" />;
}

// ── Sync: props → map sources ───────────────────────────────────────────────

function syncNetwork(map: MLMap, p: Props) {
  const fc = networkOf(p.chains);
  (map.getSource('network') as GeoJSONSource).setData(fc);
  if (!p.selected) {
    const b = boundsOf(fc);
    if (b) map.fitBounds(b, { padding: pad(map, 40), maxZoom: 7, duration: reduceMotion() ? 0 : 700 });
  }
}

function syncPlaces(map: MLMap, p: Props) {
  (map.getSource('places') as GeoJSONSource).setData(placesOf(p.places, p.focusPlace));
}

function syncHover(map: MLMap, p: Props) {
  const chain = p.hoverKey && p.hoverKey !== p.selected?.chain.key ? p.chains.find(c => c.key === p.hoverKey) : undefined;
  (map.getSource('hover') as GeoJSONSource).setData(chain ? legsLine(chain.legs) : EMPTY);
  fade(map, !!(chain || p.selected));
}

function syncSelected(map: MLMap, p: Props) {
  const sel = p.selected;
  const route = sel ? legsLine(sel.legs) : EMPTY;
  (map.getSource('sel') as GeoJSONSource).setData(route);
  (map.getSource('stops') as GeoJSONSource).setData(sel ? stopsOf(sel.chain, sel.legs) : EMPTY);
  if (sel) {
    const b = boundsOf(route);
    if (b) map.fitBounds(b, { padding: pad(map, 64), maxZoom: 9, duration: reduceMotion() ? 0 : 800 });
  }
}

/** Calm the basemap down so routes are the loudest thing on it. */
function soften(map: MLMap) {
  type PaintProp = Parameters<MLMap['setPaintProperty']>[1];
  const paint = (id: string, prop: PaintProp, value: Parameters<MLMap['setPaintProperty']>[2]) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
  };
  const hide = (id: string) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); };
  paint('water', 'fill-color', '#c4dcf2');
  // Low-zoom shaded relief carries its own saturated ocean blue on top of the
  // water fill: keep the terrain, lose the loud blue.
  paint('natural_earth', 'raster-saturation', -0.4);
  paint('natural_earth', 'raster-opacity', ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.38, 6, 0.06]);
  for (const id of ['waterway_river', 'waterway_other', 'waterway_tunnel']) paint(id, 'line-color', '#b4d1ec');
  for (const id of ['label_city', 'label_city_capital', 'label_town']) paint(id, 'text-color', '#3a4350');
  for (const id of ['label_country_1', 'label_country_2', 'label_country_3']) paint(id, 'text-color', '#6b7480');
  for (const id of ['poi_r1', 'poi_r7', 'poi_r20', 'building-3d']) hide(id);
}

/** Dim the network + dots while a single trip is in focus. */
function fade(map: MLMap, focused: boolean) {
  map.setPaintProperty('net', 'line-opacity', focused ? 0.1 : ['case', ['get', 'emph'], 0.7, 0.22]);
  map.setPaintProperty('place-dots', 'circle-opacity', focused ? 0.45 : 1);
  map.setPaintProperty('place-dots', 'circle-stroke-opacity', focused ? 0.45 : 1);
  map.setPaintProperty('place-labels', 'text-opacity', focused ? 0.35 : 1);
}

function pad(map: MLMap, max: number): number {
  const { width } = map.getContainer().getBoundingClientRect();
  return Math.min(max, Math.round(width / 10));
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
