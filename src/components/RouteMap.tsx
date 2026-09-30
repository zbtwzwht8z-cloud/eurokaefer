'use client';
// Client-only (loaded via next/dynamic, ssr: false) — Leaflet needs `window`.
import { useEffect, useLayoutEffect, useRef } from 'react';
import L from 'leaflet';
import type { Chain, Coord, Leg } from '@/lib/types';
import type { PlaceInfo } from '@/lib/filters';
import { arc, haversineKm } from '@/lib/geo';

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

// Leaflet paints SVG/canvas with literal colors (no CSS vars).
const INK = '#16181b';
const ACCENT = '#f0521a';

function legsPath(legs: Leg[]): Coord[] {
  const pts: Coord[] = [];
  for (const l of legs) pts.push(...arc(l.offer.origin, l.offer.dest));
  return pts;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export default function RouteMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{
    routes: L.LayerGroup; stations: L.LayerGroup; hover: L.LayerGroup; selected: L.LayerGroup;
    routeCanvas: L.Canvas; stationCanvas: L.Canvas;
  } | null>(null);
  const paths = useRef(new Map<string, Coord[]>());
  // Latest callbacks for Leaflet handlers, without rebinding every layer.
  const cb = useRef(props);
  useLayoutEffect(() => { cb.current = props; });

  // ── Create the map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, minZoom: 3, maxZoom: 14, zoomSnap: 0.25, zoomDelta: 0.5, worldCopyJump: true })
      .setView([48.5, 9], 5);
    L.control.zoom({ position: 'topright' }).addTo(m);

    // Z-order via panes: routes < place labels < stations < hover < selection.
    for (const [name, z] of [['routes', 410], ['labels', 415], ['stations', 420], ['hover', 430], ['selected', 440], ['stops', 450]] as const) {
      m.createPane(name).style.zIndex = String(z);
    }
    m.getPane('labels')!.style.pointerEvents = 'none';

    // CARTO basemaps now need an API key (they serve an "API KEY REQUIRED"
    // watermark tile otherwise). Esri's Light Gray Canvas is keyless and
    // quiet enough for data on top; labels come as a separate layer.
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
    L.tileLayer(`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16,
      attribution: 'Tiles © <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, © OpenStreetMap contributors',
    }).addTo(m);
    L.tileLayer(`${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16, pane: 'labels', opacity: 0.85,
    }).addTo(m);
    layers.current = {
      routes: L.layerGroup().addTo(m),
      stations: L.layerGroup().addTo(m),
      hover: L.layerGroup().addTo(m),
      selected: L.layerGroup().addTo(m),
      // One canvas per pane, reused across redraws (a new one per redraw leaks).
      routeCanvas: L.canvas({ pane: 'routes', tolerance: 6 }),
      stationCanvas: L.canvas({ pane: 'stations', tolerance: 4 }),
    };
    map.current = m;

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; layers.current = null; };
  }, []);

  // ── Background routes ─────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current, lg = layers.current;
    if (!m || !lg) return;
    lg.routes.clearLayers();
    paths.current.clear();
    const renderer = lg.routeCanvas;
    const bounds = L.latLngBounds([]);

    // Draw weakest first so the best-ranked routes sit on top.
    for (let i = props.chains.length - 1; i >= 0; i--) {
      const c = props.chains[i];
      const pts = legsPath(c.legs);
      paths.current.set(c.key, pts);
      pts.forEach(p => bounds.extend(p));
      L.polyline(pts, {
        renderer,
        color: c.isLoop ? ACCENT : INK,
        weight: c.isLoop ? 2 : 1.5,
        opacity: c.isLoop ? 0.7 : 0.34,
        lineCap: 'round',
        lineJoin: 'round',
      })
        .on('mouseover', () => cb.current.onHover(c.key))
        .on('mouseout', () => cb.current.onHover(null))
        .on('click', () => cb.current.onSelect(c.key))
        .addTo(lg.routes);
    }
    if (!props.selected && bounds.isValid()) {
      m.fitBounds(bounds, { padding: [32, 32], maxZoom: 7, animate: true });
    }
    // Selection changes refit on their own; don't refit on hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.chains]);

  // ── Stations ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const lg = layers.current;
    if (!lg) return;
    lg.stations.clearLayers();
    const renderer = lg.stationCanvas;
    for (const p of props.places.values()) {
      const focus = p.name === props.focusPlace;
      L.circleMarker(p.coord, {
        renderer,
        radius: focus ? 6 : p.departures > 0 ? 3.6 : 2.6,
        color: focus ? ACCENT : INK,
        weight: focus ? 2.5 : 1.2,
        fillColor: '#ffffff',
        fillOpacity: 1,
      })
        .bindTooltip(
          `<b>${escapeHtml(p.name)}</b><br>${p.departures} leaving · ${p.arrivals} arriving` +
            (p.departures ? '<br><span class="tt-hint">Click for trips from here</span>' : ''),
          { direction: 'top', offset: [0, -6], className: 'tt' },
        )
        .on('click', () => { if (p.departures) cb.current.onPickPlace(p.name); })
        .addTo(lg.stations);
    }
  }, [props.places, props.focusPlace]);

  // ── Hover highlight ───────────────────────────────────────────────────────
  useEffect(() => {
    const lg = layers.current;
    if (!lg) return;
    lg.hover.clearLayers();
    const key = props.hoverKey;
    if (!key || key === props.selected?.chain.key) return;
    const pts = paths.current.get(key);
    if (!pts) return;
    L.polyline(pts, { pane: 'hover', color: '#ffffff', weight: 6, opacity: 0.9, interactive: false }).addTo(lg.hover);
    L.polyline(pts, { pane: 'hover', color: INK, weight: 2.6, opacity: 0.95, interactive: false }).addTo(lg.hover);
  }, [props.hoverKey, props.selected]);

  // ── Selected trip ─────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current, lg = layers.current;
    if (!m || !lg) return;
    lg.selected.clearLayers();
    const sel = props.selected;
    if (!sel) return;
    const { legs, chain } = sel;
    const bounds = L.latLngBounds([]);

    legs.forEach((leg, i) => {
      const pts = arc(leg.offer.origin, leg.offer.dest);
      pts.forEach(p => bounds.extend(p));
      L.polyline(pts, { pane: 'selected', color: '#ffffff', weight: 9, opacity: 1, interactive: false }).addTo(lg.selected);
      L.polyline(pts, { pane: 'selected', color: ACCENT, weight: 4.5, opacity: 1, interactive: false }).addTo(lg.selected);
      // Marching dots show direction of travel.
      L.polyline(pts, { pane: 'selected', color: '#ffffff', weight: 2.4, opacity: 0.95, interactive: false, className: 'flow' }).addTo(lg.selected);
      // Hand-over between drop-off and the next pickup, if they differ.
      const nextLeg = legs[i + 1];
      if (nextLeg && haversineKm(leg.offer.dest, nextLeg.offer.origin) > 2) {
        L.polyline([leg.offer.dest, nextLeg.offer.origin], {
          pane: 'selected', color: INK, weight: 2, opacity: 0.7, dashArray: '2 6', interactive: false,
        }).addTo(lg.selected);
      }
    });

    // Numbered stop labels, transit-map style.
    const stops: Array<{ at: Coord; name: string }> = [
      { at: legs[0].offer.origin, name: legs[0].offer.originName },
      ...legs.map(l => ({ at: l.offer.dest, name: l.offer.destName })),
    ];
    stops.forEach((s, i) => {
      const closesLoop = i === stops.length - 1 && chain.isLoop && haversineKm(s.at, stops[0].at) < 3;
      if (closesLoop) return; // start marker already marks it
      const icon = L.divIcon({
        className: 'stop-pin',
        html: `<span class="pin-n">${i + 1}</span><span class="pin-label">${escapeHtml(s.name)}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker(s.at, { icon, pane: 'stops', interactive: false, keyboard: false }).addTo(lg.selected);
    });

    const pad = Math.min(56, Math.round(m.getSize().x / 10));
    if (bounds.isValid()) m.fitBounds(bounds, { padding: [pad, pad], maxZoom: 9, animate: true });
  }, [props.selected]);

  return <div ref={el} className={'map' + (props.selected ? ' has-selection' : '')} role="region" aria-label="Map of trips" />;
}
