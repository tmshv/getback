import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { generatePen } from "./penGen.js";

const opts = { center: { x: 240, y: 135 }, rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24 };

describe("generatePen", () => {
  it("is deterministic for a fixed seed", () => {
    const a = generatePen(makeRng(7), opts);
    const b = generatePen(makeRng(7), opts);
    expect(a.outline).toEqual(b.outline);
    expect(a.gateEdge).toBe(b.gateEdge);
  });

  it("produces an outline within the vertex-count range and a valid gate index", () => {
    const p = generatePen(makeRng(3), opts);
    expect(p.outline.length).toBeGreaterThanOrEqual(opts.minVerts);
    expect(p.outline.length).toBeLessThanOrEqual(opts.maxVerts);
    expect(p.gateEdge).toBeGreaterThanOrEqual(0);
    expect(p.gateEdge).toBeLessThan(p.outline.length);
  });

  it("the gate edge is at least minGateWidth wide", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = generatePen(makeRng(seed), opts);
      const a = p.outline[p.gateEdge]!;
      const b = p.outline[(p.gateEdge + 1) % p.outline.length]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(opts.minGateWidth - 1e-6);
    }
  });

  it("vertices are sorted by angle around the center (=> simple, non-self-intersecting)", () => {
    const p = generatePen(makeRng(9), opts);
    const angles = p.outline.map((v) => Math.atan2(v.y - opts.center.y, v.x - opts.center.x));
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThanOrEqual(angles[i - 1]!);
  });
});
