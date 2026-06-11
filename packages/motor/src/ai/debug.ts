// Debug-only classification of a sheep's current behaviour, derived from the
// branch labels its tree fired this frame (collected via the `tag` combinator).
// Pure and headless — the render-side overlay reads it; the simulation never does.

export type SheepMode = "penned" | "drink" | "graze" | "rest" | "idle";

export interface SheepModeInfo {
  mode: SheepMode;
  fleeing: boolean;
}

// Reduce the set of fired labels to one display mode plus a fleeing flag.
// Mode priority mirrors the tree: penned overrides the goal cascade, and within
// the goal cascade drink > graze > rest. `flee` is a force blended ON TOP of the
// goal (not a mutually-exclusive branch), so it surfaces as an independent flag.
export function classifySheepMode(fired: readonly string[]): SheepModeInfo {
  const mode: SheepMode =
    fired.includes("penned") ? "penned" :
    fired.includes("drink")  ? "drink"  :
    fired.includes("graze")  ? "graze"  :
    fired.includes("rest")   ? "rest"   :
    "idle";
  return { mode, fleeing: fired.includes("flee") };
}
