import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import { config } from "../config.js";

export type BuffKind = "zoomies" | "megabark" | "calm";

export interface ActiveBuff {
  kind:     BuffKind;
  timeLeft: number;
}

// The player's corgi. Mobile + stamina + current power-up state.
export interface Dog extends Mobile {
  barkCooldown: number;
  stamina:      number;
  activeBuff:   ActiveBuff | null;
}

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
    barkCooldown: 0,
    stamina: config.stamina.max,
    activeBuff: null,
  };
}
