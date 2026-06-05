import type { Pen } from "../world/Pen.js";
import { penContains } from "../world/Pen.js";
import type { Sheep } from "../entities/Sheep.js";

// Capture: a sheep whose position is inside the pen polygon is flagged `penned`
// and added to `pen.contained`. Recomputed each frame (no fence yet to hold them
// in — physical containment + a sticky penned state arrive in the next plan).
export function penSystem(pen: Pen, sheep: Sheep[]): void {
  pen.contained.clear();
  for (const s of sheep) {
    s.penned = penContains(pen, s.pos);
    if (s.penned) pen.contained.add(s);
  }
}
