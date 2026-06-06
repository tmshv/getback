import type { Rng } from "@getback/math";
import type { StressSource } from "../scare/StressSource.js";
import type { GameSignals } from "../world/signals.js";
import { config } from "../config.js";

export interface AmbientScareState {
  rng:   Rng;
  timer: number; // seconds until next scare
}

export function createAmbientScareState(rng: Rng): AmbientScareState {
  return {
    rng,
    timer: rng.range(config.ambient.intervalMin, config.ambient.intervalMax),
  };
}

// Tick the ambient scare timer. When it fires, push a pasture-covering
// StressSource into `stress` (it will be processed by FearSystem this frame),
// emit `signals.ambientScare`, and reschedule.
export function ambientScareSystem(
  state:   AmbientScareState,
  stress:  StressSource[],
  dt:      number,
  signals: GameSignals,
): void {
  state.timer -= dt;
  if (state.timer > 0) return;

  state.timer = state.rng.range(config.ambient.intervalMin, config.ambient.intervalMax);

  // The pasture is 480×270; place the source at its centre with a radius that
  // covers the diagonal (config.ambient.radius is 9999 by default).
  stress.push({
    kind:      "ambient",
    pos:       { x: config.bounds.x + config.bounds.w / 2, y: config.bounds.y + config.bounds.h / 2 },
    radius:    config.ambient.radius,
    intensity: config.ambient.intensity,
  });

  signals.ambientScare.emit();
}
