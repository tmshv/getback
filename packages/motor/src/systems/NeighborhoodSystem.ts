import type { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";

// Rebuild the grid from current positions, then fill each sheep's neighbors with
// the others inside its perception radius (precise check after the broad-phase).
export function neighborhoodSystem(sheep: Sheep[], grid: UniformGrid<Sheep>): void {
  grid.clear();
  for (const s of sheep) grid.insert(s);
  const candidates: Sheep[] = [];
  for (const s of sheep) {
    s.neighbors.length = 0;
    const r = s.traits.perception;
    grid.queryRadius(s.pos, r, candidates);
    const r2 = r * r;
    for (const c of candidates) {
      if (c === s) continue;
      const dx = c.pos.x - s.pos.x;
      const dy = c.pos.y - s.pos.y;
      if (dx * dx + dy * dy <= r2) s.neighbors.push(c);
    }
  }
}
