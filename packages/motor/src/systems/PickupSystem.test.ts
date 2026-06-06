import { describe, it, expect } from "vitest";
import { pickupSystem } from "./PickupSystem.js";
import { createDog } from "../entities/Dog.js";
import { createTreat } from "../entities/Treat.js";
import { createSignals } from "../world/signals.js";
import { AgentPool } from "../world/Pool.js";
import { config } from "../config.js";
import type { Vec2 } from "@getback/math";
import type { Treat } from "../entities/Treat.js";

function makeTreatPool(): AgentPool<Treat> {
  // AgentPool API from Plan 14: constructor takes { create, reset }
  return new AgentPool<Treat>({
    create: () => createTreat({ x: 0, y: 0 }),
    reset:  () => {},  // position is set by the caller after acquire
  });
}

describe("pickupSystem", () => {
  it("no overlap — treat stays in active list, stamina unchanged", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 0;
    const treat = createTreat({ x: 200, y: 200 }); // far away
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    const signals = createSignals();
    pickupSystem(dog, active, pool, signals);
    expect(active.length).toBe(1);
    expect(dog.stamina).toBe(0);
  });

  it("overlap — treat is removed, stamina refills to max", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 10;
    const treat = createTreat({ x: 0, y: 0 }); // on top of dog
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    const signals = createSignals();
    pickupSystem(dog, active, pool, signals);
    expect(active.length).toBe(0);
    expect(dog.stamina).toBe(config.stamina.max);
  });

  it("overlap — stamina never exceeds max even when already full", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = config.stamina.max;
    const treat = createTreat({ x: 0, y: 0 });
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    pickupSystem(dog, active, pool, createSignals());
    expect(dog.stamina).toBe(config.stamina.max);
  });

  it("overlap — emits treatCollected with the treat position", () => {
    const dog = createDog({ x: 5, y: 5 });
    dog.stamina = 0;
    const treat = createTreat({ x: 5, y: 5 });
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    const signals = createSignals();
    const positions: Vec2[] = [];
    signals.treatCollected.add((p) => positions.push(p));
    pickupSystem(dog, active, pool, signals);
    expect(positions.length).toBe(1);
    expect(positions[0]!.x).toBe(5);
  });

  it("overlap with rng below buffChance — dog gets a buff", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 0;
    const treat = createTreat({ x: 0, y: 0 });
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    // pickupSystem uses an rng parameter; pass one that always returns 0
    // (below buffChance=0.5) to guarantee a buff.
    pickupSystem(dog, active, pool, createSignals(), {
      float: () => 0,
      int: () => 0,
      range: () => 0,
      pick: (a) => a[0]!,
    });
    expect(dog.activeBuff).not.toBeNull();
  });
});
