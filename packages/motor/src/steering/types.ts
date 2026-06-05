import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";

export type Status = "fired" | "skipped";

// Read-only world refs a behavior may need. Grows in later plans (grass, pen, …).
export interface SteerContext {
  neighbors: readonly Mobile[];
  dt: number;
}

// A node WRITES its resulting steering force into `out` (overwrites, not adds)
// and returns whether it produced a force ("fired") or opted out ("skipped").
export interface BehaviorNode {
  run(e: Mobile, ctx: SteerContext, out: Vec2): Status;
}

export type Predicate = (e: Mobile, ctx: SteerContext) => boolean;
