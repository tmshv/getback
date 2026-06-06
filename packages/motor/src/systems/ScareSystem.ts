import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import type { StressSource } from "../scare/StressSource.js";
import type { GameSignals } from "../world/signals.js";
import { config } from "../config.js";

// Rebuild the per-frame stress list: a low-intensity `presence` field at the dog
// (gentle constant herding pressure) plus a strong `bark` field when the player
// barks and the dog's cooldown is ready. A megabark buff widens the bark field;
// barks emit `signals.barked` at the dog position.
export function scareSystem(
  stress: StressSource[],
  dog: Dog | null,
  intent: DogIntent,
  dt: number,
  signals?: GameSignals,
): void {
  stress.length = 0;
  if (!dog) return;
  stress.push({
    kind: "presence",
    pos: { x: dog.pos.x, y: dog.pos.y },
    radius: config.scare.presenceRadius,
    intensity: config.scare.presenceIntensity,
  });
  if (dog.barkCooldown > 0) dog.barkCooldown -= dt;
  if (intent.bark && dog.barkCooldown <= 0 && dog.stamina >= config.stamina.barkCost) {
    const megabark = dog.activeBuff?.kind === "megabark";
    const radius = config.scare.barkRadius * (megabark ? config.buffs.megabark.radiusMult : 1);
    stress.push({
      kind: "bark",
      pos: { x: dog.pos.x, y: dog.pos.y },
      radius,
      intensity: config.scare.barkIntensity,
    });
    dog.barkCooldown = config.scare.barkCooldown;
    dog.stamina -= config.stamina.barkCost;
    signals?.barked.emit({ x: dog.pos.x, y: dog.pos.y });
  }
}
