import type { Vec2 } from "@getback/math";
import type { Rng } from "@getback/math";
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
  boldness: number;    // [0..1] low = skittish; wired into fear recovery in Plan 14
}

export interface Sheep extends Mobile {
  traits: SheepTraits;
  drives: { hunger: number; thirst: number; fear: number }; // each [0..1]
  penned: boolean;
  neighbors: Sheep[]; // refilled each frame by NeighborhoodSystem
  root: BehaviorNode;
}

// Deterministic baseline — used by all existing tests. Never remove.
export function defaultSheepTraits(): SheepTraits {
  return {
    maxSpeed: config.flock.maxSpeed,
    maxForce: config.flock.maxForce,
    personalSpace: config.flock.personalSpace,
    perception: config.flock.perception,
    sociability: 1,
    boldness: 1,
  };
}

// Randomised traits for a fresh sheep at spawn (§8.5). Seeded so the herd is
// reproducible. boldness is stored here; FearSystem wires it in Plan 14.
export function rollSheepTraits(rng: Rng): SheepTraits {
  const t = config.traits;
  const baseSpeed = config.flock.maxSpeed;
  return {
    maxSpeed: rng.range(baseSpeed * (1 - t.maxSpeedJitter), baseSpeed * (1 + t.maxSpeedJitter)),
    maxForce: config.flock.maxForce,
    personalSpace: config.flock.personalSpace,
    perception: config.flock.perception,
    sociability: rng.range(t.sociabilityMin, t.sociabilityMax),
    boldness: rng.range(t.boldnessMin, t.boldnessMax),
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
    drives: { hunger: 0, thirst: 0, fear: 0 },
    penned: false,
    neighbors: [],
    root: buildSheepTree(traits),
  };
}
