import rpip from "robust-point-in-polygon";
import type { Vec2 } from "./vec2.js";

export interface ClosestResult {
  point: Vec2;
  t: number;
  distSq: number;
}

// Closest point on segment ab to p, with the projection parameter clamped to [0,1].
// When t hits 0 or 1 the closest feature is the vertex (the rounded-cap case).
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): ClosestResult {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  let t = denom === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  const dx = p.x - point.x;
  const dy = p.y - point.y;
  return { point, t, distSq: dx * dx + dy * dy };
}

// Signed area via the shoelace formula. Positive = counter-clockwise winding.
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const isCCW = (poly: Vec2[]): boolean => signedArea(poly) > 0;

// Ray-cast point-in-polygon (robust, concave-safe) via robust-point-in-polygon.
// rpip returns -1 inside, 0 on boundary, 1 outside.
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  const ring = poly.map((v) => [v.x, v.y] as [number, number]);
  return rpip(ring, [p.x, p.y]) < 0;
}

// Do segments p1p2 and p3p4 intersect? Standard parametric test. Parallel/
// collinear segments return false (we don't need collinear-overlap handling).
export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
