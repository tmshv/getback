import type { Vec2 } from "@getback/math";
import { signedArea, pointInPolygon } from "@getback/math";
import type { Sheep } from "../entities/Sheep.js";

export interface Segment {
  a: Vec2;
  b: Vec2;
}

export interface Pen {
  outline: Vec2[];
  gateEdge: number;
  fences: Segment[];
  gate: { mouth: Segment; inwardNormal: Vec2 };
  centroid: Vec2;
  contained: Set<Sheep>;
}

// One geometry, two derived models: the CLOSED ring is the containment polygon
// (point-in-polygon), and the same edges MINUS the gate are the solid fence.
export function buildPen(outline: Vec2[], gateEdge: number): Pen {
  const n = outline.length;
  const fences: Segment[] = [];
  let mouth: Segment = { a: outline[0]!, b: outline[1 % n]! };
  for (let i = 0; i < n; i++) {
    const seg: Segment = { a: outline[i]!, b: outline[(i + 1) % n]! };
    if (i === gateEdge) mouth = seg;
    else fences.push(seg);
  }

  // inward normal of the gate edge, from polygon winding. For a CCW ring the
  // interior is to the LEFT of each directed edge A->B; left normal of (dx,dy) is
  // (-dy, dx). Flip for CW.
  const ccw = signedArea(outline) > 0;
  let nx = -(mouth.b.y - mouth.a.y);
  let ny = mouth.b.x - mouth.a.x;
  if (!ccw) {
    nx = -nx;
    ny = -ny;
  }
  const m = Math.hypot(nx, ny);
  const inwardNormal: Vec2 = m > 0 ? { x: nx / m, y: ny / m } : { x: 0, y: 1 };

  let cx = 0;
  let cy = 0;
  for (const v of outline) {
    cx += v.x;
    cy += v.y;
  }
  const centroid: Vec2 = { x: cx / n, y: cy / n };

  return { outline, gateEdge, fences, gate: { mouth, inwardNormal }, centroid, contained: new Set() };
}

export function penContains(pen: Pen, p: Vec2): boolean {
  return pointInPolygon(p, pen.outline);
}
