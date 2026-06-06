import type { Dog, BuffKind } from "../entities/Dog.js";
import type { Treat } from "../entities/Treat.js";
import type { AgentPool } from "../world/Pool.js";
import type { GameSignals } from "../world/signals.js";
import type { Rng } from "@getback/math";
import { grantBuff } from "./BuffSystem.js";
import { config } from "../config.js";

const BUFF_KINDS: readonly BuffKind[] = ["zoomies", "megabark", "calm"];

// Scan active treats; consume any that the dog overlaps.
// Always refills stamina to max. With probability `buffChance` also grants a
// random buff (via BuffSystem.grantBuff). Emits `signals.treatCollected` with
// the treat position. Released treats go back to the pool. Returns the number of
// treats consumed so the caller can keep the treat Emitter's `active` cap in
// sync (every consumed treat was counted in `active` when it spawned).
export function pickupSystem(
  dog: Dog,
  active: Treat[],
  pool: AgentPool<Treat>,
  signals: GameSignals,
  rng?: Rng,
): number {
  let consumed = 0;
  for (let i = active.length - 1; i >= 0; i--) {
    const treat = active[i]!;
    const dx = dog.pos.x - treat.pos.x;
    const dy = dog.pos.y - treat.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= dog.radius + treat.radius) continue;

    // Consume
    active.splice(i, 1);
    pool.release(treat);
    consumed++;

    // Refill stamina
    dog.stamina = config.stamina.max;

    // Maybe grant a buff
    if (rng && rng.float() < config.treats.buffChance) {
      const kind = rng.pick(BUFF_KINDS);
      grantBuff(dog, kind);
    }

    // Signal FX/HUD
    signals.treatCollected.emit({ x: treat.pos.x, y: treat.pos.y });
  }
  return consumed;
}
