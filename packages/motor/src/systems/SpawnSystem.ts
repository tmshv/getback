import type { World } from "../world/World.js";
import { resetSheep } from "../entities/Sheep.js";

/**
 * Tick the sheep Emitter by `dt`; for each returned spawn position, acquire
 * a Sheep from the pool, reset it to that position, and push it into world.sheep.
 *
 * Guards for null pool/emitter so the system is safe in headless examples that
 * do not configure spawn infrastructure.
 */
export function spawnSystem(world: World, dt = 0): void {
  const { sheepPool, sheepEmitter } = world;
  if (!sheepPool || !sheepEmitter) return;

  const positions = sheepEmitter.update(dt);
  for (const pos of positions) {
    const sheep = sheepPool.acquire(pos);
    resetSheep(sheep, pos);
    world.sheep.push(sheep);
    sheepEmitter.active++;
  }
}
