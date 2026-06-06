import { describe, it, expect } from "vitest";
import { penSystem } from "./PenSystem.js";
import { buildPen } from "../world/Pen.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { createSignals } from "../world/signals.js";

const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

describe("penSystem", () => {
  it("flags sheep inside the polygon as penned and collects them", () => {
    const pen = buildPen(square, 0);
    const inside = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    const outside = createSheep({ x: 200, y: 200 }, defaultSheepTraits());
    penSystem(pen, [inside, outside]);
    expect(inside.penned).toBe(true);
    expect(outside.penned).toBe(false);
    expect(pen.contained.has(inside)).toBe(true);
    expect(pen.contained.has(outside)).toBe(false);
    expect(pen.contained.size).toBe(1);
  });

  it("recomputes cleanly each call (a sheep that leaves is un-penned)", () => {
    const pen = buildPen(square, 0);
    const s = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    penSystem(pen, [s]);
    expect(s.penned).toBe(true);
    s.pos.x = 500;
    penSystem(pen, [s]);
    expect(s.penned).toBe(false);
    expect(pen.contained.size).toBe(0);
  });
});

describe("sheepPenned signal", () => {
  it("emits sheepPenned once for each newly captured sheep", () => {
    const pen = buildPen(square, 3);
    const inside = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    const outside = createSheep({ x: 200, y: 200 }, defaultSheepTraits());
    const signals = createSignals();
    let count = 0;
    signals.sheepPenned.add(() => count++);

    penSystem(pen, [inside, outside], signals);
    expect(count).toBe(1);
    // Second call: already penned — no extra emit.
    penSystem(pen, [inside, outside], signals);
    expect(count).toBe(1);
  });
});
