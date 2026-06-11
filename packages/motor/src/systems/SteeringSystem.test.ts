import { describe, it, expect } from "vitest";
import { steeringSystem } from "./SteeringSystem.js";
import type { SteerEnv } from "./SteeringSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { createGrassField } from "../grass/GrassField.js";
import type { Pen } from "../world/Pen.js";

const grass = createGrassField({ cols: 4, rows: 4, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 0.5 });

function baseEnv(over: Partial<SteerEnv> = {}): SteerEnv {
  return { grass, obstacles: [], stress: [], pen: null, water: null, shade: null, ...over };
}

describe("steeringSystem debug side-channel", () => {
  it("tags the goal mode that fired (graze) for a free, calm sheep", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    steeringSystem([s], baseEnv(), 1 / 60);
    expect(s.debug!.fired).toContain("graze");
    expect(s.debug!.fired).not.toContain("penned");
  });

  it("tags 'penned' when the sheep is inside the pen", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    s.penned = true;
    const pen = { centroid: { x: 100, y: 100 } } as Pen;
    steeringSystem([s], baseEnv({ pen }), 1 / 60);
    expect(s.debug!.fired).toContain("penned");
    expect(s.debug!.fired).not.toContain("graze"); // penned branch wins the root selector
  });

  it("clears the fired list each frame (no accumulation)", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    steeringSystem([s], baseEnv(), 1 / 60);
    steeringSystem([s], baseEnv(), 1 / 60);
    expect(s.debug!.fired.filter((l) => l === "graze")).toHaveLength(1);
  });

  it("snapshots the steering force before it is zeroed", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    steeringSystem([s], baseEnv(), 1 / 60);
    expect(s.debug!.force).toEqual({ x: s.force.x, y: s.force.y });
  });
});
