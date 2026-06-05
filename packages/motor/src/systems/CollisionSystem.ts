import type { Mobile } from "../types.js";
import type { Obstacle } from "../entities/Obstacle.js";

// Resolve circle-circle penetration between each unit and the static obstacles.
// Push the unit out along the center->center axis, then remove the velocity
// component pointing INTO the obstacle so it slides along the surface instead of
// sticking. Runs after movement.
//
// Static (non-swept) resolution is sufficient: per-frame displacement
// (maxSpeed * dtClampMax) is far smaller than any obstacle radius, so a unit
// cannot skip across an obstacle in one frame, and circle-circle push-out has no
// "which side" ambiguity. Fence segments (which DO need swept CCD) are a later plan.
export function collisionSystem(units: Mobile[], obstacles: Obstacle[]): void {
  for (const u of units) {
    for (const o of obstacles) {
      const dx = u.pos.x - o.pos.x;
      const dy = u.pos.y - o.pos.y;
      const min = u.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d === 0) {
        u.pos.y -= min;
        continue;
      }
      const nx = dx / d;
      const ny = dy / d;
      const push = min - d;
      u.pos.x += nx * push;
      u.pos.y += ny * push;
      const vn = u.vel.x * nx + u.vel.y * ny;
      if (vn < 0) {
        u.vel.x -= vn * nx;
        u.vel.y -= vn * ny;
      }
    }
  }
}
