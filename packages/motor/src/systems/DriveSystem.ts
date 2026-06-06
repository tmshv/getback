import type { GrassField } from "../grass/GrassField.js";
import { densityAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";
import type { Attractor } from "../entities/Attractor.js";
import { config } from "../config.js";

// Hunger and thirst rise every frame regardless of behavior (§8.1: "they keep
// rising even while fleeing"). Hunger falls while grazing (proportional to local
// grass density). Thirst falls while the sheep is inside a water attractor radius.
// All drives are clamped to [0,1].
export function driveSystem(
  sheep: Sheep[],
  grass: GrassField,
  attractors: readonly Attractor[],
  dt: number,
): void {
  const { hungerRate, grazeRate, thirstRate, drinkRate } = config.drives;
  for (const s of sheep) {
    // hunger
    const dens = densityAt(grass, s.pos.x, s.pos.y);
    const nextHunger = s.drives.hunger + hungerRate * dt - grazeRate * dens * dt;
    s.drives.hunger = nextHunger < 0 ? 0 : nextHunger > 1 ? 1 : nextHunger;

    // thirst: check if inside any water attractor
    let drinking = false;
    for (const a of attractors) {
      if (a.kind !== "water") continue;
      const dx = s.pos.x - a.pos.x;
      const dy = s.pos.y - a.pos.y;
      if (dx * dx + dy * dy <= a.radius * a.radius) {
        drinking = true;
        break;
      }
    }
    const nextThirst = s.drives.thirst + thirstRate * dt - (drinking ? drinkRate * dt : 0);
    s.drives.thirst = nextThirst < 0 ? 0 : nextThirst > 1 ? 1 : nextThirst;
  }
}
