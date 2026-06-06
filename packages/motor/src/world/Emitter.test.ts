import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { Emitter, rectGeometry, pointGeometry } from "./Emitter.js";

describe("Emitter — period accumulation", () => {
  it("produces no spawns before the period elapses", () => {
    const rng = makeRng(1);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 2,
      amount: 3,
      max: 10,
      rng,
    });
    const spawns = e.update(1.0); // less than period
    expect(spawns).toHaveLength(0);
  });

  it("produces `amount` spawn positions once period elapses", () => {
    const rng = makeRng(2);
    const e = new Emitter({
      geometry: rectGeometry({ x: 10, y: 20, w: 80, h: 60 }),
      period: 1,
      amount: 5,
      max: 20,
      rng,
    });
    const spawns = e.update(1.0);
    expect(spawns).toHaveLength(5);
    for (const p of spawns) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThan(90);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThan(80);
    }
  });

  it("does not emit again until another period elapses after the first", () => {
    const rng = makeRng(3);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 2,
      max: 20,
      rng,
    });
    e.update(1.0); // fires
    const second = e.update(0.5); // not yet
    expect(second).toHaveLength(0);
    const third = e.update(0.5); // exactly at boundary — fires
    expect(third).toHaveLength(2);
  });

  it("respects the max cap: does not emit if active >= max", () => {
    const rng = makeRng(4);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 3,
      max: 5,
      rng,
    });
    // Simulate 5 already active by calling acquire externally — use active setter
    e.active = 5;
    const spawns = e.update(1.0);
    expect(spawns).toHaveLength(0);
  });

  it("clamps emit amount so active never exceeds max", () => {
    const rng = makeRng(5);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 5,
      max: 3,
      rng,
    });
    e.active = 1; // 2 slots remaining
    const spawns = e.update(1.0);
    expect(spawns).toHaveLength(2); // clamped to max - active
  });
});

describe("Emitter — exclusion predicate", () => {
  it("re-samples until it finds a position passing the predicate", () => {
    const rng = makeRng(6);
    // Geometry covering 0..100 × 0..100; reject anything with x < 50
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 20,
      max: 100,
      rng,
      exclude: (p) => p.x < 50,
    });
    const spawns = e.update(1.0);
    for (const p of spawns) expect(p.x).toBeGreaterThanOrEqual(50);
  });
});

describe("Emitter — immediate emit", () => {
  it("emitNow() returns positions regardless of accumulated time and resets accumulator", () => {
    const rng = makeRng(7);
    const e = new Emitter({
      geometry: pointGeometry({ x: 42, y: 77 }),
      period: 10,
      amount: 3,
      max: 20,
      rng,
    });
    const spawns = e.emitNow(3);
    expect(spawns).toHaveLength(3);
    for (const p of spawns) expect(p).toEqual({ x: 42, y: 77 });
  });
});

describe("pointGeometry", () => {
  it("always returns the fixed point", () => {
    const rng = makeRng(1);
    const g = pointGeometry({ x: 5, y: 9 });
    expect(g.sample(rng)).toEqual({ x: 5, y: 9 });
    expect(g.sample(rng)).toEqual({ x: 5, y: 9 });
  });
});

describe("rectGeometry", () => {
  it("samples uniformly inside the rect (all within bounds)", () => {
    const rng = makeRng(10);
    const g = rectGeometry({ x: 20, y: 30, w: 60, h: 40 });
    for (let i = 0; i < 100; i++) {
      const p = g.sample(rng);
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThan(80);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThan(70);
    }
  });
});
