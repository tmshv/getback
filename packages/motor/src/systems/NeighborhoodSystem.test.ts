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
  it("pulls a sheep toward a neighbor beyond the cohesion comfort band", () => {
    // perception widened so the neighbor (70px away, past cohesionComfort=36) is
    // still seen; cohesion fires and drives a toward b. The sheep are hungry (active,
    // not content) so the settle damper doesn't brake the cohesion pull to zero.
    const t = { ...defaultSheepTraits(), perception: 80 };
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 70, y: 0 }, t);
    a.drives.hunger = 1;
    b.drives.hunger = 1;
    const sheep = [a, b];
    const grid = new UniformGrid<Sheep>(80);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, { grass: noGrass, obstacles: [], stress: [] }, 1 / 60);
    expect(Math.hypot(a.force.x, a.force.y)).toBeGreaterThan(0);
    expect(a.force.x).toBeGreaterThan(0);
  });

  it("writes NO force toward a neighbor already inside the comfort band (the anti-jitter dead zone)", () => {
    // b sits 30px away, inside cohesionComfort (36): a is already huddled, so
    // cohesion stays silent, separation is out of range, and the settle damper
    // leaves a at rest — no twitch toward an already-close flockmate.
    const t = defaultSheepTraits(); // perception 40
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 30, y: 0 }, t);
    const sheep = [a, b];
    const grid = new UniformGrid<Sheep>(40);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, { grass: noGrass, obstacles: [], stress: [] }, 1 / 60);
    expect(Math.hypot(a.force.x, a.force.y)).toBe(0);
  });
});
