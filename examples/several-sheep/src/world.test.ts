import { describe, it, expect } from "vitest";
import { penContains } from "@getback/motor";
import { buildWorld } from "./world.js";

describe("several-sheep buildWorld", () => {
  it("contains exactly five sheep", () => {
    const world = buildWorld(1);
    expect(world.sheep).toHaveLength(5);
  });

  it("has a dog", () => {
    const world = buildWorld(1);
    expect(world.dog).not.toBeNull();
  });

  it("has a pen", () => {
    const world = buildWorld(1);
    expect(world.pen).not.toBeNull();
  });

  it("all sheep start outside the pen", () => {
    const { sheep, pen } = buildWorld(1);
    for (const s of sheep) {
      expect(penContains(pen!, s.pos)).toBe(false);
    }
  });

  it("all sheep have varied traits (sociability differs)", () => {
    const { sheep } = buildWorld(42);
    const soc = sheep.map(s => s.traits.sociability);
    const min = Math.min(...soc);
    const max = Math.max(...soc);
    expect(max - min).toBeGreaterThan(0.05);
  });

  it("is deterministic for the same seed", () => {
    const w1 = buildWorld(3);
    const w2 = buildWorld(3);
    expect(w1.sheep.length).toBe(w2.sheep.length);
    for (let i = 0; i < w1.sheep.length; i++) {
      expect(w1.sheep[i]!.pos).toEqual(w2.sheep[i]!.pos);
    }
  });
});
