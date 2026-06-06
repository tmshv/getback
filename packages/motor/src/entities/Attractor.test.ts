import { describe, it, expect } from "vitest";
import { createAttractor, createTree } from "./Attractor.js";
import { config } from "../config.js";

describe("createAttractor", () => {
  it("creates a water attractor with the given fields", () => {
    const a = createAttractor("water", { x: 50, y: 80 }, 24);
    expect(a.kind).toBe("water");
    expect(a.pos).toEqual({ x: 50, y: 80 });
    expect(a.radius).toBe(24);
  });

  it("creates a shade attractor", () => {
    const a = createAttractor("shade", { x: 10, y: 10 }, 32);
    expect(a.kind).toBe("shade");
    expect(a.radius).toBe(32);
  });

  it("pos is a defensive copy (mutating source does not affect attractor)", () => {
    const src = { x: 1, y: 2 };
    const a = createAttractor("water", src, 10);
    src.x = 99;
    expect(a.pos.x).toBe(1);
  });
});

describe("createTree", () => {
  it("returns an obstacle (trunk) + shade attractor", () => {
    const { obstacle, shade } = createTree({ x: 100, y: 200 });
    expect(obstacle.kind).toBe("tree");
    expect(obstacle.pos).toEqual({ x: 100, y: 200 });
    expect(obstacle.radius).toBe(config.attractor.trunkRadius);
    expect(shade.kind).toBe("shade");
    expect(shade.pos).toEqual({ x: 100, y: 200 });
    expect(shade.radius).toBe(config.attractor.shadeRadius);
    expect(shade.radius).toBeGreaterThan(obstacle.radius);
  });

  it("trunk and shade share the same position (defensive copies)", () => {
    const pos = { x: 40, y: 60 };
    const { obstacle, shade } = createTree(pos);
    pos.x = 999;
    expect(obstacle.pos.x).toBe(40);
    expect(shade.pos.x).toBe(40);
  });
});
