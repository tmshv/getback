import { describe, it, expect } from "vitest";
import { separation, cohesion, follow, graze, obstacleAvoid, fleeStress, penInterior, isPenned } from "./behaviors.js";
import type { Mobile } from "../types.js";
import type { StressSource } from "../scare/StressSource.js";
import { createGrassField, setDensityAt } from "../grass/GrassField.js";
import { createObstacle } from "../entities/Obstacle.js";
import { drink, idle, goalIs } from "./behaviors.js";
import type { Sheep } from "../entities/Sheep.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { createAttractor } from "../entities/Attractor.js";

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
    separation(12).run(self, { neighbors: [near], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out.x).toBeLessThan(0);
  });
  it("ignores neighbors beyond personalSpace", () => {
    const self = agent();
    const far = agent({ pos: { x: 50, y: 0 } });
    const out = { x: 1, y: 1 };
    separation(12).run(self, { neighbors: [far], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("cohesion", () => {
  // comfort = 30, ramp = 40 for these tests (independent of config tuning).
  it("steers toward the centroid when the flock is farther than the comfort radius", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const a = agent({ pos: { x: 40, y: 0 } });
    const b = agent({ pos: { x: 60, y: 0 } }); // centroid (50,0), dist 50 > comfort
    const out = { x: 0, y: 0 };
    cohesion(6, 30, 40).run(self, { neighbors: [a, b], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("produces NO pull when already within the comfort radius of the centroid (kills the huddle jitter)", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const a = agent({ pos: { x: 10, y: 0 } });
    const b = agent({ pos: { x: 20, y: 0 } }); // centroid (15,0), dist 15 < comfort 30
    const out = { x: 9, y: 9 };
    cohesion(6, 30, 40).run(self, { neighbors: [a, b], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
  it("ramps the desired pull from ~0 at the comfort boundary so it does not overshoot back in", () => {
    const self = agent({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, maxSpeed: 10 });
    const a = agent({ pos: { x: 34, y: 0 } }); // dist 34, only 4px past comfort 30, ramp 40
    const near = { x: 0, y: 0 };
    cohesion(6, 30, 40).run(self, { neighbors: [a], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, near);
    // desiredSpeed = maxSpeed * (4/40) = 1.0 (gentle), not the full 10.
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(2);
  });
});

describe("follow", () => {
  it("aligns toward the heading of moving neighbors", () => {
    const self = agent({ vel: { x: 0, y: 0 } });
    const mover = agent({ vel: { x: 8, y: 0 } });
    const out = { x: 0, y: 0 };
    follow(2).run(self, { neighbors: [mover], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("ignores stationary neighbors", () => {
    const self = agent();
    const still = agent({ vel: { x: 0, y: 0 } });
    const out = { x: 1, y: 1 };
    follow(2).run(self, { neighbors: [still], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("graze", () => {
  it("steers toward greener grass (up the density gradient)", () => {
    const grass = createGrassField({ cols: 10, rows: 10, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0.2 });
    setDensityAt(grass, 70, 50, 1); // lush cell to the east of (50,50)
    const self = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const out = { x: 0, y: 0 };
    graze().run(self, { neighbors: [], grass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("produces no force on a uniform field", () => {
    const grass = createGrassField({ cols: 10, rows: 10, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0.5 });
    const self = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const out = { x: 1, y: 1 };
    graze().run(self, { neighbors: [], grass, obstacles: [], stress: [], fear: 0, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("obstacleAvoid", () => {
  it("steers away from a nearby obstacle", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const obs = createObstacle("rock", { x: 12, y: 0 }, 8);
    const out = { x: 0, y: 0 };
    obstacleAvoid(18).run(self, { neighbors: [], grass: noGrass, obstacles: [obs], stress: [], fear: 0, dt: 0 }, out);
    expect(out.x).toBeLessThan(0);
  });
  it("ignores obstacles outside the avoid range", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const obs = createObstacle("rock", { x: 500, y: 0 }, 8);
    const out = { x: 1, y: 1 };
    obstacleAvoid(18).run(self, { neighbors: [], grass: noGrass, obstacles: [obs], stress: [], fear: 0, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("fleeStress", () => {
  it("steers away from a nearby stress source", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const src: StressSource = { kind: "bark", pos: { x: 10, y: 0 }, radius: 70, intensity: 1 };
    const out = { x: 0, y: 0 };
    fleeStress().run(self, { neighbors: [], grass: noGrass, obstacles: [], stress: [src], fear: 0, dt: 0 }, out);
    expect(out.x).toBeLessThan(0);
  });
  it("ignores stress sources out of range", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const src: StressSource = { kind: "bark", pos: { x: 500, y: 0 }, radius: 70, intensity: 1 };
    const out = { x: 1, y: 1 };
    fleeStress().run(self, { neighbors: [], grass: noGrass, obstacles: [], stress: [src], fear: 0, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("cohesion fear boost", () => {
  it("produces a stronger pull toward the flock when afraid", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const a = { pos: { x: 60, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const calm = { x: 0, y: 0 };
    const scared = { x: 0, y: 0 };
    cohesion(6, 30, 40).run(self, { neighbors: [a], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, calm);
    cohesion(6, 30, 40).run(self, { neighbors: [a], grass: noGrass, obstacles: [], stress: [], fear: 1, dt: 0 }, scared);
    expect(Math.hypot(scared.x, scared.y)).toBeGreaterThan(Math.hypot(calm.x, calm.y));
  });
});

describe("penInterior", () => {
  it("steers toward the pen centroid when one is provided", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const out = { x: 0, y: 0 };
    const status = penInterior(20).run(
      self,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, penCentroid: { x: 100, y: 0 } },
      out,
    );
    expect(status).toBe("fired");
    expect(out.x).toBeGreaterThan(0); // pulled toward the +x centroid
  });
  it("skips with zero force when there is no pen centroid", () => {
    const self = agent();
    const out = { x: 1, y: 1 };
    const status = penInterior(20).run(
      self,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 },
      out,
    );
    expect(status).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("isPenned", () => {
  it("is true only when ctx.penned is set true", () => {
    const self = agent();
    const base = { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 };
    expect(isPenned(self, { ...base, penned: true })).toBe(true);
    expect(isPenned(self, { ...base })).toBe(false);
    expect(isPenned(self, { ...base, penned: false })).toBe(false);
  });
});

function sheepAgent(drives: { hunger: number; thirst: number; fear: number }): Sheep {
  const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
  s.drives = drives;
  return s;
}

describe("drink", () => {
  it("steers toward the water attractor when ctx.water is set", () => {
    const s = sheepAgent({ hunger: 0.3, thirst: 0.8, fear: 0 });
    const water = createAttractor("water", { x: 100, y: 0 }, 24);
    const out = { x: 0, y: 0 };
    const status = drink(24, 0.5).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, water },
      out,
    );
    expect(status).toBe("fired");
    expect(out.x).toBeGreaterThan(0); // steers toward +x water
  });

  it("skips with zero force when ctx.water is absent", () => {
    const s = sheepAgent({ hunger: 0, thirst: 1, fear: 0 });
    const out = { x: 1, y: 1 };
    const status = drink(24, 0.5).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 },
      out,
    );
    expect(status).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it("produces zero force when already at the water centre", () => {
    const s = sheepAgent({ hunger: 0, thirst: 1, fear: 0 });
    const water = createAttractor("water", { x: 0, y: 0 }, 24);
    const out = { x: 99, y: 99 };
    drink(24, 0.5).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, water },
      out,
    );
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0);
  });

  it("produces NO force once inside the satisfied core — already drinking, no pile-up jitter", () => {
    const s = sheepAgent({ hunger: 0, thirst: 1, fear: 0 });
    const water = createAttractor("water", { x: 8, y: 0 }, 24); // dist 8 < core (24*0.5=12)
    const out = { x: 5, y: 5 };
    drink(40, 0.5).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, water },
      out,
    );
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("idle", () => {
  it("produces no steering force (the content sheep stands still)", () => {
    const s = sheepAgent({ hunger: 0, thirst: 0, fear: 0 });
    const out = { x: 7, y: 7 };
    const status = idle().run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 },
      out,
    );
    expect(status).toBe("fired"); // fires (it's the chosen mode) but contributes nothing
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("goalIs", () => {
  const ctx = { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 };
  it("matches the sheep's current goal (set by DriveSystem)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.goal = "drink";
    expect(goalIs("drink")(s, ctx)).toBe(true);
    expect(goalIs("graze")(s, ctx)).toBe(false);
    s.goal = "graze";
    expect(goalIs("graze")(s, ctx)).toBe(true);
  });
  it("matches nothing for a default (idle) goal except idle", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    expect(goalIs("drink")(s, ctx)).toBe(false);
    expect(goalIs("graze")(s, ctx)).toBe(false);
    expect(goalIs("idle")(s, ctx)).toBe(true);
  });
});
