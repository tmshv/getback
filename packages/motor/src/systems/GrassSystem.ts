import type { GrassField } from "../grass/GrassField.js";
import { regrow, depleteAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";

// Dynamic grass: regrow everywhere, each sheep nibbles the cell it stands on.
// NOTE: currently DISABLED in Game — the world uses a frozen random grass field
// (see World.defaultGrass), so this is not called each tick. Kept as the opt-in
// dynamic model: call it from Game.update to bring grazing depletion + regrow back.
export function grassSystem(grass: GrassField, sheep: Sheep[], dt: number): void {
  regrow(grass, dt);
  const amount = grass.depleteRate * dt;
  for (const s of sheep) depleteAt(grass, s.pos.x, s.pos.y, amount);
}
