import type { Vec2 } from "@getback/math";

export type StressKind = "presence" | "bark";

// A circular scare field. `flee` repels sheep within `radius`, scaled by
// `intensity` and proximity.
export interface StressSource {
  kind: StressKind;
  pos: Vec2;
  radius: number;
  intensity: number; // [0..1]
}
