import { describe, it, expect } from "vitest";
import { buildGameWorld } from "./world.js";

describe("buildGameWorld", () => {
  it("returns a world with a dog", () => {
    const world = buildGameWorld(1);
    expect(world.dog).not.toBeNull();
    expect(world.dog!.stamina).toBeGreaterThan(0);
  });

  it("returns a world with a non-empty flock (≥ 6 sheep)", () => {
    const world = buildGameWorld(1);
    expect(world.sheep.length).toBeGreaterThanOrEqual(6);
  });

  it("returns a world with a pen", () => {
    const world = buildGameWorld(1);
    expect(world.pen).not.toBeNull();
    expect(world.pen!.fences.length).toBeGreaterThan(0);
  });

  it("returns a world with obstacles", () => {
    const world = buildGameWorld(1);
    expect(world.obstacles.length).toBeGreaterThan(0);
  });

  it("different seeds produce different pen centroids", () => {
    const w1 = buildGameWorld(1);
    const w2 = buildGameWorld(99);
    const cx1 = w1.pen!.centroid.x;
    const cx2 = w2.pen!.centroid.x;
    // With different seeds, pen geometry should differ (not always the exact same centroid).
    expect(cx1 !== cx2 || w1.pen!.centroid.y !== w2.pen!.centroid.y).toBe(true);
  });

  it("sheep are placed within world bounds", () => {
    const world = buildGameWorld(42);
    const b = world.bounds;
    for (const s of world.sheep) {
      expect(s.pos.x).toBeGreaterThanOrEqual(b.x);
      expect(s.pos.x).toBeLessThanOrEqual(b.x + b.w);
      expect(s.pos.y).toBeGreaterThanOrEqual(b.y);
      expect(s.pos.y).toBeLessThanOrEqual(b.y + b.h);
    }
  });
});
