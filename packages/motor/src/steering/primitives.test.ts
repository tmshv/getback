import { describe, it, expect } from "vitest";
import { seek, flee, arrive } from "./primitives.js";
import type { Mobile } from "../types.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: 5,
    maxSpeed: 10,
    maxForce: 100,
    facing: "down",
    ...over,
  };
}

describe("steering primitives", () => {
  it("seek steers toward the target at maxSpeed (from rest = desired velocity)", () => {
    const e = agent();
    const out = { x: 0, y: 0 };
    seek(e, { x: 100, y: 0 }, out);
    expect(out).toEqual({ x: 10, y: 0 });
  });
  it("seek subtracts current velocity (steering, not teleport)", () => {
    const e = agent({ vel: { x: 4, y: 0 } });
    const out = { x: 0, y: 0 };
    seek(e, { x: 100, y: 0 }, out);
    expect(out).toEqual({ x: 6, y: 0 });
  });
  it("flee is the negation of seek's desired", () => {
    const e = agent();
    const out = { x: 0, y: 0 };
    flee(e, { x: 100, y: 0 }, out);
    expect(out).toEqual({ x: -10, y: 0 });
  });
  it("arrive ramps down speed inside the slow radius", () => {
    const e = agent();
    const out = { x: 0, y: 0 };
    arrive(e, { x: 5, y: 0 }, 10, out);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(0);
  });
  it("seek at the target produces only braking", () => {
    const e = agent({ vel: { x: 3, y: 0 } });
    const out = { x: 0, y: 0 };
    seek(e, { x: 0, y: 0 }, out);
    expect(out).toEqual({ x: -3, y: 0 });
  });
});
