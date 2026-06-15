import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";

// Reynolds steering. Each primitive WRITES the steering force into `out`
// (allocation-free): steer = desiredVelocity - currentVelocity.

export function seek(e: Mobile, target: Vec2, out: Vec2): void {
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const d = Math.hypot(dx, dy);
  const sx = d > 0 ? (dx / d) * e.maxSpeed : 0;
  const sy = d > 0 ? (dy / d) * e.maxSpeed : 0;
  out.x = sx - e.vel.x;
  out.y = sy - e.vel.y;
}

// Flee is the negation of seek's desired velocity minus current velocity.
export function flee(e: Mobile, target: Vec2, out: Vec2): void {
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const d = Math.hypot(dx, dy);
  const sx = d > 0 ? (dx / d) * e.maxSpeed : 0;
  const sy = d > 0 ? (dy / d) * e.maxSpeed : 0;
  // Use (x || 0) to convert -0 to +0 — toEqual distinguishes them.
  out.x = (-sx - e.vel.x) || 0;
  out.y = (-sy - e.vel.y) || 0;
}

// Reynolds seek with a "satisfied" dead zone plus an eased ramp: within `satisfied`
// of the target the agent feels NO pull (it's close enough — drinking, resting,
// huddled), so a crowd converging on one point stops fighting over the exact
// centre. Beyond it the desired speed ramps from 0 (at the boundary, so there is
// no discontinuity) up to maxSpeed over `ramp` px. Writes the steering force into
// `out` and returns whether a non-zero pull was produced.
export function arriveBand(
  e: Mobile, tx: number, ty: number, satisfied: number, ramp: number, out: Vec2,
): boolean {
  const dx = tx - e.pos.x;
  const dy = ty - e.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= satisfied) {
    out.x = 0;
    out.y = 0;
    return false;
  }
  const speed = e.maxSpeed * Math.min(1, (dist - satisfied) / ramp);
  out.x = (dx / dist) * speed - e.vel.x;
  out.y = (dy / dist) * speed - e.vel.y;
  return true;
}

// Arrive: like seek, but the desired speed ramps from maxSpeed down to 0 as the
// agent gets within `slowRadius` of the target, preventing overshoot.
export function arrive(e: Mobile, target: Vec2, slowRadius: number, out: Vec2): void {
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    out.x = -e.vel.x;
    out.y = -e.vel.y;
    return;
  }
  const speed = d < slowRadius ? e.maxSpeed * (d / slowRadius) : e.maxSpeed;
  out.x = (dx / d) * speed - e.vel.x;
  out.y = (dy / d) * speed - e.vel.y;
}
