import type { GrassField } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";
import type { SteerContext } from "../steering/types.js";

// Evaluate each sheep's behavior tree, writing the resulting steering force into
// `sheep.force` for MovementSystem to integrate.
export function steeringSystem(sheep: Sheep[], grass: GrassField, dt: number): void {
  for (const s of sheep) {
    const ctx: SteerContext = { neighbors: s.neighbors, grass, dt };
    s.root.run(s, ctx, s.force);
  }
}
