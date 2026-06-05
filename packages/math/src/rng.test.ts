import { describe, it, expect } from "vitest";
import { makeRng } from "./rng.js";

describe("rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a.float(), a.float(), a.float()];
    const seqB = [b.float(), b.float(), b.float()];
    expect(seqA).toEqual(seqB);
  });
  it("produces floats in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("ints stay within the inclusive range", () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
  it("different seeds diverge", () => {
    expect(makeRng(1).float()).not.toBe(makeRng(2).float());
  });
});
