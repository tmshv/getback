import { describe, it, expect } from "vitest";
import { Game } from "./Game.js";
import { createWorld } from "./World.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";
import { AgentPool } from "../world/Pool.js";
import { createGrassField, setDensityAt } from "../grass/GrassField.js";
import { createObstacle } from "../entities/Obstacle.js";
import { createDog } from "../entities/Dog.js";
import { makeRng } from "@getback/math";
import { generatePen } from "../world/penGen.js";
import { buildPen, penContains } from "../world/Pen.js";
import { config } from "../config.js";
import { createAttractor } from "../entities/Attractor.js";
import { createTreat } from "../entities/Treat.js";
import { grantBuff } from "../systems/BuffSystem.js";

function centroid(sheep: Sheep[]) {
  const c = { x: 0, y: 0 };
  for (const s of sheep) {
    c.x += s.pos.x;
    c.y += s.pos.y;
  }
  c.x /= sheep.length;
  c.y /= sheep.length;
  return c;
}

function spread(sheep: Sheep[]) {
  const c = centroid(sheep);
  let s = 0;
  for (const sh of sheep) s += Math.hypot(sh.pos.x - c.x, sh.pos.y - c.y);
  return s / sheep.length;
}

function minPairwise(sheep: Sheep[]) {
  let m = Infinity;
  for (let a = 0; a < sheep.length; a++) {
    for (let b = a + 1; b < sheep.length; b++) {
      m = Math.min(m, Math.hypot(sheep[a]!.pos.x - sheep[b]!.pos.x, sheep[a]!.pos.y - sheep[b]!.pos.y));
    }
  }
  return m;
}

describe("flocking integration", () => {
  it("a scattered flock cohesively pulls together without collapsing onto itself", () => {
    const t = () => ({ ...defaultSheepTraits(), perception: 80 });
    const sheep = [
      createSheep({ x: 100, y: 120 }, t()),
      createSheep({ x: 160, y: 120 }, t()),
      createSheep({ x: 130, y: 170 }, t()),
      createSheep({ x: 130, y: 90 }, t()),
    ];
    // Uniform, non-depleting grass so the graze gradient stays zero — this isolates
    // cohesion (a hungry flock would otherwise scatter chasing greener patches as it
    // grazes down its own ground).
    const flat = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 1 });
    const game = new Game(createWorld(sheep, flat));

    const spread0 = spread(sheep);
    for (let i = 0; i < 1200; i++) {
      // Keep them hungry (active) — a content sheep stands still and does not
      // regroup; cohesion only pulls a flock that is on the move.
      for (const s of sheep) s.drives.hunger = 1;
      game.update(1 / 60);
    }

    const spread1 = spread(sheep);

    // Cohesion's comfort band (config.flock.cohesionComfort) stops the pull once a
    // sheep is within ~36px of the flock centroid, so the herd settles into a
    // LOOSER huddle than a naive seek-the-centroid rule (which packs tight but
    // jitters). We still require a clear contraction — the flock visibly gathers —
    // just not a collapse into a point.
    expect(spread1).toBeLessThan(spread0 * 0.8);
    expect(minPairwise(sheep)).toBeGreaterThan(4);
    for (const s of sheep) {
      expect(Number.isFinite(s.pos.x)).toBe(true);
      expect(Number.isFinite(s.pos.y)).toBe(true);
    }
  });
});

describe("autonomous grazing integration", () => {
  it("a lone sheep climbs a smooth grass gradient toward greener pasture, grazing as it goes", () => {
    // A SMOOTH west->east gradient: bare in the west, lush in the east. Every
    // cell has a non-zero eastward gradient, so even a sheep starting in the
    // sparse west senses which way is greener (a sharp far-off band would read
    // zero gradient locally and give no signal).
    const cols = 30, rows = 18, cs = 16;
    const grass = createGrassField({ cols, rows, cellSize: cs, regrowRate: 0, depleteRate: 0.4, initial: 0 });
    for (let cx = 0; cx < cols; cx++) {
      const d = 0.1 + 0.9 * (cx / (cols - 1)); // 0.1 (west) -> 1.0 (east)
      for (let cy = 0; cy < rows; cy++) setDensityAt(grass, cx * cs + 8, cy * cs + 8, d);
    }
    const sheep = [createSheep({ x: 120, y: 140 }, defaultSheepTraits())];
    const game = new Game(createWorld(sheep, grass));

    const startX = sheep[0]!.pos.x;
    // Grass is a static field (no in-game depletion), so we keep the sheep hungry to
    // exercise the graze behaviour, which follows the density gradient toward
    // greener pasture in the east.
    for (let i = 0; i < 1200; i++) {
      sheep[0]!.drives.hunger = 1;
      game.update(1 / 60); // 20 s
    }

    expect(sheep[0]!.pos.x).toBeGreaterThan(startX + 50); // climbed east toward greener grass
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
    expect(Number.isFinite(sheep[0]!.pos.y)).toBe(true);
  });
});

