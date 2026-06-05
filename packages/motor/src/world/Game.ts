import type { World } from "./World.js";
import { config } from "../config.js";
import { grassSystem } from "../systems/GrassSystem.js";
import { driveSystem } from "../systems/DriveSystem.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem } from "../systems/MovementSystem.js";
import { collisionSystem } from "../systems/CollisionSystem.js";

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {}

  update(dt: number): void {
    const step = Math.min(dt, config.dtClampMax);
    const { sheep, grass, obstacles, grid } = this.world;
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, step);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, { grass, obstacles }, step);
    movementSystem(sheep, step);
    collisionSystem(sheep, obstacles);
  }
}
