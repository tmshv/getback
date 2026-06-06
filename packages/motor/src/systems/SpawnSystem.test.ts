import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { spawnSystem } from "./SpawnSystem.js";
import { createWorld } from "../world/World.js";
import { AgentPool } from "../world/Pool.js";
import { Emitter, rectGeometry } from "../world/Emitter.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";

function makePool() {
  return new AgentPool({
    create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
    reset: (s) => resetSheep(s, { x: 0, y: 0 }),
  });
}

describe("spawnSystem", () => {
  it("does nothing when world has no emitter or pool", () => {
    const world = createWorld();
    expect(() => spawnSystem(world)).not.toThrow();
    expect(world.sheep).toHaveLength(0);
  });

  it("does not spawn before the emitter period elapses", () => {
    const rng = makeRng(1);
    const world = createWorld([], undefined, [], null, null, rng);
    world.sheepPool = makePool();
    world.sheepEmitter = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 2,
      amount: 3,
      max: 10,
      rng,
    });
    spawnSystem(world, 1.0);
    expect(world.sheep).toHaveLength(0);
  });

  it("spawns `amount` sheep once the period elapses", () => {
    const rng = makeRng(2);
    const world = createWorld([], undefined, [], null, null, rng);
    world.sheepPool = makePool();
    world.sheepEmitter = new Emitter({
      geometry: rectGeometry({ x: 10, y: 20, w: 80, h: 60 }),
      period: 1,
      amount: 4,
      max: 20,
      rng,
    });
    spawnSystem(world, 1.0);
    expect(world.sheep).toHaveLength(4);
    // Positions come from the emitter rect
    for (const s of world.sheep) {
      expect(s.pos.x).toBeGreaterThanOrEqual(10);
      expect(s.pos.x).toBeLessThan(90);
    }
  });

  it("reuses a previously released sheep from the pool", () => {
    const rng = makeRng(3);
    const world = createWorld([], undefined, [], null, null, rng);
    const pool = makePool();
    // Pre-populate the pool with a known instance
    const original = createSheep({ x: 50, y: 50 }, defaultSheepTraits());
    original.penned = true; // dirty state
    pool.release(original);

    world.sheepPool = pool;
    world.sheepEmitter = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 1,
      max: 20,
      rng,
    });
    spawnSystem(world, 1.0);
    expect(world.sheep).toHaveLength(1);
    // The released object was reused (same identity)
    expect(world.sheep[0]).toBe(original);
    // resetSheep was called via the pool reset — penned cleared
    expect(world.sheep[0]!.penned).toBe(false);
  });

  it("syncs emitter.active with world.sheep.length after spawn", () => {
    const rng = makeRng(4);
    const world = createWorld([], undefined, [], null, null, rng);
    world.sheepPool = makePool();
    const emitter = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 5,
      max: 20,
      rng,
    });
    world.sheepEmitter = emitter;
    spawnSystem(world, 1.0);
    expect(emitter.active).toBe(5);
  });
});
