import { describe, it, expect } from "vitest";
import { integrate, movementSystem } from "./MovementSystem.js";
import type { Mobile } from "../types.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("integrate (semi-implicit Euler)", () => {
  it("updates velocity first, then moves position with the NEW velocity", () => {
    const e = agent({ force: { x: 100, y: 0 } });
    integrate(e, 0.1);
    expect(e.vel.x).toBeCloseTo(10);
    expect(e.pos.x).toBeCloseTo(1);
  });
  it("clamps speed to maxSpeed", () => {
    const e = agent({ force: { x: 1000, y: 0 }, maxForce: 1000 });
    integrate(e, 1);
    expect(Math.hypot(e.vel.x, e.vel.y)).toBeCloseTo(10);
  });
  it("zeroes the force accumulator after integrating", () => {
    const e = agent({ force: { x: 5, y: 5 } });
    integrate(e, 0.1);
    expect(e.force).toEqual({ x: 0, y: 0 });
  });
  it("applies damping (coast toward stop) when there is no force", () => {
    const e = agent({ vel: { x: 10, y: 0 }, force: { x: 0, y: 0 } });
    integrate(e, 1);
    expect(e.vel.x).toBeCloseTo(1);
  });
  it("updates facing from the new velocity", () => {
    const e = agent({ force: { x: 0, y: 50 }, facing: "up" });
    integrate(e, 0.1);
    expect(e.facing).toBe("down");
  });
  it("clamps dt at the system level", () => {
    const e = agent({ force: { x: 10, y: 0 } });
    movementSystem([e], 1000);
    expect(e.vel.x).toBeCloseTo(10 * (1 / 30));
  });
});

describe("prevPos snapshot", () => {
  it("records the position from before the move", () => {
    const e = agent({ pos: { x: 10, y: 20 }, force: { x: 100, y: 0 } });
    integrate(e, 0.1);
    expect(e.prevPos).toEqual({ x: 10, y: 20 });
    expect(e.pos.x).toBeGreaterThan(10);
  });
});
