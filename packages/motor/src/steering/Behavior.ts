import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import type { BehaviorNode, SteerContext, Status } from "./types.js";

export interface WeightedChild {
  node: BehaviorNode;
  weight: number;
}

// The `combine()` of the design: walk children in priority order, add
// `childForce * weight` while tracking the remaining maxForce budget, and stop
// once it is spent — so high-priority children are never starved by low ones.
// Writes the combined force into `out`. Always "fired".
export function blend(children: WeightedChild[]): BehaviorNode {
  const scratch: Vec2 = { x: 0, y: 0 };
  return {
    run(e: Mobile, ctx: SteerContext, out: Vec2): Status {
      out.x = 0;
      out.y = 0;
      let budget = e.maxForce;
      for (const child of children) {
        if (budget <= 0) break;
        if (child.node.run(e, ctx, scratch) === "skipped") continue;
        let fx = scratch.x * child.weight;
        let fy = scratch.y * child.weight;
        let mag = Math.hypot(fx, fy);
        if (mag === 0) continue;
        if (mag > budget) {
          const s = budget / mag;
          fx *= s;
          fy *= s;
          mag = budget;
        }
        out.x += fx;
        out.y += fy;
        budget -= mag;
      }
      return "fired";
    },
  };
}
