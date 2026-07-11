import type { GrassField } from "../grass/GrassField.js";
import { depleteAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";

// Grazing wears grass down: a sheep that is actively GRAZING eats the cell under
// it (an idle, drinking, or fleeing sheep does not). There is NO regrow — grass is
// a finite resource that gets used up over a session, so sheep roam toward fresher
// patches and the pasture visibly thins where the herd feeds.
export function grassSystem(grass: GrassField, sheep: Sheep[], dt: number): void {
  const amount = grass.depleteRate * dt;
  for (const s of sheep) {
    if (s.goal === "graze") depleteAt(grass, s.pos.x, s.pos.y, amount);
  }
}
