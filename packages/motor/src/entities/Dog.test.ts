import { describe, it, expect } from "vitest";
import { createDog } from "./Dog.js";
import { config } from "../config.js";

describe("createDog", () => {
  it("builds a Mobile dog at the given position with dog tuning", () => {
    const d = createDog({ x: 30, y: 40 });
    expect(d.pos).toEqual({ x: 30, y: 40 });
    expect(d.vel).toEqual({ x: 0, y: 0 });
    expect(d.force).toEqual({ x: 0, y: 0 });
    expect(d.radius).toBe(config.dog.radius);
    expect(d.maxSpeed).toBe(config.dog.maxSpeed);
    expect(d.maxForce).toBe(config.dog.maxForce);
  });
  it("copies the position and seeds prevPos", () => {
    const pos = { x: 1, y: 2 };
    const d = createDog(pos);
    pos.x = 999;
    expect(d.pos.x).toBe(1);
    expect(d.prevPos).toEqual({ x: 1, y: 2 });
  });
});
