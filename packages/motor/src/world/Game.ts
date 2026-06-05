import type { World } from "./World.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem } from "../systems/MovementSystem.js";

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {}

  update(dt: number): void {
    neighborhoodSystem(this.world.sheep, this.world.grid);
    steeringSystem(this.world.sheep, dt);
    movementSystem(this.world.sheep, dt);
  }
}
