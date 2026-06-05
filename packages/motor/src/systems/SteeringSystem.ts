import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { StressSource } from "../scare/StressSource.js";
import type { SteerContext } from "../steering/types.js";

// World refs the steering trees read each frame (grows as more behaviors land).
export interface SteerEnv {
  grass: GrassField;
  obstacles: readonly Obstacle[];
  stress: readonly StressSource[];
}

export function steeringSystem(sheep: Sheep[], env: SteerEnv, dt: number): void {
  for (const s of sheep) {
    const ctx: SteerContext = { neighbors: s.neighbors, grass: env.grass, obstacles: env.obstacles, stress: env.stress, dt };
    s.root.run(s, ctx, s.force);
  }
}
