import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import type { BehaviorNode } from "../steering/types.js";
import { config } from "../config.js";
import { buildSheepTree } from "../ai/trees.js";

export interface SheepTraits {
  maxSpeed: number;
  maxForce: number;
  personalSpace: number;
  perception: number;
  sociability: number; // [0..1] scales cohesion + follow
}

export interface Sheep extends Mobile {
  traits: SheepTraits;
  drives: { hunger: number; fear: number }; // [0..1]; grows in later plans (thirst)
  penned: boolean;
  neighbors: Sheep[]; // refilled each frame by NeighborhoodSystem
  root: BehaviorNode;
}

export function defaultSheepTraits(): SheepTraits {
  return {
    maxSpeed: config.flock.maxSpeed,
    maxForce: config.flock.maxForce,
    personalSpace: config.flock.personalSpace,
    perception: config.flock.perception,
    sociability: 1,
  };
}

export function createSheep(pos: Vec2, traits: SheepTraits): Sheep {
  return {
    pos: { x: pos.x, y: pos.y },
    prevPos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: config.flock.radius,
    maxSpeed: traits.maxSpeed,
    maxForce: traits.maxForce,
    facing: "down",
    traits,
    drives: { hunger: 0, fear: 0 },
    penned: false,
    neighbors: [],
    root: buildSheepTree(traits),
  };
}
