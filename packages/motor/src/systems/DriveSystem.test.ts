import { describe, it, expect } from "vitest";
import { driveSystem } from "./DriveSystem.js";
import { createGrassField } from "../grass/GrassField.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

describe("driveSystem", () => {
  it("raises hunger over time when there is no grass to graze", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    driveSystem([s], bare, 1);
    expect(s.drives.hunger).toBeCloseTo(0.05);
  });

  it("lowers hunger when standing on lush grass (satiation outpaces growth)", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.hunger = 0.5;
    driveSystem([s], lush, 1);
    expect(s.drives.hunger).toBeCloseTo(0.05);
  });

  it("clamps hunger to [0,1]", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.hunger = 0.1;
    driveSystem([s], lush, 1);
    expect(s.drives.hunger).toBe(0);
  });
});
