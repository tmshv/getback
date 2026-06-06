import type { Pen } from "../world/Pen.js";
import { penContains } from "../world/Pen.js";
import type { Sheep } from "../entities/Sheep.js";
import type { GameSignals } from "../world/signals.js";

// Capture: a sheep whose position is inside the pen polygon is flagged `penned`
// and added to `pen.contained`. Emits `signals.sheepPenned` for each sheep that
// was NOT previously penned but is penned now (first crossing only).
export function penSystem(pen: Pen, sheep: Sheep[], signals?: GameSignals): void {
  const prev = new Set(pen.contained);
  pen.contained.clear();
  for (const s of sheep) {
    s.penned = penContains(pen, s.pos);
    if (s.penned) {
      pen.contained.add(s);
      if (!prev.has(s)) signals?.sheepPenned.emit();
    }
  }
}
