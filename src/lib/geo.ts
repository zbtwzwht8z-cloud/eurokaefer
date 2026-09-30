import type { Coord } from './types';

export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Points along a gentle arc from a to b, always bowing to the right of the
 * direction of travel — so A→B and B→A draw as two separate curves and
 * direction is readable even without animation.
 */
export function arc(a: Coord, b: Coord, bend = 0.16, steps = 28): Coord[] {
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180); // lng → planar
  const ax = a[1] * k, ay = a[0];
  const bx = b[1] * k, by = b[0];
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) return [a, b];
  // Right-hand normal of the travel vector, scaled by distance.
  const cx = (ax + bx) / 2 + dy * bend;
  const cy = (ay + by) / 2 - dx * bend;
  const pts: Coord[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx;
    const y = u * u * ay + 2 * u * t * cy + t * t * by;
    pts.push([y, x / k]);
  }
  return pts;
}
