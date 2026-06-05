import { describe, it, expect } from "vitest";
import { createObstacle } from "./Obstacle.js";

describe("createObstacle", () => {
  it("builds a circle obstacle of the given kind/pos/radius", () => {
    const o = createObstacle("rock", { x: 10, y: 20 }, 8);
    expect(o.kind).toBe("rock");
    expect(o.pos).toEqual({ x: 10, y: 20 });
    expect(o.radius).toBe(8);
  });
  it("copies the position (no shared reference)", () => {
    const pos = { x: 1, y: 2 };
    const o = createObstacle("tree", pos, 12);
    pos.x = 999;
    expect(o.pos.x).toBe(1);
  });
});
