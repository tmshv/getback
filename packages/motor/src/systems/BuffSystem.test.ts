import { describe, it, expect } from "vitest";
import { buffSystem, grantBuff } from "./BuffSystem.js";
import { createDog } from "../entities/Dog.js";

describe("grantBuff", () => {
  it("sets activeBuff on the dog", () => {
    const dog = createDog({ x: 0, y: 0 });
    expect(dog.activeBuff).toBeNull();
    grantBuff(dog, "zoomies");
    expect(dog.activeBuff).not.toBeNull();
    expect(dog.activeBuff!.kind).toBe("zoomies");
    expect(dog.activeBuff!.timeLeft).toBeGreaterThan(0);
  });

  it("replaces an existing buff", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "zoomies");
    grantBuff(dog, "megabark");
    expect(dog.activeBuff!.kind).toBe("megabark");
  });
});

describe("buffSystem", () => {
  it("ticks down timeLeft", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "calm");
    const before = dog.activeBuff!.timeLeft;
    buffSystem(dog, 1);
    expect(dog.activeBuff!.timeLeft).toBeLessThan(before);
  });

  it("expires the buff when timeLeft reaches zero", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "calm");
    buffSystem(dog, 100); // dt >> duration
    expect(dog.activeBuff).toBeNull();
  });

  it("is a no-op when activeBuff is null", () => {
    const dog = createDog({ x: 0, y: 0 });
    expect(() => buffSystem(dog, 1)).not.toThrow();
    expect(dog.activeBuff).toBeNull();
  });
});
