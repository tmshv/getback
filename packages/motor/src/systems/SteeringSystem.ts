import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { StressSource } from "../scare/StressSource.js";
import type { SteerContext } from "../steering/types.js";
import type { Pen } from "../world/Pen.js";

// World refs the steering trees read each frame (grows as more behaviors land).
export interface SteerEnv {
  grass: GrassField;
  obstacles: readonly Obstacle[];
  stress: readonly StressSource[];
  pen?: Pen | null;
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
    };
    s.root.run(s, ctx, s.force);
  }
}
