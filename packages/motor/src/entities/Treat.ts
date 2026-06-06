import type { Vec2 } from "@getback/math";
import { config } from "../config.js";

export interface Treat {
  pos: Vec2;
  radius: number;
}

export function createTreat(pos: Vec2): Treat {
  return { pos: { x: pos.x, y: pos.y }, radius: config.treats.radius };
}
