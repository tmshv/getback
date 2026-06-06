import type { Dog, BuffKind } from "../entities/Dog.js";
import { config } from "../config.js";

// Duration table keyed by BuffKind.
const DURATIONS: Record<BuffKind, number> = {
  zoomies:  config.buffs.zoomies.duration,
  megabark: config.buffs.megabark.duration,
  calm:     config.buffs.calm.duration,
};

/** Grant the dog a buff, replacing any currently active one. */
export function grantBuff(dog: Dog, kind: BuffKind): void {
  dog.activeBuff = { kind, timeLeft: DURATIONS[kind] };
}

/** Tick the active buff timer; expire to null when exhausted. */
export function buffSystem(dog: Dog, dt: number): void {
  if (!dog.activeBuff) return;
  dog.activeBuff.timeLeft -= dt;
  if (dog.activeBuff.timeLeft <= 0) dog.activeBuff = null;
}
