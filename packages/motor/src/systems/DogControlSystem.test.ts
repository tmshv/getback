import { describe, it, expect } from "vitest";
import { dogControlSystem } from "./DogControlSystem.js";
import { integrate } from "./MovementSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { DogIntent } from "../types.js";
import { grantBuff } from "./BuffSystem.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("dogControlSystem", () => {
  it("steers toward the move direction (from rest, force = desired velocity)", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 } }), 1 / 60);
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * config.dog.accelGain);
    expect(d.force.y).toBeCloseTo(0);
  });
  it("scales desired speed by sprintMult when sprinting", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 }, sprint: true }), 1 / 60);
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * config.dog.sprintMult * config.dog.accelGain);
  });
  it("normalizes a diagonal move direction", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 3, y: 4 } }), 1 / 60);
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * 0.6 * config.dog.accelGain);
    expect(d.force.y).toBeCloseTo(config.dog.maxSpeed * 0.8 * config.dog.accelGain);
  });
  it("actively brakes (force opposes velocity) when there is no input", () => {
    const d = createDog({ x: 0, y: 0 });
    d.vel = { x: 10, y: 0 };
    dogControlSystem(d, intent({ moveDir: { x: 0, y: 0 } }), 1 / 60);
    expect(d.force.x).toBeCloseTo(-10 * config.dog.stopGain);
    expect(d.force.y).toBeCloseTo(0);
  });
  it("does not sprint when stamina is empty", () => {
    const d = createDog({ x: 0, y: 0 });
    d.stamina = 0;
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 }, sprint: true }), 1 / 60);
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * config.dog.accelGain);
  });
});

describe("dogControlSystem braking stability", () => {
  // Braking is force = -vel*stopGain integrated as vel += force*dt, i.e.
  // vel *= (1 - stopGain*dt). At the dt clamp ceiling (1/30), stopGain*dt = 40/30
  // > 1, so the naive brake overshoots zero: velocity flips sign every frame and
  // rings down (30 -> -10 -> 3.3 -> ...). That sign flip flickers the facing
  // left/right/left/right -> the visible "<><><>" arrow jitter when stopping.
  it("decays velocity toward zero without reversing sign at the dt clamp ceiling", () => {
    const d = createDog({ x: 0, y: 0 });
    d.vel = { x: 30, y: 0 };
    const dt = config.dtClampMax; // worst case the integrator ever sees
    for (let i = 0; i < 10; i++) {
      dogControlSystem(d, intent({ moveDir: { x: 0, y: 0 } }), dt);
      integrate(d, dt);
      expect(d.vel.x).toBeGreaterThanOrEqual(0); // must never overshoot past zero
    }
    expect(d.vel.x).toBeCloseTo(0);
  });

  it("holds facing steady (no <><> flicker) while braking to a stop", () => {
    const d = createDog({ x: 0, y: 0 });
    d.vel = { x: 30, y: 0 };
    d.facing = "right";
    const dt = config.dtClampMax;
    for (let i = 0; i < 10; i++) {
      dogControlSystem(d, intent({ moveDir: { x: 0, y: 0 } }), dt);
      integrate(d, dt);
      expect(d.facing).toBe("right");
    }
  });
});

describe("zoomies buff", () => {
  it("zoomies buff raises effective top speed above the sprint cap", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "zoomies");
    dogControlSystem(dog, intent({ moveDir: { x: 1, y: 0 } }), 1 / 60);
    // force.x drives toward zoomies-scaled speed; must exceed plain maxSpeed
    // (force is vel-error; starting from vel=0, force ≈ target speed × mult)
    expect(dog.force.x).toBeGreaterThan(config.dog.maxSpeed);
  });
});
