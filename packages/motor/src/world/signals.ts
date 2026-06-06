import { Signal } from "@getback/signal";

// Game-level events systems emit and the app (HUD/FX/audio) subscribes to.
// Grows as more events land (barked, sheepPenned, ...).
export interface GameSignals {
  penFilled: Signal<void>;
}

export function createSignals(): GameSignals {
  return { penFilled: new Signal<void>() };
}
