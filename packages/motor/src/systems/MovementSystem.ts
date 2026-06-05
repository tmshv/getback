import type { Mobile } from "../types.js";
import { directionFromVelocity } from "../direction.js";
import { config } from "../config.js";

// Semi-implicit (symplectic) Euler: update velocity first, then advance position
// with the NEW velocity. `force` is assumed already accumulated by SteeringSystem.
export function integrate(e: Mobile, dt: number): void {
  if (e.prevPos) {
    e.prevPos.x = e.pos.x;
    e.prevPos.y = e.pos.y;
  } else {
    e.prevPos = { x: e.pos.x, y: e.pos.y };
  }
  const fl = Math.hypot(e.force.x, e.force.y);
  if (fl > e.maxForce && fl > 0) {
    const s = e.maxForce / fl;
    e.force.x *= s;
    e.force.y *= s;
  }
  e.vel.x += e.force.x * dt;
  e.vel.y += e.force.y * dt;
  const sl = Math.hypot(e.vel.x, e.vel.y);
  if (sl > e.maxSpeed && sl > 0) {
    const s = e.maxSpeed / sl;
    e.vel.x *= s;
    e.vel.y *= s;
  }
  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  if (fl < 1e-6) {
    const damp = Math.pow(config.damping, dt);
    e.vel.x *= damp;
    e.vel.y *= damp;
  }
  e.facing = directionFromVelocity(e.vel, e.facing);
  e.force.x = 0;
  e.force.y = 0;
}

export function movementSystem(entities: Mobile[], dt: number): void {
  const clamped = Math.min(dt, config.dtClampMax);
  for (const e of entities) integrate(e, clamped);
}
