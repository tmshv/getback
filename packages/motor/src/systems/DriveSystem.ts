import type { GrassField } from "../grass/GrassField.js";
import { densityAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";
import type { SheepGoal } from "../types.js";
import type { Attractor } from "../entities/Attractor.js";
import { config } from "../config.js";

// Pick a sheep's forage goal with hysteresis: once it starts grazing/drinking it
// keeps going until the drive is SATED (not just back under the threshold), so it
// doesn't flap on and off at the boundary. Thirst takes priority over hunger —
// BUT only when water exists; with no water to drink, a thirsty sheep must not
// lock onto an impossible "drink" goal, it falls back to grazing if hungry.
export function classifyGoal(prev: SheepGoal, hunger: number, thirst: number, hasWater: boolean): SheepGoal {
  const f = config.flock;
  // Keep foraging until sated (hysteresis).
  if (prev === "drink" && thirst > f.thirstSated && hasWater) return "drink";
  if (prev === "graze" && hunger > f.hungerSated) return "graze";
  // Otherwise (re)select by threshold; a thirsty sheep drinks before it grazes.
  if (hasWater && thirst >= f.thirstThreshold) return "drink";
  if (hunger >= f.hungerThreshold) return "graze";
  return "idle";
}

// Hunger and thirst RISE every frame regardless of behavior (§8.1: they keep
// rising even while fleeing). They FALL only while the sheep is actively foraging:
// hunger while grazing on grass, thirst while drinking inside a water attractor.
// So an idle sheep's drives climb until it crosses a threshold, forages until
// sated, then idles again — it eats/drinks from time to time instead of camping a
// resource forever. All drives are clamped to [0,1].
export function driveSystem(
  sheep: Sheep[],
  grass: GrassField,
  attractors: readonly Attractor[],
  dt: number,
): void {
  const { hungerRate, grazeRate, thirstRate, drinkRate } = config.drives;
  const hasWater = attractors.some((a) => a.kind === "water");
  for (const s of sheep) {
    const goal = classifyGoal(s.goal, s.drives.hunger, s.drives.thirst, hasWater);
    s.goal = goal;

    // hunger: rises always; grazing on grass eats it down
    const dens = densityAt(grass, s.pos.x, s.pos.y);
    let nextHunger = s.drives.hunger + hungerRate * dt;
    if (goal === "graze") nextHunger -= grazeRate * dens * dt;
    s.drives.hunger = nextHunger < 0 ? 0 : nextHunger > 1 ? 1 : nextHunger;

    // thirst: rises always; drinking inside a water attractor quenches it
    let inWater = false;
    if (goal === "drink") {
      for (const a of attractors) {
        if (a.kind !== "water") continue;
        const dx = s.pos.x - a.pos.x;
        const dy = s.pos.y - a.pos.y;
        if (dx * dx + dy * dy <= a.radius * a.radius) {
          inWater = true;
          break;
        }
      }
    }
    let nextThirst = s.drives.thirst + thirstRate * dt - (inWater ? drinkRate * dt : 0);
    s.drives.thirst = nextThirst < 0 ? 0 : nextThirst > 1 ? 1 : nextThirst;
  }
}
