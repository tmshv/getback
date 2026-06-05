import type { World } from "./World.js";
import { config } from "../config.js";
import { createGrassField } from "../grass/GrassField.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem } from "../systems/MovementSystem.js";

// Placeholder until Task P3-5 wires grass into World.
const _placeholderGrass = createGrassField({ cols: 1, rows: 1, cellSize: 1e6, regrowRate: 0, depleteRate: 0, initial: 0 });

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {}

  update(dt: number): void {
    // Clamp dt ONCE here so steering and movement always agree on the timestep
    // (prevents them disagreeing on a frame hitch). movementSystem also clamps
    // defensively for direct callers; clamping an already-clamped value is a no-op.
    const step = Math.min(dt, config.dtClampMax);
    neighborhoodSystem(this.world.sheep, this.world.grid);
    steeringSystem(this.world.sheep, _placeholderGrass, step);
    movementSystem(this.world.sheep, step);
  }
}
