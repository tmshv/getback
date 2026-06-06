import { describe, it, expect } from "vitest";
import { createWorld } from "./World.js";
import { makeRng } from "@getback/math";

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
