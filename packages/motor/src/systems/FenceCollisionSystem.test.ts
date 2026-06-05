import { describe, it, expect } from "vitest";
import { fenceCollisionSystem } from "./FenceCollisionSystem.js";
import { buildPen } from "../world/Pen.js";
import type { Mobile } from "../types.js";

// CCW square 0..40; gate = edge index 3 = (0,40)->(0,0) = the LEFT edge.
// Its inward normal points +x (into the square).
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

function unit(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 3, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("fenceCollisionSystem", () => {
  it("blocks a unit that crossed a solid fence, clamping it back to the origin side", () => {
    const pen = buildPen(square, 3);
    const u = unit({ prevPos: { x: 20, y: 5 }, pos: { x: 20, y: -3 }, vel: { x: 0, y: -8 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.y).toBeGreaterThan(0);
    expect(Math.abs(u.pos.y)).toBeCloseTo(u.radius);
    expect(u.vel.y).toBeGreaterThanOrEqual(0);
  });

  it("does a static push-out when resting against a fence (no crossing)", () => {
    const pen = buildPen(square, 3);
    const u = unit({ prevPos: { x: 20, y: 1 }, pos: { x: 20, y: 1 }, vel: { x: 0, y: 0 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.y).toBeCloseTo(3);
  });

  it("lets a unit ENTER through the gate (inward crossing allowed)", () => {
    const pen = buildPen(square, 3);
    const u = unit({ prevPos: { x: -3, y: 20 }, pos: { x: 5, y: 20 }, vel: { x: 8, y: 0 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.x).toBeCloseTo(5);
    expect(u.vel.x).toBeCloseTo(8);
  });

  it("BLOCKS a unit trying to leave through the gate (outward crossing)", () => {
    const pen = buildPen(square, 3);
    const u = unit({ prevPos: { x: 3, y: 20 }, pos: { x: -5, y: 20 }, vel: { x: -8, y: 0 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.x).toBeGreaterThan(0);
    expect(u.pos.x).toBeCloseTo(u.radius);
    expect(u.vel.x).toBeGreaterThanOrEqual(0);
  });
});
