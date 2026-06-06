import { describe, it, expect } from "vitest";
import { createWorld } from "./World.js";
import { makeRng } from "@getback/math";
import { createAttractor } from "../entities/Attractor.js";

describe("createWorld", () => {
  it("provides an rng and a signals bundle by default", () => {
    const w = createWorld();
    expect(typeof w.rng.float).toBe("function");
    expect(typeof w.signals.penFilled.add).toBe("function");
  });
  it("uses the provided rng", () => {
    const rng = makeRng(99);
    const w = createWorld([], undefined, [], null, null, rng);
    expect(w.rng).toBe(rng);
  });
  it("each world gets its own signals instance", () => {
    expect(createWorld().signals).not.toBe(createWorld().signals);
  });
});

describe("createWorld attractors", () => {
  it("defaults to an empty attractors array", () => {
    const w = createWorld();
    expect(Array.isArray(w.attractors)).toBe(true);
    expect(w.attractors.length).toBe(0);
  });

  it("accepts a provided attractors list", () => {
    const water = createAttractor("water", { x: 100, y: 100 }, 24);
    const w = createWorld([], undefined, [], null, null, undefined, [water]);
    expect(w.attractors).toHaveLength(1);
    expect(w.attractors[0]).toBe(water);
  });
});
