import type { GrassField } from "../grass/GrassField.js";
import { regrow, depleteAt, depleteRateAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";

// Grass regrows everywhere; each sheep nibbles the cell it stands on, draining it
// at that cell's own deplete rate (so different patches graze down over different
// times: ~10–20s for one sheep at the configured range).
export function grassSystem(grass: GrassField, sheep: Sheep[], dt: number): void {
  regrow(grass, dt);
  for (const s of sheep) depleteAt(grass, s.pos.x, s.pos.y, depleteRateAt(grass, s.pos.x, s.pos.y) * dt);
}
