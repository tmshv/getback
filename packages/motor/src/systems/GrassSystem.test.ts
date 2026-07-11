import { describe, it, expect } from "vitest";
import { grassSystem } from "./GrassSystem.js";
import { createGrassField, densityAt } from "../grass/GrassField.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

describe("grassSystem", () => {
  it("a grazing sheep wears down the cell under it (no regrow elsewhere)", () => {
    const g = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0.2, depleteRate: 0.5, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.goal = "graze";

    grassSystem(g, [s], 1);

    expect(densityAt(g, 25, 25)).toBeCloseTo(0.5); // grazed down by depleteRate
    expect(densityAt(g, 5, 5)).toBe(1);            // untouched — and does NOT regrow
  });

  it("does NOT deplete grass under an idle / non-grazing sheep", () => {
    const g = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0.5, initial: 1 });
    const idle = createSheep({ x: 25, y: 25 }, defaultSheepTraits()); // goal defaults to "idle"
    const drinker = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    drinker.goal = "drink";

    grassSystem(g, [idle, drinker], 1);

    expect(densityAt(g, 25, 25)).toBe(1); // neither idle nor drinking wears grass
  });
});
