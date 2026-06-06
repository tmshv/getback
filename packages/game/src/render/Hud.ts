import type { ActiveBuff } from "@getback/motor";

// ── Colours (0xRRGGBB) ───────────────────────────────────────────────────────
const COLOR_GREEN = 0x55cc44;
const COLOR_AMBER = 0xddaa22;
const COLOR_RED   = 0xdd3322;
const THRESH_HIGH = 0.6;
const THRESH_LOW  = 0.2;

/**
 * Bar fill colour for a stamina ratio in [0, 1].
 * green → amber → red as stamina falls.
 */
export function staminaColor(ratio: number): number {
  if (ratio >= THRESH_HIGH) return COLOR_GREEN;
  if (ratio >= THRESH_LOW)  return COLOR_AMBER;
  return COLOR_RED;
}

/**
 * Returns true when the bar should render at reduced opacity —
 * i.e. the dog cannot bark (stamina < barkCost) or cannot sprint (stamina = 0).
 */
export function staminaDimmed(stamina: number, barkCost: number, max: number): boolean {
  void max; // kept for callers that pass it for clarity
  return stamina < barkCost;
}

export type PipState = "filled" | "empty";

/**
 * Array of pip states representing the flock counter.
 * Index 0 is the first pip (leftmost); penned pips come first.
 */
export function pipStates(penned: number, total: number): PipState[] {
  const states: PipState[] = [];
  for (let i = 0; i < total; i++) {
    states.push(i < penned ? "filled" : "empty");
  }
  return states;
}

export interface BuffDisplayData {
  kind:     "zoomies" | "megabark" | "calm";
  progress: number; // timeLeft / totalDuration, clamped [0, 1]
}

/**
 * Derive what the buff indicator should display.
 * Returns null when no buff is active.
 * `totalDuration` defaults to 1 (caller should pass config.buffs[kind].duration).
 */
export function buffDisplay(
  activeBuff: ActiveBuff | null,
  totalDuration = 1,
): BuffDisplayData | null {
  if (!activeBuff) return null;
  const raw = activeBuff.timeLeft / totalDuration;
  const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return { kind: activeBuff.kind, progress };
}

export interface HudOverride {
  stamina?:      boolean;
  flockCounter?: boolean;
}

export interface HudVisibility {
  stamina:      boolean;
  flockCounter: boolean;
}

/** Compute which HUD elements to render, based on world state + optional overrides. */
export function hudVisibility(
  world: { pen: unknown | null },
  override: HudOverride,
): HudVisibility {
  const autoFlockCounter = world.pen !== null;
  return {
    stamina:      override.stamina      ?? true,
    flockCounter: override.flockCounter ?? autoFlockCounter,
  };
}
