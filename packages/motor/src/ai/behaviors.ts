import type { Mobile } from "../types.js";
import type { BehaviorNode } from "../steering/types.js";
import { seek } from "../steering/primitives.js";

// All three return a Reynolds steering force (desiredVelocity - velocity) so
// their magnitudes are comparable for the weighted blend. Each writes into `out`
// and returns "fired" (a zero force is a valid, neutral contribution).

// Steer away from neighbours closer than `personalSpace`, weighted by 1/distance.
export function separation(personalSpace: number): BehaviorNode {
  return {
    run(e: Mobile, ctx, out) {
      let ax = 0;
      let ay = 0;
      for (const n of ctx.neighbors) {
        if (n === e) continue;
        const dx = e.pos.x - n.pos.x;
        const dy = e.pos.y - n.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < personalSpace) {
          ax += dx / d / d;
          ay += dy / d / d;
        }
      }
      const m = Math.hypot(ax, ay);
      if (m === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      out.x = (ax / m) * e.maxSpeed - e.vel.x;
      out.y = (ay / m) * e.maxSpeed - e.vel.y;
      return "fired";
    },
  };
}

// Steer toward the centroid of the `k` nearest neighbours (Strömbom rule).
export function cohesion(k: number): BehaviorNode {
  const scratch: { n: Mobile; d2: number }[] = [];
  return {
    run(e: Mobile, ctx, out) {
      scratch.length = 0;
      for (const n of ctx.neighbors) {
        if (n === e) continue;
        const dx = n.pos.x - e.pos.x;
        const dy = n.pos.y - e.pos.y;
        scratch.push({ n, d2: dx * dx + dy * dy });
      }
      if (scratch.length === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      scratch.sort((a, b) => a.d2 - b.d2);
      const count = Math.min(k, scratch.length);
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < count; i++) {
        cx += scratch[i]!.n.pos.x;
        cy += scratch[i]!.n.pos.y;
      }
      seek(e, { x: cx / count, y: cy / count }, out);
      return "fired";
    },
  };
}

// Align toward the average heading of neighbours that are actually moving
// (speed above `moveThreshold`). Contagious motion; stationary grazers ignored.
export function follow(moveThreshold: number): BehaviorNode {
  const t2 = moveThreshold * moveThreshold;
  return {
    run(e: Mobile, ctx, out) {
      let vx = 0;
      let vy = 0;
      for (const n of ctx.neighbors) {
        if (n === e) continue;
        if (n.vel.x * n.vel.x + n.vel.y * n.vel.y >= t2) {
          vx += n.vel.x;
          vy += n.vel.y;
        }
      }
      const m = Math.hypot(vx, vy);
      if (m === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      out.x = (vx / m) * e.maxSpeed - e.vel.x;
      out.y = (vy / m) * e.maxSpeed - e.vel.y;
      return "fired";
    },
  };
}
