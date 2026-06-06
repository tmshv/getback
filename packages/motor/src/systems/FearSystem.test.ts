import { describe, it, expect } from "vitest";
import { fearSystem } from "./FearSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";
import { createDog } from "../entities/Dog.js";
import { grantBuff } from "./BuffSystem.js";

describe("fearSystem", () => {
  it("spikes fear toward the strongest in-range stress (intensity x proximity)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    const src: StressSource = { kind: "bark", pos: { x: 0, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeCloseTo(1);
  });

  it("scales fear by proximity within the radius", () => {
    const s = createSheep({ x: 25, y: 0 }, defaultSheepTraits());
    const src: StressSource = { kind: "bark", pos: { x: 0, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeCloseTo(0.5);
  });

  it("decays fear toward 0 when no stress is in range", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.drives.fear = 1;
    fearSystem([s], [], 1);
    expect(s.drives.fear).toBe(0);
  });

  it("holds at the stress level even while a higher prior fear decays (max of the two)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.drives.fear = 0.9;
    const src: StressSource = { kind: "presence", pos: { x: 0, y: 0 }, radius: 50, intensity: 0.25 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeGreaterThan(0.85);
    expect(s.drives.fear).toBeLessThan(0.9);
  });

  it("ignores out-of-range stress", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.drives.fear = 0.4;
    const src: StressSource = { kind: "bark", pos: { x: 500, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeLessThan(0.4);
  });

  it("takes the strongest of multiple in-range sources (weaker iterated first)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    const weak: StressSource = { kind: "presence", pos: { x: 0, y: 0 }, radius: 50, intensity: 0.25 };
    const strong: StressSource = { kind: "bark", pos: { x: 0, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [weak, strong], 1 / 60); // weak first, then strong
    expect(s.drives.fear).toBeCloseTo(1); // tracks the stronger
  });

  it("clamps fear to a maximum of 1 (even if a source intensity exceeds 1)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    const src: StressSource = { kind: "bark", pos: { x: 0, y: 0 }, radius: 50, intensity: 5 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBe(1);
  });
});

describe("calm buff", () => {
  it("calm buff scales down the fear target for all sheep", () => {
    const sheep = [createSheep({ x: 0, y: 0 }, defaultSheepTraits())];
    const src: StressSource[] = [{ kind: "presence", pos: { x: 0, y: 0 }, radius: 100, intensity: 1 }];
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "calm");

    // Without calm, fear target would be 1.0; with calm it should be × fearMult
    fearSystem(sheep, src, 1 / 60, dog);
    expect(sheep[0]!.drives.fear).toBeLessThan(config.buffs.calm.fearMult + 0.01);
    expect(sheep[0]!.drives.fear).toBeGreaterThan(0);
  });
});
