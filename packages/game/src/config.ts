// Render-side constants for @getback/game.
// Motor config lives in @getback/motor/src/config.ts — keep them separate.

export const LOGICAL_W = 480;
export const LOGICAL_H = 270;

// Renderer device-pixel resolution: crisp on hi-DPI screens, capped at 2× to
// avoid over-rendering on 3×+ displays. Guarded so it's safe to import in
// non-browser (test) environments where `window` is undefined.
export const RESOLUTION =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

// Layer z-order indices (assigned to Container.zIndex on the stage)
export const LAYER = {
  TERRAIN: 0,
  PROPS:   1,
  ENTITIES: 2,   // depth-sorted by entity y within this container
  FX:      3,
  DEBUG:   4,    // gizmos: above the art, below the HUD
  HUD:     5,
} as const;

// Frame durations in seconds
export const FRAME_DURATION = {
  WALK: 0.12,   // seconds per walk frame (4-frame cycle → ~8 fps at normal walk)
  IDLE: 0,      // static — no cycling
} as const;

// Display scale for native-resolution atlas frames: the source art is 480×320
// per sheet cell while the world is 480×270 logical px, so sprites are scaled
// down 16× at draw time (smooth GPU filtering — the art itself ships
// unmodified at full quality).
export const SPRITE_SCALE = 1 / 16;

// Shadow
export const SHADOW_OFFSET_Y = 4;   // px below entity anchor
export const SHADOW_SCALE_X  = 1.0;
export const SHADOW_SCALE_Y  = 0.5;

// Grass density thresholds (density in [0..1])
export const GRASS_THRESHOLD = {
  LUSH:   0.75,
  MED:    0.40,
  GRAZED: 0.10,
  // below 0.10 → dirt
} as const;

// Debug overlay (backtick-toggled schematic view of the simulation).
export const DEBUG = {
  TOGGLE_KEY:     "Backquote", // KeyboardEvent.code for the ` key
  VELOCITY_SCALE: 0.25,        // ≈ look-ahead seconds for the velocity vector
  FORCE_SCALE:    0.05,        // steering force is larger; scale it down more
  FONT_SIZE:      5,
  LINE_WIDTH:     0.5,
  COLORS: {
    box:        0x00ff66, // collision circle
    velocity:   0x33ccff, // current velocity
    force:      0xff5544, // steering force (snapshot)
    facing:     0xffee00, // facing tick
    perception: 0x4466ff, // sheep perception ring
    personal:   0xaa55ff, // sheep personal-space ring
    neighbor:   0x55ff55, // flock neighbor links
    world:      0xffaa22, // obstacles / attractors / pen
    text:       0xffffff, // labels
  },
} as const;
