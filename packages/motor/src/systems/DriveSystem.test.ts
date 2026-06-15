import { describe, it, expect } from "vitest";
import { driveSystem, classifyGoal } from "./DriveSystem.js";
import { createGrassField } from "../grass/GrassField.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { config } from "../config.js";
import type { Attractor } from "../entities/Attractor.js";
import { createAttractor } from "../entities/Attractor.js";

describe("classifyGoal (hysteresis + priority)", () => {
  const { hungerThreshold, hungerSated } = config.flock;
  it("idles while both drives are below their thresholds", () => {
    expect(classifyGoal("idle", 0.2, 0.2, true)).toBe("idle");
  });
  it("starts grazing once hunger crosses the threshold", () => {
    expect(classifyGoal("idle", hungerThreshold, 0, true)).toBe("graze");
  });
  it("keeps grazing below the threshold until sated (no flapping)", () => {
    expect(classifyGoal("graze", hungerThreshold - 0.1, 0, true)).toBe("graze"); // still hungry-ish
    expect(classifyGoal("graze", hungerSated, 0, true)).toBe("idle");            // sated => stop
  });
  it("prioritises drinking over grazing when both are due AND water exists", () => {
    expect(classifyGoal("idle", 1, 1, true)).toBe("drink");
  });
  it("falls back to grazing when thirsty but there is no water to drink", () => {
    // Otherwise a starving+thirsty sheep would lock onto an impossible "drink" goal
    // and never eat (just idle).
    expect(classifyGoal("idle", 1, 1, false)).toBe("graze");
    expect(classifyGoal("drink", 1, 1, false)).toBe("graze"); // even mid-drink, drop it
  });
});

describe("driveSystem", () => {
  it("raises hunger over time while idle (an idle sheep does not passively eat)", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits()); // goal idle, hunger 0
    driveSystem([s], lush, [], 1);
    expect(s.goal).toBe("idle");
    expect(s.drives.hunger).toBeCloseTo(0.05); // rose even though standing on lush grass
  });

  it("lowers hunger while grazing on grass (satiation outpaces growth)", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.hunger = 0.5; // at threshold => grazes
    driveSystem([s], lush, [], 1);
    expect(s.goal).toBe("graze");
    expect(s.drives.hunger).toBeCloseTo(0.05); // 0.5 + 0.05 - 0.5
  });

  it("clamps hunger to [0,1] while grazing", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.goal = "graze";
    s.drives.hunger = 0.2; // grazing (above sated), big consumption drives it negative => clamp 0
    driveSystem([s], lush, [], 1);
    expect(s.drives.hunger).toBe(0);
  });
});

describe("driveSystem — thirst", () => {
  it("raises thirst over time (no water nearby)", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    driveSystem([s], bare, [], 1);
    expect(s.drives.thirst).toBeCloseTo(0.03);
  });

  it("reduces thirst while sheep is inside a water attractor", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const water: Attractor = createAttractor("water", { x: 25, y: 25 }, 30);
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.thirst = 0.5;
    driveSystem([s], bare, [water], 1);
    // net = 0.5 + 0.03 - 0.6 = -0.07 => clamped to 0
    expect(s.drives.thirst).toBe(0);
  });

  it("does not reduce thirst when outside the water radius", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const water: Attractor = createAttractor("water", { x: 200, y: 200 }, 20);
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    driveSystem([s], bare, [water], 1);
    expect(s.drives.thirst).toBeCloseTo(0.03);
  });

  it("clamps thirst to [0,1]", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.thirst = 0.99;
    // Run 10 seconds without water: would reach >1
    driveSystem([s], bare, [], 10);
    expect(s.drives.thirst).toBe(1);
  });

  it("hunger still rises even while fleeing (no dependency on behavior)", () => {
    // DriveSystem is behavior-agnostic — it always ticks hunger and thirst
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.fear = 1; // maximally afraid
    driveSystem([s], bare, [], 1);
    expect(s.drives.hunger).toBeGreaterThan(0); // hunger still ticked
    expect(s.drives.thirst).toBeGreaterThan(0); // thirst still ticked
  });
});
