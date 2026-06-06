import type { Sheep } from "../entities/Sheep.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";

// Each sheep's fear is the strongest in-range stress (intensity x proximity) or
// the previous fear shed by `decay` this frame, whichever is higher. So fear
// spikes on a bark and lingers/decays after the source is gone. Clamped >= 0.
export function fearSystem(sheep: Sheep[], stress: readonly StressSource[], dt: number): void {
  const decay = config.fear.decay;
  for (const s of sheep) {
    let target = 0;
    for (const src of stress) {
      const dx = s.pos.x - src.pos.x;
      const dy = s.pos.y - src.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < src.radius) {
        const f = (src.intensity * (src.radius - d)) / src.radius;
        if (f > target) target = f;
      }
    }
    let decayed = s.drives.fear - decay * dt;
    if (decayed < 0) decayed = 0;
    s.drives.fear = target > decayed ? target : decayed;
  }
}
