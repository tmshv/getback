import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { grassSystem } from "./GrassSystem.js";
import { createGrassField, densityAt, depleteRateAt } from "../grass/GrassField.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

describe("grassSystem", () => {
  it("regrows all cells and depletes the cell under each sheep", () => {
    const g = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0.5, initial: 1 });
    const sheep = [createSheep({ x: 25, y: 25 }, defaultSheepTraits())];

    grassSystem(g, sheep, 1);

    expect(densityAt(g, 25, 25)).toBeCloseTo(0.5);
    expect(densityAt(g, 5, 5)).toBe(1);
  });

  it("depletes the grazed cell by that cell's OWN (randomized) rate", () => {
    const g = createGrassField({
      cols: 4, rows: 4, cellSize: 10, regrowRate: 0,
      depleteRate: 0.05, depleteRateMax: 0.1, rng: makeRng(3), initial: 1,
    });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    const rate = depleteRateAt(g, 25, 25);
    grassSystem(g, [s], 1);
    expect(densityAt(g, 25, 25)).toBeCloseTo(1 - rate);
  });

  it("regrows ungrazed cells back toward 1", () => {
    const g = createGrassField({ cols: 3, rows: 3, cellSize: 10, regrowRate: 0.2, depleteRate: 0, initial: 0.5 });
    grassSystem(g, [], 1);
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.7);
  });
});
