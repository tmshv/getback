import { describe, it, expect } from "vitest";
import { createSheep, defaultSheepTraits } from "./Sheep.js";

describe("createSheep", () => {
  it("builds a Mobile sheep at the given position with a behavior tree", () => {
    const s = createSheep({ x: 50, y: 60 }, defaultSheepTraits());
    expect(s.pos).toEqual({ x: 50, y: 60 });
    expect(s.vel).toEqual({ x: 0, y: 0 });
    expect(s.force).toEqual({ x: 0, y: 0 });
    expect(s.neighbors).toEqual([]);
    expect(typeof s.root.run).toBe("function");
    expect(s.maxSpeed).toBe(s.traits.maxSpeed);
  });
  it("copies the position (no shared reference)", () => {
    const pos = { x: 1, y: 2 };
    const s = createSheep(pos, defaultSheepTraits());
    pos.x = 999;
    expect(s.pos.x).toBe(1);
  });
});
