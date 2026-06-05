import { describe, it, expect } from "vitest";
import { closestPointOnSegment, signedArea, isCCW, pointInPolygon } from "./geometry.js";

const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
]; // CCW

describe("closestPointOnSegment", () => {
  it("projects onto the segment interior", () => {
    const r = closestPointOnSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.point).toEqual({ x: 2, y: 0 });
    expect(r.t).toBeCloseTo(0.5);
    expect(r.distSq).toBeCloseTo(9);
  });
  it("clamps to an endpoint (vertex case)", () => {
    const r = closestPointOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.point).toEqual({ x: 0, y: 0 });
    expect(r.t).toBe(0);
  });
});

describe("polygon winding", () => {
  it("computes signed area and CCW orientation", () => {
    expect(signedArea(square)).toBeCloseTo(16);
    expect(isCCW(square)).toBe(true);
    expect(isCCW([...square].reverse())).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("detects inside and outside (concave-safe)", () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 9, y: 9 }, square)).toBe(false);
  });
});
