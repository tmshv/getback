// Pure formatters for the debug overlay: entity state → display strings and
// vector endpoints. No pixi here — kept testable and headless.

import type { Vec2 } from "@getback/math";
import type { Sheep, Dog } from "@getback/motor";
import { classifySheepMode } from "@getback/motor";

/** Endpoint of a vector drawn from `pos` along `vec`, scaled for visibility. */
export function vectorEnd(pos: Vec2, vec: Vec2, scale: number): Vec2 {
  return { x: pos.x + vec.x * scale, y: pos.y + vec.y * scale };
}

/** Text tag for a sheep: mode (+ flee flag) then drive levels. */
export function sheepLabel(sheep: Sheep): string[] {
  const { mode, fleeing } = classifySheepMode(sheep.debug?.fired ?? []);
  const d = sheep.drives;
  return [
    fleeing ? `${mode} +flee` : mode,
    `hun ${d.hunger.toFixed(2)} thi ${d.thirst.toFixed(2)} fear ${d.fear.toFixed(2)}`,
  ];
}

/** Text tag for the dog: stamina, active buff, bark cooldown. */
export function dogLabel(dog: Dog): string[] {
  const lines = [`stamina ${Math.round(dog.stamina)}`];
  if (dog.activeBuff) lines.push(`buff ${dog.activeBuff.kind} ${dog.activeBuff.timeLeft.toFixed(1)}`);
  if (dog.barkCooldown > 0) lines.push(`cd ${dog.barkCooldown.toFixed(1)}`);
  return lines;
}