describe("obstacle collision integration", () => {
  it("a sheep driven toward an obstacle never ends up inside it", () => {
    // Strong eastward grass gradient drives the sheep east; a rock sits in its path.
    const cols = 30, rows = 18, cs = 16;
    const grass = createGrassField({ cols, rows, cellSize: cs, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < cols; cx++) {
      const d = 0.1 + 0.9 * (cx / (cols - 1));
      for (let cy = 0; cy < rows; cy++) setDensityAt(grass, cx * cs + 8, cy * cs + 8, d);
    }
    const sheep = [createSheep({ x: 120, y: 140 }, defaultSheepTraits())];
    sheep[0]!.drives.hunger = 1; // hungry so the goal cascade grazes east toward the rock
    const rock = createObstacle("rock", { x: 240, y: 140 }, 14); // directly east, in the path
    const game = new Game(createWorld(sheep, grass, [rock]));

    let minClearance = Infinity;
    for (let i = 0; i < 1800; i++) {
      sheep[0]!.drives.hunger = 1; // keep it hungry so it stays driven east (grazing would otherwise sate it)
      game.update(1 / 60);
      const d = Math.hypot(sheep[0]!.pos.x - rock.pos.x, sheep[0]!.pos.y - rock.pos.y);
      minClearance = Math.min(minClearance, d);
      // INVARIANT every frame: never penetrate (allow a tiny epsilon for float push-out)
      expect(d).toBeGreaterThan(sheep[0]!.radius + rock.radius - 0.5);
    }
    // It actually engaged the obstacle region (got within the avoidance ring),
    // otherwise the no-penetration invariant would be vacuous.
    expect(minClearance).toBeLessThan(sheep[0]!.radius + rock.radius + 22);
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });
});

describe("pen capture integration", () => {
  it("a generated pen captures sheep placed inside it and not those outside", () => {
    const shape = generatePen(makeRng(11), { center: { x: 240, y: 135 }, ...config.pen });
    const pen = buildPen(shape.outline, shape.gateEdge);
    const inside = createSheep({ x: pen.centroid.x, y: pen.centroid.y }, defaultSheepTraits());
    const outside = createSheep({ x: 10, y: 10 }, defaultSheepTraits());
    const game = new Game(createWorld([inside, outside], undefined, [], pen));

    game.update(1 / 60);

    expect(inside.penned).toBe(true);
    expect(outside.penned).toBe(false);
    expect(pen.contained.has(inside)).toBe(true);
  });
});

describe("penned settling integration", () => {
  it("a penned sheep settles inside and ignores grass outside the gate", () => {
    // Axis-aligned square pen 100..200; gate = edge index 3 (left edge), inward = +x.
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    // Grass is lush to the WEST (outside the gate): a non-penned sheep WOULD graze
    // straight at the gate. A penned sheep must ignore it and stay put.
    const grass = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < 30; cx++) {
      const d = 1 - 0.9 * (cx / 29); // 1.0 (west) -> 0.1 (east): gradient points WEST
      for (let cy = 0; cy < 18; cy++) setDensityAt(grass, cx * 16 + 8, cy * 16 + 8, d);
    }
    const sheep = [
      createSheep({ x: 150, y: 150 }, defaultSheepTraits()), // inside, the one we track
      createSheep({ x: 5, y: 5 }, defaultSheepTraits()), // far outside -> pen never full -> no respawn
    ];
    const game = new Game(createWorld(sheep, grass, [], pen));

    let minX = Infinity;
    for (let i = 0; i < 1800; i++) {
      game.update(1 / 60);
      minX = Math.min(minX, sheep[0]!.pos.x);
      expect(penContains(pen, sheep[0]!.pos)).toBe(true); // INVARIANT: stays contained
      expect(sheep[0]!.penned).toBe(true);
    }
    expect(minX).toBeGreaterThan(130); // settled near centre — did NOT press the gate (calm)
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });

  it("a penned flock settles without collapsing onto itself", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    const sheep = [
      createSheep({ x: 140, y: 140 }, defaultSheepTraits()),
      createSheep({ x: 160, y: 140 }, defaultSheepTraits()),
      createSheep({ x: 150, y: 165 }, defaultSheepTraits()),
      createSheep({ x: 5, y: 5 }, defaultSheepTraits()), // outside -> pen never full -> no respawn
    ];
    const inside = [sheep[0]!, sheep[1]!, sheep[2]!];
    const game = new Game(createWorld(sheep, undefined, [], pen));

    for (let i = 0; i < 600; i++) game.update(1 / 60);

    for (const s of inside) {
      expect(penContains(pen, s.pos)).toBe(true);
      expect(s.penned).toBe(true);
    }
    expect(minPairwise(inside)).toBeGreaterThan(4); // separation kept them apart (no collapse)
  });
});

