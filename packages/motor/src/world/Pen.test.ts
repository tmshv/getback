import { describe, it, expect } from "vitest";
import { buildPen, penContains } from "./Pen.js";

const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

describe("buildPen", () => {
  it("derives fences as every edge EXCEPT the gate", () => {
    const pen = buildPen(square, 0);
    expect(pen.fences.length).toBe(3);
    for (const f of pen.fences) {
      const isGate = f.a.x === 0 && f.a.y === 0 && f.b.x === 4 && f.b.y === 0;
      expect(isGate).toBe(false);
    }
  });

  it("computes the gate mouth and an inward-pointing normal", () => {
    const pen = buildPen(square, 0);
    expect(pen.gate.mouth.a).toEqual({ x: 0, y: 0 });
    expect(pen.gate.mouth.b).toEqual({ x: 4, y: 0 });
    expect(pen.gate.inwardNormal.x).toBeCloseTo(0);
    expect(pen.gate.inwardNormal.y).toBeCloseTo(1);
  });

  it("computes the centroid", () => {
    const pen = buildPen(square, 0);
    expect(pen.centroid).toEqual({ x: 2, y: 2 });
  });
});

describe("penContains", () => {
  it("is true inside, false outside (concave-safe via point-in-polygon)", () => {
    const pen = buildPen(square, 0);
    expect(penContains(pen, { x: 2, y: 2 })).toBe(true);
    expect(penContains(pen, { x: 9, y: 9 })).toBe(false);
  });
});
