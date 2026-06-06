import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { createSheep, defaultSheepTraits, rollSheepTraits, resetSheep } from "./Sheep.js";
import { config } from "../config.js";

describe("createSheep", () => {
  it("builds a Mobile sheep at the given position with a behavior tree", () => {
    const s = createSheep({ x: 50, y: 60 }, defaultSheepTraits());
    expect(s.pos).toEqual({ x: 50, y: 60 });
    expect(s.vel).toEqual({ x: 0, y: 0 });
    expect(s.force).toEqual({ x: 0, y: 0 });
    expect(s.neighbors).toEqual([]);
    expect(typeof s.root.run).toBe("function");
    expect(s.maxSpeed).toBe(s.traits.maxSpeed);
  });
  it("copies the position (no shared reference)", () => {
    const pos = { x: 1, y: 2 };
    const s = createSheep(pos, defaultSheepTraits());
    pos.x = 999;
    expect(s.pos.x).toBe(1);
  });
});

describe("defaultSheepTraits", () => {
  it("includes boldness field with value 1 (deterministic baseline)", () => {
    const t = defaultSheepTraits();
    expect(typeof t.boldness).toBe("number");
    expect(t.boldness).toBe(1);
  });
});

describe("rollSheepTraits", () => {
  it("returns traits within documented ranges", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 20; i++) {
      const t = rollSheepTraits(rng);
      const baseSpeed = config.flock.maxSpeed;
      const jitter = config.traits.maxSpeedJitter;
      expect(t.maxSpeed).toBeGreaterThanOrEqual(baseSpeed * (1 - jitter));
      expect(t.maxSpeed).toBeLessThanOrEqual(baseSpeed * (1 + jitter));
      expect(t.boldness).toBeGreaterThanOrEqual(config.traits.boldnessMin);
      expect(t.boldness).toBeLessThanOrEqual(config.traits.boldnessMax);
      expect(t.sociability).toBeGreaterThanOrEqual(config.traits.sociabilityMin);
      expect(t.sociability).toBeLessThanOrEqual(config.traits.sociabilityMax);
    }
  });

  it("produces different traits on consecutive calls (not constant)", () => {
    const rng = makeRng(7);
    const a = rollSheepTraits(rng);
    const b = rollSheepTraits(rng);
    // At least one field differs (they are random, not a constant)
    const same = a.maxSpeed === b.maxSpeed && a.boldness === b.boldness && a.sociability === b.sociability;
    expect(same).toBe(false);
  });

  it("is reproducible: same seed gives same sequence", () => {
    const t1 = rollSheepTraits(makeRng(99));
    const t2 = rollSheepTraits(makeRng(99));
    expect(t1.maxSpeed).toBeCloseTo(t2.maxSpeed);
    expect(t1.boldness).toBeCloseTo(t2.boldness);
    expect(t1.sociability).toBeCloseTo(t2.sociability);
  });
});

describe("createSheep thirst drive", () => {
  it("initialises thirst to 0", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    expect(s.drives.thirst).toBe(0);
  });
});

describe("resetSheep", () => {
  it("repositions the sheep and clears velocity, force, penned, drives", () => {
    const s = createSheep({ x: 100, y: 100 }, defaultSheepTraits());
    s.vel.x = 10; s.vel.y = -5;
    s.force.x = 3; s.force.y = 1;
    s.penned = true;
    s.drives.fear = 0.9;
    s.drives.hunger = 0.7;
    resetSheep(s, { x: 42, y: 77 });
    expect(s.pos).toEqual({ x: 42, y: 77 });
    expect(s.prevPos).toEqual({ x: 42, y: 77 });
    expect(s.vel).toEqual({ x: 0, y: 0 });
    expect(s.force).toEqual({ x: 0, y: 0 });
    expect(s.penned).toBe(false);
    expect(s.drives.fear).toBe(0);
    expect(s.drives.hunger).toBe(0);
    expect(s.neighbors).toHaveLength(0);
  });
});
