import { describe, it, expect } from "vitest";
import { UniformGrid } from "@getback/spatial";
import { neighborhoodSystem } from "./NeighborhoodSystem.js";
import { steeringSystem } from "./SteeringSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";
import { createGrassField } from "../grass/GrassField.js";

const noGrass = createGrassField({ cols: 1, rows: 1, cellSize: 1000, regrowRate: 0, depleteRate: 0, initial: 0 });

describe("neighborhoodSystem", () => {
  it("fills each sheep's neighbors within its perception radius, excluding itself", () => {
    const t = defaultSheepTraits(); // perception 40
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 20, y: 0 }, t);
    const c = createSheep({ x: 200, y: 0 }, t);
    const sheep = [a, b, c];
    const grid = new UniformGrid<Sheep>(40);

    neighborhoodSystem(sheep, grid);

    expect(a.neighbors).toContain(b);
    expect(a.neighbors).not.toContain(c);
    expect(a.neighbors).not.toContain(a);
  });

  it("is recomputed cleanly each call (no stale neighbors)", () => {
    const t = defaultSheepTraits();
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 20, y: 0 }, t);
    const sheep = [a, b];
    const grid = new UniformGrid<Sheep>(40);
    neighborhoodSystem(sheep, grid);
    expect(a.neighbors.length).toBe(1);
    b.pos.x = 500;
    neighborhoodSystem(sheep, grid);
    expect(a.neighbors.length).toBe(0);
  });
});

describe("steeringSystem", () => {
  it("writes a non-zero force into a sheep being pulled toward a neighbor", () => {
    const t = defaultSheepTraits();
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 30, y: 0 }, t);
    const sheep = [a, b];
    const grid = new UniformGrid<Sheep>(40);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, { grass: noGrass, obstacles: [] }, 1 / 60);
    expect(Math.hypot(a.force.x, a.force.y)).toBeGreaterThan(0);
    expect(a.force.x).toBeGreaterThan(0);
  });
});
