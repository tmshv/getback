import type { Vec2 } from "@getback/math";
import type { Direction } from "./types.js";

const EPS = 1e-4;

// Derive a 4-way facing from velocity. Near-zero velocity keeps the previous
// facing (no flicker when standing still). Vertical wins on ties (>=), so exact
// diagonals resolve to the vertical axis deterministically.
export function directionFromVelocity(vel: Vec2, prev: Direction): Direction {
  if (Math.abs(vel.x) < EPS && Math.abs(vel.y) < EPS) return prev;
  if (Math.abs(vel.y) >= Math.abs(vel.x)) return vel.y > 0 ? "down" : "up";
  return vel.x > 0 ? "right" : "left";
}
