import { describe, it, expect } from "vitest";
import { computeLetterbox } from "./letterbox.js";

describe("computeLetterbox", () => {
  it("exact fit: scale=1, no offset", () => {
    const r = computeLetterbox(480, 270, 480, 270);
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it("2× window: scale=2, no offset", () => {
    const r = computeLetterbox(960, 540, 480, 270);
    expect(r.scale).toBe(2);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it("wide window (1920×1080): scale=4, centered horizontally", () => {
    // 1920/480=4, 1080/270=4 — perfect 4×; no bars
    const r = computeLetterbox(1920, 1080, 480, 270);
    expect(r.scale).toBe(4);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it("extra-wide window adds horizontal bars (pillarbox)", () => {
    // 1280×720 window: height-limited → 720/270=2.66 → floor=2; width bars
    const r = computeLetterbox(1280, 720, 480, 270);
    expect(r.scale).toBe(2);
    // logical canvas: 960 wide, centered in 1280 → offsetX = (1280-960)/2 = 160
    expect(r.offsetX).toBe(160);
    expect(r.offsetY).toBe(90);
  });

  it("tall window adds vertical bars (letterbox)", () => {
    // 480×800 window: width-limited → 480/480=1; height bars
    const r = computeLetterbox(480, 800, 480, 270);
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(0);
    // logical canvas: 270 tall, centered in 800 → offsetY = (800-270)/2 = 265
    expect(r.offsetY).toBe(265);
  });

  it("scale is always a positive integer ≥ 1", () => {
    const r = computeLetterbox(100, 100, 480, 270);
    expect(r.scale).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(r.scale)).toBe(true);
  });

  it("offsets are non-negative integers", () => {
    const r = computeLetterbox(1280, 720, 480, 270);
    expect(r.offsetX).toBeGreaterThanOrEqual(0);
    expect(r.offsetY).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r.offsetX)).toBe(true);
    expect(Number.isInteger(r.offsetY)).toBe(true);
  });
});
