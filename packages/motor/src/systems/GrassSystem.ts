import type { GrassField } from "../grass/GrassField.js";
import { regrow, depleteAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";

// Grass regrows everywhere; each sheep nibbles the cell it stands on. (Until
// behavior-gated grazing arrives, every sheep grazes continuously — fine: the
// herd's wandering still depletes and frees pasture.)
export function grassSystem(grass: GrassField, sheep: Sheep[], dt: number): void {
  regrow(grass, dt);
  const amount = grass.depleteRate * dt;
  for (const s of sheep) depleteAt(grass, s.pos.x, s.pos.y, amount);
}
