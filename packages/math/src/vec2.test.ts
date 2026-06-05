import { describe, it, expect } from "vitest";
import { add, sub, scale, dot, len, lenSq, dist, normalize, truncate, perp } from "./vec2.js";

describe("vec2", () => {
  it("adds and subtracts", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual({ x: 2, y: 2 });
  });
  it("scales and dots", () => {
    expect(scale({ x: 2, y: -3 }, 2)).toEqual({ x: 4, y: -6 });
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
  });
  it("measures length and distance", () => {
    expect(len({ x: 3, y: 4 })).toBe(5);
    expect(lenSq({ x: 3, y: 4 })).toBe(25);
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it("normalizes, with zero-vector guard", () => {
    expect(normalize({ x: 0, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
  it("truncates only when longer than max", () => {
    expect(truncate({ x: 3, y: 4 }, 5)).toEqual({ x: 3, y: 4 });
    expect(truncate({ x: 6, y: 8 }, 5)).toEqual({ x: 3, y: 4 });
  });
  it("computes a left perpendicular", () => {
    expect(perp({ x: 1, y: 0 })).toEqual({ x: 0, y: 1 });
  });
});