describe("dog control integration", () => {
  it("the dog drives toward the intent direction", () => {
    const dog = createDog({ x: 100, y: 100 });
    const game = new Game(createWorld([], undefined, [], null, dog));
    const intent = { moveDir: { x: 1, y: 0 }, sprint: false, bark: false };
    for (let i = 0; i < 60; i++) game.update(1 / 60, intent);
    expect(dog.pos.x).toBeGreaterThan(110);
    expect(Math.abs(dog.pos.y - 100)).toBeLessThan(2);
    expect(dog.facing).toBe("right");
  });

  it("the dog cannot drive through an obstacle", () => {
    const dog = createDog({ x: 100, y: 100 });
    const rock = createObstacle("rock", { x: 160, y: 100 }, 14);
    const game = new Game(createWorld([], undefined, [rock], null, dog));
    const intent = { moveDir: { x: 1, y: 0 }, sprint: true, bark: false };
    for (let i = 0; i < 300; i++) {
      game.update(1 / 60, intent);
      const d = Math.hypot(dog.pos.x - rock.pos.x, dog.pos.y - rock.pos.y);
      expect(d).toBeGreaterThan(dog.radius + rock.radius - 0.5);
    }
    expect(dog.pos.x).toBeLessThan(rock.pos.x);
  });

  it("update() still works without an intent argument (neutral)", () => {
    const game = new Game(createWorld());
    expect(() => game.update(1 / 60)).not.toThrow();
  });
});

describe("bark & flee integration", () => {
  it("a barking dog drives a nearby sheep away from it", () => {
    const dog = createDog({ x: 150, y: 150 });
    const sheep = [createSheep({ x: 170, y: 150 }, defaultSheepTraits())]; // 20px east, within bark radius
    const game = new Game(createWorld(sheep, undefined, [], null, dog));
    const intent = { moveDir: { x: 0, y: 0 }, sprint: false, bark: true };

    const startDist = Math.hypot(sheep[0]!.pos.x - dog.pos.x, sheep[0]!.pos.y - dog.pos.y);
    for (let i = 0; i < 120; i++) game.update(1 / 60, intent);
    const endDist = Math.hypot(sheep[0]!.pos.x - dog.pos.x, sheep[0]!.pos.y - dog.pos.y);

    expect(endDist).toBeGreaterThan(startDist + 15);
    expect(sheep[0]!.pos.x).toBeGreaterThan(170);
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });
});

describe("fear integration", () => {
  it("a bark spikes nearby sheep fear, which then decays once the dog stops barking", () => {
    const dog = createDog({ x: 150, y: 150 });
    const sheep = [createSheep({ x: 175, y: 150 }, defaultSheepTraits())]; // within bark radius (70)
    const game = new Game(createWorld(sheep, undefined, [], null, dog));

    for (let i = 0; i < 10; i++) game.update(1 / 60, { moveDir: { x: 0, y: 0 }, sprint: false, bark: true });
    const scared = sheep[0]!.drives.fear;
    expect(scared).toBeGreaterThan(0.3);

    dog.pos.x = 1000;
    dog.pos.y = 1000;
    for (let i = 0; i < 120; i++) game.update(1 / 60, { moveDir: { x: 0, y: 0 }, sprint: false, bark: false });
    expect(sheep[0]!.drives.fear).toBeLessThan(scared * 0.5);
  });
});

