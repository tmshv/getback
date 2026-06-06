import type { Direction } from "@getback/motor";

// ---------------------------------------------------------------------------
// §4.2 Atlas frame layout — the single source of truth.
// 6 columns × 9 rows. Each cell is one sprite frame keyed by name.
// Left-facing sprites are NOT stored; *_side_* is mirrored at render time.
// An empty string means the slot is intentionally blank (row 8, col 5).
// ---------------------------------------------------------------------------

export const FRAME_GRID: readonly (readonly string[])[] = [
  // Row 0: corgi (dog) — down
  ["corgi_down_idle", "corgi_down_walk0", "corgi_down_walk1", "corgi_down_walk2", "corgi_down_walk3", "corgi_down_bark"],
  // Row 1: corgi (dog) — up
  ["corgi_up_idle",   "corgi_up_walk0",   "corgi_up_walk1",   "corgi_up_walk2",   "corgi_up_walk3",   "corgi_up_bark"],
  // Row 2: corgi (dog) — side (right-facing; flip for left)
  ["corgi_side_idle", "corgi_side_walk0", "corgi_side_walk1", "corgi_side_walk2", "corgi_side_walk3", "corgi_side_bark"],
  // Row 3: sheep — down
  ["sheep_down_idle", "sheep_down_walk0", "sheep_down_walk1", "sheep_down_walk2", "sheep_down_walk3", "sheep_down_graze"],
  // Row 4: sheep — up
  ["sheep_up_idle",   "sheep_up_walk0",   "sheep_up_walk1",   "sheep_up_walk2",   "sheep_up_walk3",   "sheep_up_graze"],
  // Row 5: sheep — side (right-facing; flip for left)
  ["sheep_side_idle", "sheep_side_walk0", "sheep_side_walk1", "sheep_side_walk2", "sheep_side_walk3", "sheep_side_graze"],
  // Row 6: terrain tiles
  ["grass_lush",  "grass_med", "grass_grazed", "dirt",       "water",      "water_edge"],
  // Row 7: props / obstacles
  ["tree",        "boulder",   "rock",         "fence_post", "fence_rail", "gate_post"],
  // Row 8: FX + shadow (col 5 is empty)
  ["bone",        "bark_ring", "dust",         "shadow",     "sparkle",    ""],
] as const;

/** Flat array of every non-empty frame name. Used to validate atlas output. */
export const FRAME_NAMES: string[] = FRAME_GRID.flatMap(row =>
  row.filter(name => name !== ""),
);

// ---------------------------------------------------------------------------
// Entity kinds that the render layer distinguishes
// ---------------------------------------------------------------------------
export type EntityKind = "dog" | "sheep";

// Animation states the render layer passes in.
// walk0..3 are the walk cycle frames; idle/bark/graze are hold states.
export type AnimState =
  | "idle"
  | "walk0" | "walk1" | "walk2" | "walk3"
  | "bark"
  | "graze";

// ---------------------------------------------------------------------------
// frameName: resolve (kind, state, facing) → atlas frame name
//
// Horizontal facing ("left" | "right") both resolve to the *_side_* row.
// The caller uses frameFlipX() to decide whether to mirror the sprite.
// ---------------------------------------------------------------------------
export function frameName(
  kind: EntityKind,
  state: AnimState,
  facing: Direction,
): string {
  const prefix = kind === "dog" ? "corgi" : "sheep";

  // Map facing to the row's direction token
  const dirToken = facing === "up"   ? "up"
                 : facing === "down" ? "down"
                 :                    "side"; // left or right → side row

  // Map state to the column's suffix token
  const stateToken = state; // "idle" | "walk0" .. "walk3" | "bark" | "graze"

  return `${prefix}_${dirToken}_${stateToken}`;
}

// ---------------------------------------------------------------------------
// frameFlipX: should the sprite be mirrored horizontally?
// Only left-facing uses the flipped side sprite.
// ---------------------------------------------------------------------------
export function frameFlipX(facing: Direction): boolean {
  return facing === "left";
}
