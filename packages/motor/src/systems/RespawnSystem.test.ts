import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { respawnSystem } from "./RespawnSystem.js";
import { createWorld } from "../world/World.js";
import { buildPen, penContains } from "../world/Pen.js";
import { penSystem } from "./PenSystem.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";
import { AgentPool } from "../world/Pool.js";

// CCW square 0..40, gate edge 3.
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

describe("respawnSystem", () => {
  it("does nothing when not all sheep are penned", () => {
    const pen = buildPen(square, 3);
    const inside = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    const outside = createSheep({ x: 200, y: 200 }, defaultSheepTraits());
    const world = createWorld([inside, outside], undefined, [], pen, null, makeRng(1));
    penSystem(pen, world.sheep); // capture: only `inside` penned
    respawnSystem(world);
    expect(world.sheep).toContain(inside); // unchanged
    expect(world.pen).toBe(pen);
  });

  it("emits penFilled and replaces the flock + pen when the pen is full", () => {
    const pen = buildPen(square, 3);
    const a = createSheep({ x: 18, y: 18 }, defaultSheepTraits());
    const b = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    const world = createWorld([a, b], undefined, [], pen, null, makeRng(2));
    // Wire a pool so RespawnSystem can recycle sheep
    world.sheepPool = new AgentPool({
      create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
      reset: (s) => resetSheep(s, { x: 0, y: 0 }),
    });
    let filled = 0;
    world.signals.penFilled.add(() => filled++);

    penSystem(pen, world.sheep); // both inside -> both penned -> pen full
    respawnSystem(world);

    expect(filled).toBe(1); // signal fired once
    expect(world.pen).not.toBe(pen); // a new pen
    expect(world.sheep.length).toBe(2); // same count, fresh flock
    // With pool recycling the same object identities may be reused; what matters
    // is that every sheep was reset — not penned, drives cleared, outside new pen.
    for (const s of world.sheep) {
      expect(s.penned).toBe(false);
      expect(s.drives.fear).toBe(0);
      expect(s.drives.hunger).toBe(0);
      expect(penContains(world.pen!, s.pos)).toBe(false);
    }
  });

  it("is a no-op with no pen or an empty flock", () => {
    const world = createWorld([], undefined, [], null, null, makeRng(1));
    expect(() => respawnSystem(world)).not.toThrow();
  });
});
