import { describe, it, expect } from "vitest";
import { separation, cohesion, follow } from "./behaviors.js";
import type { Mobile } from "../types.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("separation", () => {
  it("steers away from a close neighbor", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const near = agent({ pos: { x: 4, y: 0 } });
    const out = { x: 0, y: 0 };
    separation(12).run(self, { neighbors: [near], dt: 0 }, out);
    expect(out.x).toBeLessThan(0);
  });
  it("ignores neighbors beyond personalSpace", () => {
    const self = agent();
    const far = agent({ pos: { x: 50, y: 0 } });
    const out = { x: 1, y: 1 };
    separation(12).run(self, { neighbors: [far], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("cohesion", () => {
  it("steers toward the centroid of the k nearest neighbors", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const a = agent({ pos: { x: 10, y: 0 } });
    const b = agent({ pos: { x: 20, y: 0 } });
    const out = { x: 0, y: 0 };
    cohesion(6).run(self, { neighbors: [a, b], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
});

describe("follow", () => {
  it("aligns toward the heading of moving neighbors", () => {
    const self = agent({ vel: { x: 0, y: 0 } });
    const mover = agent({ vel: { x: 8, y: 0 } });
    const out = { x: 0, y: 0 };
    follow(2).run(self, { neighbors: [mover], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("ignores stationary neighbors", () => {
    const self = agent();
    const still = agent({ vel: { x: 0, y: 0 } });
    const out = { x: 1, y: 1 };
    follow(2).run(self, { neighbors: [still], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
