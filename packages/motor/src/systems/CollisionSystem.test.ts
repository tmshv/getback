import { describe, it, expect } from "vitest";
import { collisionSystem } from "./CollisionSystem.js";
import { createObstacle } from "../entities/Obstacle.js";
import type { Mobile } from "../types.js";

function unit(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("collisionSystem", () => {
  it("pushes a penetrating unit out to the obstacle surface", () => {
    const u = unit({ pos: { x: 3, y: 0 } });
    const o = createObstacle("rock", { x: 0, y: 0 }, 5);
    collisionSystem([u], [o]);
    expect(Math.hypot(u.pos.x, u.pos.y)).toBeCloseTo(10);
    expect(u.pos.x).toBeGreaterThan(0);
  });

  it("leaves a non-overlapping unit untouched", () => {
    const u = unit({ pos: { x: 100, y: 0 } });
    const o = createObstacle("rock", { x: 0, y: 0 }, 5);
    collisionSystem([u], [o]);
    expect(u.pos).toEqual({ x: 100, y: 0 });
  });

  it("removes the inward velocity component (slide), keeping tangential motion", () => {
    const u = unit({ pos: { x: 6, y: 0 }, vel: { x: -8, y: 4 } });
    const o = createObstacle("rock", { x: 0, y: 0 }, 5);
    collisionSystem([u], [o]);
    expect(u.vel.x).toBeCloseTo(0);
    expect(u.vel.y).toBeCloseTo(4);
  });
});
