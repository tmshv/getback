import { describe, it, expect } from "vitest";
import { Game } from "./Game.js";
import { createWorld } from "./World.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";
import { createGrassField, setDensityAt } from "../grass/GrassField.js";
import { createObstacle } from "../entities/Obstacle.js";
import { createDog } from "../entities/Dog.js";
import { makeRng } from "@getback/math";
import { generatePen } from "../world/penGen.js";
import { buildPen, penContains } from "../world/Pen.js";
import { config } from "../config.js";

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
    const game = new Game(createWorld(sheep));

    const spread0 = spread(sheep);
    for (let i = 0; i < 1200; i++) game.update(1 / 60);

    const spread1 = spread(sheep);

    expect(spread1).toBeLessThan(spread0 * 0.7);
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
    let totalBefore = 0;
    for (let i = 0; i < grass.density.length; i++) totalBefore += grass.density[i]!;

    for (let i = 0; i < 1200; i++) game.update(1 / 60); // 20 s

    // It climbed the gradient eastward toward greener pasture.
    expect(sheep[0]!.pos.x).toBeGreaterThan(startX + 50);
    // ...and grazed grass down along the way (regrowRate 0, so any drop is the sheep eating).
    let totalAfter = 0;
    for (let i = 0; i < grass.density.length; i++) totalAfter += grass.density[i]!;
    expect(totalAfter).toBeLessThan(totalBefore);
    // numerically sane
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
    const rock = createObstacle("rock", { x: 240, y: 140 }, 14); // directly east, in the path
    const game = new Game(createWorld(sheep, grass, [rock]));

    let minClearance = Infinity;
    for (let i = 0; i < 1800; i++) {
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
    let filled = 0;
    world.signals.penFilled.add(() => filled++);
    const game = new Game(world);

    game.update(1 / 60);

    expect(filled).toBe(1); // the flock was herded home
    expect(world.pen).not.toBe(pen); // a brand-new pen
    expect(world.sheep.length).toBe(2); // a fresh flock of the same size
    expect(world.sheep[0]).not.toBe(sheep[0]); // genuinely new sheep

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
