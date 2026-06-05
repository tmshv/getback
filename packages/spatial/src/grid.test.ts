import { describe, it, expect } from "vitest";
import { UniformGrid } from "./grid.js";

interface P {
  pos: { x: number; y: number };
  id: number;
}

describe("UniformGrid", () => {
  it("returns all in-radius items with no false negatives", () => {
    const grid = new UniformGrid<P>(10);
    const near: P = { pos: { x: 5, y: 5 }, id: 1 };
    const alsoNear: P = { pos: { x: 12, y: 6 }, id: 2 };
    const far: P = { pos: { x: 200, y: 200 }, id: 3 };
    for (const p of [near, alsoNear, far]) grid.insert(p);

    const ids = grid.queryRadius({ x: 6, y: 6 }, 10).map((p) => p.id).sort();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3); // far cell never returned
  });

  it("clear() empties the grid", () => {
    const grid = new UniformGrid<P>(10);
    grid.insert({ pos: { x: 1, y: 1 }, id: 1 });
    grid.clear();
    expect(grid.queryRadius({ x: 1, y: 1 }, 10)).toEqual([]);
  });

  it("handles negative coordinates", () => {
    const grid = new UniformGrid<P>(10);
    const p: P = { pos: { x: -15, y: -3 }, id: 9 };
    grid.insert(p);
    expect(grid.queryRadius({ x: -14, y: -2 }, 5)).toContain(p);
  });
});
