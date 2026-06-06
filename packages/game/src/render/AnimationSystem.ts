import { frameName, frameFlipX } from "../atlas/frames.js";
import type { EntityKind, AnimState } from "../atlas/frames.js";
import type { Direction } from "@getback/motor";
import { FRAME_DURATION } from "../config.js";

export interface AnimInput {
  kind:    EntityKind;
  moving:  boolean;
  penned:  boolean;   // reserved: penned sheep can have a calm idle later
  barking: boolean;
  grazing: boolean;
  facing:  Direction;
  timer:   number;    // accumulated seconds owned by caller
  dt:      number;
}

export interface AnimOutput {
  frame: string;
  flipX: boolean;
}

const WALK_FRAMES = 4;

/** Pure — no Pixi, no side effects. */
export function selectFrame(input: AnimInput): AnimOutput {
  const { kind, moving, barking, grazing, facing, timer } = input;

  let state: AnimState;

  if (kind === "dog" && barking) {
    state = "bark";
  } else if (moving) {
    const idx = Math.floor(timer / FRAME_DURATION.WALK) % WALK_FRAMES;
    state = `walk${idx}` as AnimState;
  } else if (kind === "sheep" && grazing) {
    state = "graze";
  } else {
    state = "idle";
  }

  return {
    frame: frameName(kind, state, facing),
    flipX: frameFlipX(facing),
  };
}
