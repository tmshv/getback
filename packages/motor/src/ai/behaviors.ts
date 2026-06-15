import type { Mobile } from "../types.js";
import type { BehaviorNode, Predicate } from "../steering/types.js";
import { arrive, arriveBand } from "../steering/primitives.js";
import { gradientAt } from "../grass/GrassField.js";

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

// Steer toward the centroid of the `k` nearest neighbours (Strömbom rule), but
// only once the flock is farther than `comfort` — inside that radius the sheep is
// already huddled and feels NO pull. This dead zone is what stops the cohesion↔
// separation tug-of-war: separation pushes apart below personalSpace, cohesion
// pulls in only above `comfort` (which must be wider than personalSpace), leaving
// a neutral band in between where a resting sheep sits still instead of jittering.
// Beyond `comfort` the desired speed ramps from 0 up to maxSpeed over `ramp` px,
// so the pull eases in at the boundary rather than yanking the sheep back through.
export function cohesion(k: number, comfort: number, ramp: number): BehaviorNode {
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
      // Pull toward the centroid only once outside the comfort band, easing in.
      arriveBand(e, cx / count, cy / count, comfort, ramp, out);
      const boost = 1 + ctx.fear; // scared sheep pull toward the flock harder (bunch)
      out.x *= boost;
      out.y *= boost;
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

// Follow the grass-density gradient toward greener cells (Reynolds steer toward
// the desired direction). Zero gradient (uniform/flat grass) => no force.
export function graze(): BehaviorNode {
  const g = { x: 0, y: 0 };
  return {
    run(e, ctx, out) {
      gradientAt(ctx.grass, e.pos.x, e.pos.y, g);
      const m = Math.hypot(g.x, g.y);
      if (m === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      out.x = (g.x / m) * e.maxSpeed - e.vel.x;
      out.y = (g.y / m) * e.maxSpeed - e.vel.y;
      return "fired";
    },
  };
}

// Soft look-ahead repulsion: steer away from obstacles within (radius+avoidRadius),
// stronger the closer they are. Reynolds steer toward the away-direction.
export function obstacleAvoid(avoidRadius: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      let ax = 0;
      let ay = 0;
      for (const o of ctx.obstacles) {
        const dx = e.pos.x - o.pos.x;
        const dy = e.pos.y - o.pos.y;
        const d = Math.hypot(dx, dy);
        const range = o.radius + avoidRadius;
        if (d > 0 && d < range) {
          const strength = (range - d) / range;
          ax += (dx / d) * strength;
          ay += (dy / d) * strength;
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

// Steer away from stress sources within range, weighted by intensity and
// proximity (closer + stronger => more push). Reynolds steer toward the away dir.
export function fleeStress(): BehaviorNode {
  return {
    run(e, ctx, out) {
      let ax = 0;
      let ay = 0;
      for (const s of ctx.stress) {
        const dx = e.pos.x - s.pos.x;
        const dy = e.pos.y - s.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < s.radius) {
          const strength = (s.intensity * (s.radius - d)) / s.radius;
          ax += (dx / d) * strength;
          ay += (dy / d) * strength;
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

// Calmly converge on the pen centre once penned: arrive (speed ramps to 0 near
// the centroid) so penned sheep mill near the middle instead of pressing the
// gate. Skips (zero force) when there is no pen centroid to seek.
export function penInterior(slowRadius: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      const c = ctx.penCentroid;
      if (!c) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      arrive(e, c, slowRadius, out);
      return "fired";
    },
  };
}

// True while the steering sheep is inside the pen.
export const isPenned: Predicate = (_e, ctx) => ctx.penned === true;

// Head to the water attractor, but feel no pull once inside its radius — the
// sheep is already drinking there (DriveSystem quenches thirst inside the same
// radius), so a crowd doesn't fight over the exact centre. Skips (zero force)
// when ctx.water is absent. `ramp` eases the approach in from the rim.
export function drink(ramp: number, satisfiedFraction: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      const w = ctx.water;
      if (!w) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      arriveBand(e, w.pos.x, w.pos.y, w.radius * satisfiedFraction, ramp, out);
      return "fired";
    },
  };
}

// Content default: stand still. Produces no steering force, so the settle damper
// brings the sheep to a calm stop — a sheep that is neither hungry, thirsty, nor
// scared just rests where it is instead of cruising around. (Tagged "rest" in the
// tree so the debug overlay names the resting state.)
export function idle(): BehaviorNode {
  return {
    run(_e, _ctx, out) {
      out.x = 0;
      out.y = 0;
      return "fired";
    },
  };
}

// The active goal is chosen once per frame by DriveSystem (with hysteresis); the
// tree just routes to the matching behavior. `goalIs("drink")` gates the drink
// leaf, etc. Goal lives on the Sheep entity; we cast since the tree only runs on
// sheep (a non-sheep Mobile has no goal and matches nothing).
export const goalIs = (goal: string): Predicate => (e) => (e as { goal?: string }).goal === goal;
