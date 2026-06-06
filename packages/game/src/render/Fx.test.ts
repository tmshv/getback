import { describe, it, expect } from "vitest";
import {
  createBarkRing,
  createDustPuff,
  createSparkle,
  ageFx,
  isFxAlive,
} from "./Fx.js";

// ── spawn factories ───────────────────────────────────────────────────────────

describe("createBarkRing", () => {
  it("creates a ring at the given position with age 0", () => {
    const fx = createBarkRing({ x: 10, y: 20 });
    expect(fx.kind).toBe("barkRing");
    expect(fx.pos.x).toBe(10);
    expect(fx.pos.y).toBe(20);
    expect(fx.age).toBe(0);
    expect(fx.radius).toBeCloseTo(0, 5);
  });

  it("ring has a positive lifetime", () => {
    expect(createBarkRing({ x: 0, y: 0 }).lifetime).toBeGreaterThan(0);
  });
});

describe("createDustPuff", () => {
  it("creates a puff with age 0 and a positive lifetime", () => {
    const fx = createDustPuff({ x: 5, y: 5 });
    expect(fx.kind).toBe("dustPuff");
    expect(fx.age).toBe(0);
    expect(fx.lifetime).toBeGreaterThan(0);
  });
});

describe("createSparkle", () => {
  it("creates a sparkle with age 0 at the given position", () => {
    const fx = createSparkle({ x: 100, y: 50 });
    expect(fx.kind).toBe("sparkle");
    expect(fx.pos.x).toBe(100);
    expect(fx.age).toBe(0);
  });
});

// ── ageFx ─────────────────────────────────────────────────────────────────────

describe("ageFx", () => {
  it("increments age by dt", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, 0.1);
    expect(fx.age).toBeCloseTo(0.1, 5);
  });

  it("accumulates across multiple calls", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, 0.1);
    ageFx(fx, 0.05);
    expect(fx.age).toBeCloseTo(0.15, 5);
  });

  it("expands bark ring radius proportionally to age/lifetime", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, fx.lifetime / 2);
    // radius at half-life should be roughly half maxRadius
    expect(fx.radius).toBeGreaterThan(0);
    expect(fx.radius).toBeLessThan(fx.maxRadius);
  });
});

// ── isFxAlive ─────────────────────────────────────────────────────────────────

describe("isFxAlive", () => {
  it("alive when age < lifetime", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, fx.lifetime * 0.5);
    expect(isFxAlive(fx)).toBe(true);
  });

  it("dead when age >= lifetime", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, fx.lifetime + 0.01);
    expect(isFxAlive(fx)).toBe(false);
  });
});
