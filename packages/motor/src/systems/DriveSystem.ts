import type { GrassField } from "../grass/GrassField.js";
import { densityAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";
import { config } from "../config.js";

// Hunger rises over time and falls while a sheep stands on grass (proportional
// to local density — grazing). Clamped to [0,1].
export function driveSystem(sheep: Sheep[], grass: GrassField, dt: number): void {
  const { hungerRate, grazeRate } = config.drives;
  for (const s of sheep) {
    const dens = densityAt(grass, s.pos.x, s.pos.y);
    const next = s.drives.hunger + hungerRate * dt - grazeRate * dens * dt;
    s.drives.hunger = next < 0 ? 0 : next > 1 ? 1 : next;
  }
}
