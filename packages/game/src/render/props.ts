import type { Vec2 } from "@getback/math";
import type { Segment, Obstacle } from "@getback/motor";

// ── Pure placement logic (headless-tested) ──────────────────────────────────

/**
 * Positions for fence posts along the pen's solid fence segments: posts at
 * every segment endpoint plus evenly spaced intermediates so no gap exceeds
 * `spacing`. Shared corners between adjacent segments are emitted once.
 */
export function fencePostPositions(fences: readonly Segment[], spacing: number): Vec2[] {
  const out: Vec2[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const key = `${Math.round(x * 10)},${Math.round(y * 10)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, y });
  };
  for (const seg of fences) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      push(seg.a.x, seg.a.y);
      continue;
    }
    const intervals = Math.max(1, Math.ceil(len / spacing));
    for (let i = 0; i <= intervals; i++) {
      const t = i / intervals;
      push(seg.a.x + dx * t, seg.a.y + dy * t);
    }
  }
  return out;
}

/** Atlas frame for an obstacle: trees are trees; rocks split by size. */
export function obstacleFrame(o: Obstacle): "tree" | "boulder" | "rock" {
  if (o.kind === "tree") return "tree";
  return o.radius >= 10 ? "boulder" : "rock";
}
