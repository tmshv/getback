import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import { config } from "../config.js";

// The player's corgi. For now just a Mobile with dog tuning; stamina/buffs land
// in a later slice.
export interface Dog extends Mobile {}

export function createDog(pos: Vec2): Dog {
  return {
    pos: { x: pos.x, y: pos.y },
    prevPos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: config.dog.radius,
    maxSpeed: config.dog.maxSpeed,
    maxForce: config.dog.maxForce,
    facing: "down",
  };
}
