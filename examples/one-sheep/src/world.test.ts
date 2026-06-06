import { describe, it, expect } from "vitest";
import { penContains } from "@getback/motor";
import { buildWorld } from "./world.js";

describe("one-sheep buildWorld", () => {
  it("contains exactly one sheep", () => {
    const world = buildWorld(1);
    expect(world.sheep).toHaveLength(1);
  });

  it("has a dog", () => {
    const world = buildWorld(1);
    expect(world.dog).not.toBeNull();
  });

  it("has a pen", () => {
    const world = buildWorld(1);
    expect(world.pen).not.toBeNull();
  });

  it("pen has at least one fence and a gate edge", () => {
    const world = buildWorld(1);
    const pen = world.pen!;
    expect(pen.fences.length).toBeGreaterThan(0);
    expect(pen.gateEdge).toBeGreaterThanOrEqual(0);
    expect(pen.gateEdge).toBeLessThan(pen.outline.length);
  });

  it("sheep starts outside the pen", () => {
    const { sheep, pen } = buildWorld(1);
    expect(penContains(pen!, sheep[0]!.pos)).toBe(false);
  });

  it("is deterministic for the same seed", () => {
    const w1 = buildWorld(7);
    const w2 = buildWorld(7);
    expect(w1.sheep[0]!.pos).toEqual(w2.sheep[0]!.pos);
    expect(w1.pen!.outline.length).toBe(w2.pen!.outline.length);
  });

  it("produces different sheep positions for different seeds", () => {
    const w1 = buildWorld(1);
    const w2 = buildWorld(99);
    expect(w1.sheep[0]!.pos).not.toEqual(w2.sheep[0]!.pos);
  });
});
