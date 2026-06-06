import { describe, it, expect } from "vitest";
import { dogControlSystem } from "./DogControlSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { DogIntent } from "../types.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("dogControlSystem", () => {
  it("steers toward the move direction (from rest, force = desired velocity)", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 } }));
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed);
    expect(d.force.y).toBeCloseTo(0);
  });
  it("scales desired speed by sprintMult when sprinting", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 }, sprint: true }));
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * config.dog.sprintMult);
  });
  it("normalizes a diagonal move direction", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 3, y: 4 } }));
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * 0.6);
    expect(d.force.y).toBeCloseTo(config.dog.maxSpeed * 0.8);
  });
  it("actively brakes (force opposes velocity) when there is no input", () => {
    const d = createDog({ x: 0, y: 0 });
    d.vel = { x: 10, y: 0 };
    dogControlSystem(d, intent({ moveDir: { x: 0, y: 0 } }));
    expect(d.force.x).toBeCloseTo(-10 * config.dog.stopGain);
    expect(d.force.y).toBeCloseTo(0);
  });
  it("does not sprint when stamina is empty", () => {
    const d = createDog({ x: 0, y: 0 });
    d.stamina = 0;
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 }, sprint: true }));
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed);
  });
});
