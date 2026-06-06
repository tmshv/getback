import type { Vec2 } from "@getback/math";
import type { Obstacle } from "./Obstacle.js";
import { createObstacle } from "./Obstacle.js";
import { config } from "../config.js";

export type AttractorKind = "water" | "shade";

// A circular zone sheep ENTER (not a collision obstacle). Used for water holes
// (thirst) and tree shade (rest). Solid trunks are separate Obstacle entries.
export interface Attractor {
  kind: AttractorKind;
  pos: Vec2;
  radius: number;
}

export function createAttractor(kind: AttractorKind, pos: Vec2, radius: number): Attractor {
  return { kind, pos: { x: pos.x, y: pos.y }, radius };
}

// A tree is a solid circular trunk (Obstacle) PLUS a restful shade canopy
// (Attractor) at the same position but with larger radius (§9.3).
export function createTree(pos: Vec2): { obstacle: Obstacle; shade: Attractor } {
  return {
    obstacle: createObstacle("tree", pos, config.attractor.trunkRadius),
    shade: createAttractor("shade", pos, config.attractor.shadeRadius),
  };
}
