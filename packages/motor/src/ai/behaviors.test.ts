import { describe, it, expect } from "vitest";
import { separation, cohesion, follow, graze, obstacleAvoid } from "./behaviors.js";
import type { Mobile } from "../types.js";
import { createGrassField, setDensityAt } from "../grass/GrassField.js";
import { createObstacle } from "../entities/Obstacle.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

const noGrass = createGrassField({ cols: 1, rows: 1, cellSize: 1000, regrowRate: 0, depleteRate: 0, initial: 0 });

describe("separation", () => {
  it("steers away from a close neighbor", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const near = agent({ pos: { x: 4, y: 0 } });
    const out = { x: 0, y: 0 };
    separation(12).run(self, { neighbors: [near], grass: noGrass, obstacles: [], dt: 0 }, out);
    expect(out.x).toBeLessThan(0);
  });
  it("ignores neighbors beyond personalSpace", () => {
    const self = agent();
    const far = agent({ pos: { x: 50, y: 0 } });
    const out = { x: 1, y: 1 };
    separation(12).run(self, { neighbors: [far], grass: noGrass, obstacles: [], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("cohesion", () => {
  it("steers toward the centroid of the k nearest neighbors", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const a = agent({ pos: { x: 10, y: 0 } });
    const b = agent({ pos: { x: 20, y: 0 } });
    const out = { x: 0, y: 0 };
    cohesion(6).run(self, { neighbors: [a, b], grass: noGrass, obstacles: [], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
});

describe("follow", () => {
  it("aligns toward the heading of moving neighbors", () => {
    const self = agent({ vel: { x: 0, y: 0 } });
    const mover = agent({ vel: { x: 8, y: 0 } });
    const out = { x: 0, y: 0 };
    follow(2).run(self, { neighbors: [mover], grass: noGrass, obstacles: [], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("ignores stationary neighbors", () => {
    const self = agent();
    const still = agent({ vel: { x: 0, y: 0 } });
    const out = { x: 1, y: 1 };
    follow(2).run(self, { neighbors: [still], grass: noGrass, obstacles: [], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("graze", () => {
  it("steers toward greener grass (up the density gradient)", () => {
    const grass = createGrassField({ cols: 10, rows: 10, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0.2 });
    setDensityAt(grass, 70, 50, 1); // lush cell to the east of (50,50)
    const self = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const out = { x: 0, y: 0 };
    graze().run(self, { neighbors: [], grass, obstacles: [], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("produces no force on a uniform field", () => {
    const grass = createGrassField({ cols: 10, rows: 10, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0.5 });
    const self = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const out = { x: 1, y: 1 };
    graze().run(self, { neighbors: [], grass, obstacles: [], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("obstacleAvoid", () => {
  it("steers away from a nearby obstacle", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const obs = createObstacle("rock", { x: 12, y: 0 }, 8);
    const out = { x: 0, y: 0 };
    obstacleAvoid(18).run(self, { neighbors: [], grass: noGrass, obstacles: [obs], dt: 0 }, out);
    expect(out.x).toBeLessThan(0);
  });
  it("ignores obstacles outside the avoid range", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const obs = createObstacle("rock", { x: 500, y: 0 }, 8);
    const out = { x: 1, y: 1 };
    obstacleAvoid(18).run(self, { neighbors: [], grass: noGrass, obstacles: [obs], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
