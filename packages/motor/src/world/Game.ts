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
import { spawnSystem } from "../systems/SpawnSystem.js";
import { pickupSystem } from "../systems/PickupSystem.js";
import { buffSystem } from "../systems/BuffSystem.js";
import { ambientScareSystem } from "../systems/AmbientScareSystem.js";

// Frozen so the shared default can never be mutated by a future consumer.
const NEUTRAL_INTENT: DogIntent = Object.freeze({
  moveDir: Object.freeze({ x: 0, y: 0 }),
  sprint: false,
  bark: false,
}) as DogIntent;

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {
    world.signals.penFilled.add(() => this.spawnBonusTreat());
  }

  update(dt: number, intent: DogIntent = NEUTRAL_INTENT): void {
    const step = Math.min(dt, config.dtClampMax);
    const { sheep, grass, obstacles, attractors, pen, grid, dog, stress, signals,
            treats, treatPool, treatEmitter, ambientScareState } = this.world;

    if (dog) buffSystem(dog, step);
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, attractors, step);
    neighborhoodSystem(sheep, grid);
    // Rebuild the per-frame stress list (presence + optional bark), then add an
    // ambient pasture-wide source when the ambient timer fires.
    scareSystem(stress, dog, intent, step, signals);
    ambientScareSystem(ambientScareState, stress, step, signals);
    fearSystem(sheep, stress, step, dog);
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
      penSystem(pen, sheep, signals);
    }
    respawnSystem(this.world);
    spawnSystem(this.world, step);
    if (dog) pickupSystem(dog, treats, treatPool, signals, this.world.rng);

    // Drip-spawn treats using Plan 14's Emitter API: update(dt) returns Vec2[].
    // The treat emitter's geometry (rectGeometry over the pasture) determines
    // spawn position — no place-callback needed.
    const spawnPositions = treatEmitter.update(step);
    for (const pos of spawnPositions) {
      const t = treatPool.acquire(pos);
      t.pos.x = pos.x;
      t.pos.y = pos.y;
      treats.push(t);
      treatEmitter.active++;
    }
  }

  // Bonus treat spawned near the pen centroid when the flock is fully penned.
  // Uses emitNow(1) from Plan 14's Emitter to reset the accumulator (so the next
  // regular drip-emit is re-scheduled), then places the treat at the pen centroid.
  // emitNow bypasses the active-cap check, so we guard manually with config.treats.max.
  spawnBonusTreat(): void {
    const pen = this.world.pen;
    if (!pen) return;
    const { treats, treatPool, treatEmitter, rng } = this.world;
    if (treats.length >= config.treats.max) return; // respect cap
    // emitNow(1) resets the time accumulator and returns 1 geometry-sampled position.
    // We discard the geometry position and place near the pen centroid instead.
    treatEmitter.emitNow(1); // side effect: resets accumulator
    const pos = {
      x: pen.centroid.x + rng.range(-20, 20),
      y: pen.centroid.y + rng.range(-20, 20),
    };
    const t = treatPool.acquire(pos);
    t.pos.x = pos.x;
    t.pos.y = pos.y;
    treats.push(t);
    treatEmitter.active++;
  }
}
