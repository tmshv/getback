import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import { config } from "../config.js";

// Sprinting (moving + sprint held + has stamina) drains stamina; otherwise it
// regenerates. Clamped to [0, max]. Bark cost is handled in ScareSystem.
export function staminaSystem(dog: Dog, intent: DogIntent, dt: number): void {
  const moving = intent.moveDir.x !== 0 || intent.moveDir.y !== 0;
  const sprinting = intent.sprint && moving && dog.stamina > 0;
  if (sprinting) {
    dog.stamina -= config.stamina.sprintDrain * dt;
  } else {
    dog.stamina += config.stamina.regen * dt;
  }
  if (dog.stamina < 0) dog.stamina = 0;
  if (dog.stamina > config.stamina.max) dog.stamina = config.stamina.max;
}