describe("stamina integration", () => {
  it("holding sprint+bark depletes stamina, then it regenerates when idle", () => {
    const dog = createDog({ x: 150, y: 150 });
    const game = new Game(createWorld([], undefined, [], null, dog));
    const busy = { moveDir: { x: 1, y: 0 }, sprint: true, bark: true };

    for (let i = 0; i < 180; i++) game.update(1 / 60, busy);
    const drained = dog.stamina;
    expect(drained).toBeLessThan(config.stamina.max * 0.5);

    const idle = { moveDir: { x: 0, y: 0 }, sprint: false, bark: false };
    for (let i = 0; i < 180; i++) game.update(1 / 60, idle);
    expect(dog.stamina).toBeGreaterThan(drained);
    expect(dog.stamina).toBeLessThanOrEqual(config.stamina.max);
  });

  it("a stamina-starved dog cannot bark", () => {
    const dog = createDog({ x: 150, y: 150 });
    dog.stamina = 0;
    const sheep = [createSheep({ x: 165, y: 150 }, defaultSheepTraits())];
    const world = createWorld(sheep, undefined, [], null, dog);
    const game = new Game(world);
    game.update(1 / 60, { moveDir: { x: 0, y: 0 }, sprint: false, bark: true });
    expect(world.stress.some((s) => s.kind === "bark")).toBe(false);
  });
});

describe("respawn integration", () => {
  it("herding the whole flock into the pen spawns a fresh flock + new pen", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    // place the whole (tiny) flock inside the pen so it fills on the first step
    const sheep = [
      createSheep({ x: 140, y: 140 }, defaultSheepTraits()),
      createSheep({ x: 160, y: 160 }, defaultSheepTraits()),
    ];
    const world = createWorld(sheep, undefined, [], pen, null, makeRng(3));
    world.sheepPool = new AgentPool({
      create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
      reset: (s) => resetSheep(s, { x: 0, y: 0 }),
    });
    let filled = 0;
    world.signals.penFilled.add(() => filled++);
    const game = new Game(world);

    game.update(1 / 60);

    expect(filled).toBe(1); // the flock was herded home
    expect(world.pen).not.toBe(pen); // a brand-new pen
    expect(world.sheep.length).toBe(2); // a fresh flock of the same size
    // With pool recycling object identity may be reused; check reset state instead.
    for (const s of world.sheep) {
      expect(s.penned).toBe(false);
      expect(s.drives.fear).toBe(0);
    }

    // the slice's central guarantee: stepping on after a respawn (the flock + pen
    // were reassigned mid-update) keeps simulating the fresh world, no stale refs.
    const fresh = world.sheep;
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    expect(world.sheep).toBe(fresh); // no spurious re-respawn (fresh flock is scattered, not penned)
    for (const s of world.sheep) {
      expect(Number.isFinite(s.pos.x)).toBe(true);
      expect(Number.isFinite(s.pos.y)).toBe(true);
    }
  });
});

describe("dog vs pen integration", () => {
  const square = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ];

  it("the dog can pass through the gate (exempt from the one-way gate)", () => {
    const pen = buildPen(square, 3); // gate = left edge (x=100)
    const dog = createDog({ x: 50, y: 150 }); // west, straight in front of the gate
    const game = new Game(createWorld([], undefined, [], pen, dog));
    const intent = { moveDir: { x: 1, y: 0 }, sprint: true, bark: false }; // drive at the gate
    for (let i = 0; i < 120; i++) game.update(1 / 60, intent);
    expect(penContains(pen, dog.pos)).toBe(true); // it walked in through the gate
    expect(dog.pos.x).toBeGreaterThan(100);
  });

  it("the dog cannot push through a solid pen fence", () => {
    const pen = buildPen(square, 3);
    const dog = createDog({ x: 150, y: 50 }); // north of the top fence (y=100)
    const game = new Game(createWorld([], undefined, [], pen, dog));
    const intent = { moveDir: { x: 0, y: 1 }, sprint: true, bark: false };
    for (let i = 0; i < 300; i++) {
      game.update(1 / 60, intent);
      expect(penContains(pen, dog.pos)).toBe(false);
    }
    expect(dog.pos.y).toBeLessThan(100); // stopped at the fence
  });
});

