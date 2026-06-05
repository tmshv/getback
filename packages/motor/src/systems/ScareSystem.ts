import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";

// Rebuild the per-frame stress list: a low-intensity `presence` field at the dog
// (gentle constant herding pressure) plus a strong `bark` field when the player
// barks and the dog's cooldown is ready.
export function scareSystem(stress: StressSource[], dog: Dog | null, intent: DogIntent, dt: number): void {
  stress.length = 0;
  if (!dog) return;
  stress.push({
    kind: "presence",
    pos: { x: dog.pos.x, y: dog.pos.y },
    radius: config.scare.presenceRadius,
    intensity: config.scare.presenceIntensity,
  });
  if (dog.barkCooldown > 0) dog.barkCooldown -= dt;
  if (intent.bark && dog.barkCooldown <= 0) {
    stress.push({
      kind: "bark",
      pos: { x: dog.pos.x, y: dog.pos.y },
      radius: config.scare.barkRadius,
      intensity: config.scare.barkIntensity,
    });
    dog.barkCooldown = config.scare.barkCooldown;
  }
}
