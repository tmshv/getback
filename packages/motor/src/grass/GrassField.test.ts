import { describe, it, expect } from "vitest";
import {
  createGrassField,
  densityAt,
  setDensityAt,
  depleteAt,
  regrow,
  gradientAt,
} from "./GrassField.js";

describe("GrassField", () => {
  it("creates a uniform field at the initial density", () => {
    const g = createGrassField({ cols: 4, rows: 3, cellSize: 10, regrowRate: 0.1, depleteRate: 0.5, initial: 1 });
    expect(g.density.length).toBe(12);
    expect(densityAt(g, 5, 5)).toBe(1);
  });

  it("set/read a cell by world position, clamping out-of-bounds to the edge", () => {
    const g = createGrassField({ cols: 4, rows: 3, cellSize: 10, regrowRate: 0.1, depleteRate: 0.5 });
    setDensityAt(g, 5, 5, 0.25);
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.25);
    expect(() => densityAt(g, -999, -999)).not.toThrow();
    expect(() => densityAt(g, 9999, 9999)).not.toThrow();
  });

  it("deplete subtracts and clamps at 0; regrow adds and clamps at 1", () => {
    const g = createGrassField({ cols: 2, rows: 2, cellSize: 10, regrowRate: 0.3, depleteRate: 0.5, initial: 0.5 });
    depleteAt(g, 5, 5, 0.4);
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.1);
    depleteAt(g, 5, 5, 1);
    expect(densityAt(g, 5, 5)).toBe(0);
    regrow(g, 1);
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.3);
    regrow(g, 100);
    expect(densityAt(g, 5, 5)).toBe(1);
  });

  it("gradient points toward higher density", () => {
    const g = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0.1, depleteRate: 0.5, initial: 0.2 });
    setDensityAt(g, 40, 20, 1);
    const out = { x: 0, y: 0 };
    gradientAt(g, 20, 20, out);
    expect(out.x).toBeGreaterThan(0);
    expect(Math.abs(out.y)).toBeLessThan(Math.abs(out.x));
  });
});
