import { describe, it, expect } from "vitest";
import { staminaSystem } from "./StaminaSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { DogIntent } from "../types.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("staminaSystem", () => {
  it("drains stamina while sprinting (moving + sprint held)", () => {
    const dog = createDog({ x: 0, y: 0 });
    staminaSystem(dog, intent({ moveDir: { x: 1, y: 0 }, sprint: true }), 1);
    expect(dog.stamina).toBeCloseTo(config.stamina.max - config.stamina.sprintDrain);
  });
  it("regenerates when not sprinting", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 50;
    staminaSystem(dog, intent(), 1);
    expect(dog.stamina).toBeCloseTo(50 + config.stamina.regen);
  });
  it("does not drain when sprint is held but there is no movement", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 50;
    staminaSystem(dog, intent({ moveDir: { x: 0, y: 0 }, sprint: true }), 1);
    expect(dog.stamina).toBeGreaterThan(50);
  });
  it("clamps to [0, max]", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 5;
    staminaSystem(dog, intent({ moveDir: { x: 1, y: 0 }, sprint: true }), 1);
    expect(dog.stamina).toBe(0);
    dog.stamina = config.stamina.max - 1;
    staminaSystem(dog, intent(), 1);
    expect(dog.stamina).toBe(config.stamina.max);
  });
});
