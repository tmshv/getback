import { describe, it, expect } from "vitest";
import { steeringSystem } from "./SteeringSystem.js";
import type { SteerEnv } from "./SteeringSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { createGrassField } from "../grass/GrassField.js";
import type { Pen } from "../world/Pen.js";
import { config } from "../config.js";

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

describe("steeringSystem settle-when-content", () => {
  it("brakes a contented, slowly-drifting lone sheep to a stop (force opposes velocity)", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    s.vel = { x: 6, y: 0 }; // below settle.speedMax => residual drift, not real momentum
    s.drives.hunger = 0;
    s.drives.thirst = 0;
    s.drives.fear = 0;
    // Uniform grass + no neighbours + no attractors => zero net steering force,
    // which is below the settle threshold, so the sheep should brake.
    steeringSystem([s], baseEnv(), 1 / 60);
    expect(s.force.x).toBeCloseTo(-6 * config.flock.settle.brakeGain);
    expect(s.force.y).toBeCloseTo(0);
  });

  it("does not brake a fast-moving sheep (real momentum, e.g. mid-flee)", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    s.vel = { x: 40, y: 0 }; // above settle.speedMax => let it coast, don't stutter-stop
    s.drives.hunger = 0;
    s.drives.thirst = 0;
    s.drives.fear = 0;
    steeringSystem([s], baseEnv(), 1 / 60);
    expect(s.force.x).not.toBeCloseTo(-40 * config.flock.settle.brakeGain);
  });

  it("does not brake a hungry sheep even when steering force is small", () => {
    const s = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    s.vel = { x: 6, y: 0 };
    s.drives.hunger = 0.9; // above settle.hungerMax => not contented
    s.drives.thirst = 0;
    s.drives.fear = 0;
    steeringSystem([s], baseEnv(), 1 / 60);
    // No braking term applied: force stays the (amplified) steering force, not -84.
    expect(s.force.x).not.toBeCloseTo(-6 * config.flock.settle.brakeGain);
  });
});
