import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { StressSource } from "../scare/StressSource.js";
import type { SteerContext } from "../steering/types.js";
import type { Pen } from "../world/Pen.js";
import type { Attractor } from "../entities/Attractor.js";
import { config } from "../config.js";

// World refs the steering trees read each frame (grows as more behaviors land).
export interface SteerEnv {
  grass: GrassField;
  obstacles: readonly Obstacle[];
  stress: readonly StressSource[];
  pen?: Pen | null;
  water?: Attractor | null;
  shade?: Attractor | null;
}

export function steeringSystem(sheep: Sheep[], env: SteerEnv, dt: number): void {
  for (const s of sheep) {
    const ctx: SteerContext = {
      neighbors: s.neighbors,
      grass: env.grass,
      obstacles: env.obstacles,
      stress: env.stress,
      fear: s.drives.fear,
      dt,
      penned: s.penned,
      penCentroid: env.pen ? env.pen.centroid : null,
      water: env.water ?? null,
      shade: env.shade ?? null,
    };
    // Debug side-channel: clear the fired-label list for this frame; the tree's
    // `tag` nodes refill it during run(). (No-op when debug is absent.)
    if (s.debug) s.debug.fired.length = 0;
    s.root.run(s, ctx, s.force);

    // Settle-when-content: a calm, well-fed sheep whose net steering force is just
    // micro-jitter (forces near equilibrium) brakes to a full stop instead of
    // drifting back and forth. Otherwise the move force is amplified by accelGain
    // so the sheep reaches speed quickly. Both decisions read the RAW blended
    // force so the deadband threshold stays in un-scaled units.
    const st = config.flock.settle;
    const fMag = Math.hypot(s.force.x, s.force.y);
    const speed = Math.hypot(s.vel.x, s.vel.y);
    const d = s.drives;
    const contented = d.hunger < st.hungerMax && d.thirst < st.thirstMax && d.fear < st.fearMax;
    if (contented && speed < st.speedMax && fMag < st.forceThreshold) {
      // Cap the brake gain at 1/dt so vel *= (1 - gain*dt) never goes negative:
      // a too-aggressive brake would overshoot zero and flip the facing back and
      // forth ("<><>") instead of settling. See DogControlSystem for the detail.
      const bg = Math.min(st.brakeGain, 1 / dt);
      s.force.x = -s.vel.x * bg;
      s.force.y = -s.vel.y * bg;
    } else {
      const g = config.flock.accelGain;
      s.force.x *= g;
      s.force.y *= g;
    }

    // Snapshot the steering force before MovementSystem zeroes it post-integration.
    if (s.debug) {
      s.debug.force.x = s.force.x;
      s.debug.force.y = s.force.y;
    }
  }
}
