import type { Vec2 } from "@getback/math";

// 2D uniform grid for broad-phase neighbour queries over moving agents.
// String cell keys avoid hash collisions (correctness over micro-perf at this scale).
export class UniformGrid<T extends { pos: Vec2 }> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): string {
    return cx + "," + cy;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.pos.x / this.cellSize);
    const cy = Math.floor(item.pos.y / this.cellSize);
    const k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push(item);
  }

  // Returns all items in cells overlapping the query disc's AABB — a superset
  // (broad-phase). Callers do the precise distance check. No false negatives.
  queryRadius(center: Vec2, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minCx = Math.floor((center.x - radius) / this.cellSize);
    const maxCx = Math.floor((center.x + radius) / this.cellSize);
    const minCy = Math.floor((center.y - radius) / this.cellSize);
    const maxCy = Math.floor((center.y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const it of arr) out.push(it);
      }
    }
    return out;
  }
}
