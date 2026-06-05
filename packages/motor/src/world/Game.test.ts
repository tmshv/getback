import { describe, it, expect } from "vitest";
import { Game } from "./Game.js";
import { createWorld } from "./World.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";
import { createGrassField, setDensityAt } from "../grass/GrassField.js";
import { createObstacle } from "../entities/Obstacle.js";

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
