import { describe, it, expect } from "vitest";
import { buildWorld } from "./world.js";

describe("only-corgi buildWorld", () => {
  it("has no sheep", () => {
    const world = buildWorld(1);
    expect(world.sheep).toHaveLength(0);
  });

  it("has a dog", () => {
    const world = buildWorld(1);
    expect(world.dog).not.toBeNull();
  });

  it("has no pen (pen is null)", () => {
    const world = buildWorld(1);
    expect(world.pen).toBeNull();
  });

  it("dog starts at centre of bounds", () => {
    const world = buildWorld(1);
    // centre is 240, 135 for the 480x270 pasture
    expect(world.dog!.pos.x).toBe(240);
    expect(world.dog!.pos.y).toBe(135);
  });

  it("dog has full stamina", () => {
    const world = buildWorld(1);
    // stamina.max from config
    expect(world.dog!.stamina).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    const w1 = buildWorld(5);
    const w2 = buildWorld(5);
    expect(w1.dog!.pos).toEqual(w2.dog!.pos);
    expect(w1.sheep.length).toBe(w2.sheep.length);
    expect(w1.pen).toBe(w2.pen); // both null
  });
});