describe("drive goal cascade integration", () => {
  it("a thirsty sheep near water moves toward it and thirst falls", () => {
    // Place water east of the sheep. Sheep starts with full thirst (1.0).
    const water = createAttractor("water", { x: 300, y: 135 }, 24);
    const s = createSheep({ x: 100, y: 135 }, defaultSheepTraits());
    s.drives.thirst = 1.0;
    s.drives.hunger = 0.0;
    const world = createWorld([s], undefined, [], null, null, undefined, [water]);
    const game = new Game(world);

    // A calm (un-alarmed) sheep ambles at config.flock.calmSpeedMult of top speed,
    // so reaching the water takes longer than at full tilt — give it ~17s.
    for (let i = 0; i < 1000; i++) game.update(1 / 60);

    expect(s.pos.x).toBeGreaterThan(150); // moved toward water
    // Once inside the water radius thirst should have fallen from the max
    expect(s.drives.thirst).toBeLessThan(1.0);
  });

  it("a hungry (not thirsty) sheep follows the grass gradient, not water", () => {
    const water = createAttractor("water", { x: 300, y: 135 }, 24);
    // Lush grass to the west (low x); water is to the east (x=300)
    const grass = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < 30; cx++) {
      const d = 1 - (cx / 29); // 1.0 at west, 0 at east
      for (let cy = 0; cy < 18; cy++) setDensityAt(grass, cx * 16 + 8, cy * 16 + 8, d);
    }
    const s = createSheep({ x: 240, y: 135 }, defaultSheepTraits());
    s.drives.hunger = 1.0;
    s.drives.thirst = 0.0;
    const world = createWorld([s], grass, [], null, null, undefined, [water]);
    const game = new Game(world);

    for (let i = 0; i < 300; i++) game.update(1 / 60);

    // Hungry sheep should move WEST (toward grass), not east (toward water)
    expect(s.pos.x).toBeLessThan(240);
  });

  it("a content sheep stands still — the calm/idle state, not perpetual motion", () => {
    // No hunger/thirst/danger => content. The sheep should brake any residual drift
    // and stay put rather than cruise around (the old behaviour always grazed).
    const s = createSheep({ x: 100, y: 135 }, defaultSheepTraits());
    s.drives.hunger = 0.0;
    s.drives.thirst = 0.0;
    s.drives.fear = 0.0;
    s.vel = { x: 8, y: 0 }; // small residual drift to be damped out
    const game = new Game(createWorld([s]));

    const startX = s.pos.x, startY = s.pos.y;
    // ~3s: short enough that hunger/thirst stay below their seek thresholds, so the
    // sheep remains content the whole time.
    for (let i = 0; i < 180; i++) game.update(1 / 60);

    expect(Math.hypot(s.vel.x, s.vel.y)).toBeLessThan(1); // came to rest
    expect(Math.hypot(s.pos.x - startX, s.pos.y - startY)).toBeLessThan(10); // stayed put
  });
});

describe("treat pickup integration", () => {
  it("dog walking over a treat refills stamina and fires treatCollected", () => {
    const dog = createDog({ x: 100, y: 100 });
    dog.stamina = 0;
    const world = createWorld([], undefined, [], null, dog, makeRng(1));
    // Manually place a treat on top of the dog
    const treat = createTreat({ x: 100, y: 100 });
    world.treats.push(treat);

    const positions: import("@getback/math").Vec2[] = [];
    world.signals.treatCollected.add((p) => positions.push(p));

    const game = new Game(world);
    game.update(1 / 60);

    expect(world.treats.length).toBe(0); // consumed
    expect(dog.stamina).toBe(config.stamina.max);
    expect(positions.length).toBe(1);
  });
});

describe("zoomies buff integration", () => {
  it("a zoomies buff raises effective dog speed above plain maxSpeed, then expires", () => {
    const dog = createDog({ x: 100, y: 100 });
    const world = createWorld([], undefined, [], null, dog, makeRng(1));
    const game = new Game(world);
    const intent = { moveDir: { x: 1, y: 0 }, sprint: false, bark: false };

    // Grant zoomies directly (grantBuff is a named export of BuffSystem)
    grantBuff(dog, "zoomies");

    // After enough steps to converge (within the 4s buff window) the dog's
    // velocity exceeds plain maxSpeed thanks to the zoomies-raised clamp.
    for (let i = 0; i < 120; i++) game.update(1 / 60, intent);
    expect(dog.vel.x).toBeGreaterThan(config.dog.maxSpeed);

    // Tick past the duration to expire the buff. update() clamps dt to
    // config.dtClampMax, so step enough clamped frames to exceed the buff window.
    const frames = Math.ceil((config.buffs.zoomies.duration + 1) / config.dtClampMax);
    for (let i = 0; i < frames; i++) game.update(config.dtClampMax, intent);
    expect(dog.activeBuff).toBeNull();
  });
});
