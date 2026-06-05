import type { Vec2 } from "@getback/math";
import { closestPointOnSegment, segmentsIntersect } from "@getback/math";
import type { Mobile } from "../types.js";
import type { Pen, Segment } from "../world/Pen.js";

// Place the unit at `radius` distance from the segment on the side `nx,ny` points
// to, at the closest point to the unit's (post-move) position; then remove the
// velocity component pointing across (slide). `nx,ny` is a UNIT normal already
// oriented toward the keep-side.
function clampToSide(u: Mobile, seg: Segment, nx: number, ny: number): void {
  const cp = closestPointOnSegment(u.pos, seg.a, seg.b);
  u.pos.x = cp.point.x + nx * u.radius;
  u.pos.y = cp.point.y + ny * u.radius;
  const vn = u.vel.x * nx + u.vel.y * ny;
  if (vn < 0) {
    u.vel.x -= vn * nx;
    u.vel.y -= vn * ny;
  }
}

function resolveFence(u: Mobile, seg: Segment): void {
  const prev = u.prevPos ?? u.pos;
  let nx = -(seg.b.y - seg.a.y);
  let ny = seg.b.x - seg.a.x;
  const len = Math.hypot(nx, ny);
  if (len === 0) return;
  nx /= len;
  ny /= len;
  if ((prev.x - seg.a.x) * nx + (prev.y - seg.a.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  if (segmentsIntersect(prev, u.pos, seg.a, seg.b)) {
    clampToSide(u, seg, nx, ny);
    return;
  }
  const cp = closestPointOnSegment(u.pos, seg.a, seg.b);
  const dx = u.pos.x - cp.point.x;
  const dy = u.pos.y - cp.point.y;
  const d = Math.hypot(dx, dy);
  if (d > 0 && d < u.radius) {
    const ox = dx / d;
    const oy = dy / d;
    const push = u.radius - d;
    u.pos.x += ox * push;
    u.pos.y += oy * push;
    const vn = u.vel.x * ox + u.vel.y * oy;
    if (vn < 0) {
      u.vel.x -= vn * ox;
      u.vel.y -= vn * oy;
    }
  }
}

// The gate is one-way: a unit may cross it INWARD freely, but a unit crossing
// OUTWARD this frame is clamped back inside.
function resolveGate(u: Mobile, mouth: Segment, inwardNormal: Vec2): void {
  const prev = u.prevPos ?? u.pos;
  if (!segmentsIntersect(prev, u.pos, mouth.a, mouth.b)) return;
  const moveDotInward = (u.pos.x - prev.x) * inwardNormal.x + (u.pos.y - prev.y) * inwardNormal.y;
  if (moveDotInward >= 0) return;
  clampToSide(u, mouth, inwardNormal.x, inwardNormal.y);
}

// Keep units on the correct side of every solid fence, and one-way at the gate.
// Runs after movement. A pen has only a handful of segments, so iterate directly.
export function fenceCollisionSystem(pen: Pen, units: Mobile[]): void {
  for (const u of units) {
    for (const seg of pen.fences) resolveFence(u, seg);
    resolveGate(u, pen.gate.mouth, pen.gate.inwardNormal);
  }
}
