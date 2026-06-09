// Render-side constants for @getback/game.
// Motor config lives in @getback/motor/src/config.ts — keep them separate.

export const LOGICAL_W = 480;
export const LOGICAL_H = 270;

// Layer z-order indices (assigned to Container.zIndex on the stage)
export const LAYER = {
  TERRAIN: 0,
  PROPS:   1,
  ENTITIES: 2,   // depth-sorted by entity y within this container
  FX:      3,
  HUD:     4,
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
