import type { World } from "./World.js";
import { config } from "../config.js";
import { grassSystem } from "../systems/GrassSystem.js";
import { driveSystem } from "../systems/DriveSystem.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem, integrate } from "../systems/MovementSystem.js";
import { collisionSystem } from "../systems/CollisionSystem.js";
import { penSystem } from "../systems/PenSystem.js";
import { fenceCollisionSystem, dogPenCollisionSystem } from "../systems/FenceCollisionSystem.js";
import type { DogIntent } from "../types.js";
import { dogControlSystem } from "../systems/DogControlSystem.js";
import { scareSystem } from "../systems/ScareSystem.js";
import { fearSystem } from "../systems/FearSystem.js";
import { staminaSystem } from "../systems/StaminaSystem.js";
import { respawnSystem } from "../systems/RespawnSystem.js";

// Frozen so the shared default can never be mutated by a future consumer.
const NEUTRAL_INTENT: DogIntent = Object.freeze({
  moveDir: Object.freeze({ x: 0, y: 0 }),
  sprint: false,
  bark: false,
}) as DogIntent;

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {}

  update(dt: number, intent: DogIntent = NEUTRAL_INTENT): void {
    const step = Math.min(dt, config.dtClampMax);
    const { sheep, grass, obstacles, attractors, pen, grid, dog, stress } = this.world;
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, attractors, step);
    neighborhoodSystem(sheep, grid);
    scareSystem(stress, dog, intent, step);
    fearSystem(sheep, stress, step);
    // Resolve the primary water + shade attractors for the steering context
    // (first of each kind; later plans may use nearest-neighbour lookup).
    const water = attractors.find((a) => a.kind === "water") ?? null;
    const shade = attractors.find((a) => a.kind === "shade") ?? null;
    steeringSystem(sheep, { grass, obstacles, stress, pen, water, shade }, step);
    if (dog) dogControlSystem(dog, intent);
    if (dog) staminaSystem(dog, intent, step);
    movementSystem(sheep, step);
    if (dog) integrate(dog, step);
    collisionSystem(sheep, obstacles);
    if (dog) collisionSystem([dog], obstacles);
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      if (dog) dogPenCollisionSystem(pen, dog);
      penSystem(pen, sheep);
    }
    respawnSystem(this.world);
  }
}
