import { describe, it, expect } from "vitest";
import { scareSystem } from "./ScareSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { StressSource } from "../scare/StressSource.js";
import type { DogIntent } from "../types.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("scareSystem", () => {
  it("emits a presence source at the dog every frame", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 50, y: 60 });
    scareSystem(stress, dog, intent(), 1 / 60);
    expect(stress.length).toBe(1);
    expect(stress[0]!.kind).toBe("presence");
    expect(stress[0]!.pos).toEqual({ x: 50, y: 60 });
    expect(stress[0]!.intensity).toBe(config.scare.presenceIntensity);
  });

  it("emits a bark source when intent.bark fires and the cooldown is ready", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 50, y: 60 });
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    const bark = stress.find((s) => s.kind === "bark");
    expect(bark).toBeDefined();
    expect(bark!.radius).toBe(config.scare.barkRadius);
    expect(dog.barkCooldown).toBeCloseTo(config.scare.barkCooldown);
  });

  it("does not bark again while on cooldown", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 50, y: 60 });
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    const stress2: StressSource[] = [];
    scareSystem(stress2, dog, intent({ bark: true }), 1 / 60);
    expect(stress2.some((s) => s.kind === "bark")).toBe(false);
  });

  it("clears the previous frame's sources and is a no-op with no dog", () => {
    const stress: StressSource[] = [{ kind: "bark", pos: { x: 0, y: 0 }, radius: 1, intensity: 1 }];
    scareSystem(stress, null, intent(), 1 / 60);
    expect(stress.length).toBe(0);
  });
});

describe("scareSystem stamina gate", () => {
  it("spends stamina on a bark", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 0, y: 0 });
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    expect(dog.stamina).toBeCloseTo(config.stamina.max - config.stamina.barkCost);
  });
  it("will not bark when stamina is below the bark cost", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = config.stamina.barkCost - 1;
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    expect(stress.some((s) => s.kind === "bark")).toBe(false);
    expect(dog.stamina).toBe(config.stamina.barkCost - 1);
  });
});
