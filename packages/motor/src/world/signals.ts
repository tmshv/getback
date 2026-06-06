import { Signal } from "@getback/signal";
import type { Vec2 } from "@getback/math";

// Game-level events emitted by systems; consumed by HUD, FX, and audio.
export interface GameSignals {
  penFilled:      Signal<void>;
  sheepPenned:    Signal<void>;
  treatCollected: Signal<Vec2>;  // position of collected treat (for FX placement)
  barked:         Signal<Vec2>;  // bark origin
  ambientScare:   Signal<void>;
}

export function createSignals(): GameSignals {
  return {
    penFilled:      new Signal<void>(),
    sheepPenned:    new Signal<void>(),
    treatCollected: new Signal<Vec2>(),
    barked:         new Signal<Vec2>(),
    ambientScare:   new Signal<void>(),
  };
}
