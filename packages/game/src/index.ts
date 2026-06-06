// @getback/game public surface.
export { mount } from "./Runner.js";
export type { MountOptions } from "./Runner.js";
export { computeLetterbox } from "./render/letterbox.js";
export type { LetterboxResult } from "./render/letterbox.js";
export { selectFrame } from "./render/AnimationSystem.js";
export type { AnimInput, AnimOutput } from "./render/AnimationSystem.js";
export { densityToFrame } from "./render/GrassRenderer.js";
export { frameName, frameFlipX, FRAME_GRID, FRAME_NAMES } from "./atlas/frames.js";
export type { EntityKind, AnimState } from "./atlas/frames.js";
export * from "./config.js";
export type { HudOverride } from "./render/Hud.js";
export { intentFromKeys, createEdgeTrigger, attachKeyboard } from "./input/keyboard.js";
export { runScenario } from "./runScenario.js";
