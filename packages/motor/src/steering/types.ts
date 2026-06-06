import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import type { GrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { StressSource } from "../scare/StressSource.js";
import type { Attractor } from "../entities/Attractor.js";

export type Status = "fired" | "skipped";

// Read-only world refs a behavior may need. Grows in later plans (grass, pen, …).
export interface SteerContext {
  neighbors: readonly Mobile[];
  grass: GrassField;
  obstacles: readonly Obstacle[];
  stress: readonly StressSource[];
  fear: number; // the steering sheep's own fear drive [0..1]
  dt: number;
  penned?: boolean; // true while this sheep is inside the pen (settle, don't graze out)
  penCentroid?: Vec2 | null; // the pen's centre to settle toward (absent/null if no pen)
  water?: Attractor | null;  // nearest/only water attractor, if any; read by drink leaf
  shade?: Attractor | null;  // nearest/only shade attractor, if any; read by rest leaf
}

// A node WRITES its resulting steering force into `out` (overwrites, not adds)
// and returns whether it produced a force ("fired") or opted out ("skipped").
export interface BehaviorNode {
  run(e: Mobile, ctx: SteerContext, out: Vec2): Status;
}

export type Predicate = (e: Mobile, ctx: SteerContext) => boolean;
