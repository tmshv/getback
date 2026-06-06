import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { respawnSystem } from "./RespawnSystem.js";
import { createWorld } from "../world/World.js";
import { buildPen, penContains } from "../world/Pen.js";
import { penSystem } from "./PenSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

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
    let filled = 0;
    world.signals.penFilled.add(() => filled++);

    penSystem(pen, world.sheep); // both inside -> both penned -> pen full
    respawnSystem(world);

    expect(filled).toBe(1); // signal fired once
    expect(world.pen).not.toBe(pen); // a new pen
    expect(world.sheep.length).toBe(2); // same count, fresh flock
    expect(world.sheep).not.toContain(a); // old sheep gone
    expect(world.sheep).not.toContain(b);
    // the fresh sheep are scattered OUTSIDE the new pen (not instantly re-penned)
    for (const s of world.sheep) expect(penContains(world.pen!, s.pos)).toBe(false);
  });

  it("is a no-op with no pen or an empty flock", () => {
    const world = createWorld([], undefined, [], null, null, makeRng(1));
    expect(() => respawnSystem(world)).not.toThrow();
  });
});
