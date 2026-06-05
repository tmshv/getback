import type { Vec2 } from "@getback/math";

export type ObstacleKind = "tree" | "rock";

// A solid point obstacle, modelled as a circle.
export interface Obstacle {
  kind: ObstacleKind;
  pos: Vec2;
  radius: number;
}

export function createObstacle(kind: ObstacleKind, pos: Vec2, radius: number): Obstacle {
  return { kind, pos: { x: pos.x, y: pos.y }, radius };
}
