import type { Vec2 } from "@getback/math";

export type Direction = "down" | "up" | "left" | "right";

// What a sheep is currently trying to do about its drives. Chosen with hysteresis
// (see classifyGoal): a sheep keeps foraging until the drive is sated, so it does
// not flap on and off at the threshold. Idle = content, stands still.
export type SheepGoal = "idle" | "graze" | "drink";

// Optional per-frame debug side-channel, written by the steering layer and read
// by the render-side debug overlay. Ignored by the simulation itself.
//   fired: behavior-tree branch labels that fired this frame (see ai/debug.ts)
//   force: snapshot of the steering force BEFORE MovementSystem zeroes it
export interface EntityDebug {
  fired: string[];
  force: Vec2;
}

// Kinematic core shared by every mobile entity (sheep, and later the dog).
// `force` is a per-frame steering accumulator, zeroed after integration.
export interface Mobile {
  pos: Vec2;
  vel: Vec2;
  force: Vec2;
  radius: number;
  maxSpeed: number;
  maxForce: number;
  facing: Direction;
  prevPos?: Vec2; // position at the START of the current frame; set by MovementSystem, read by FenceCollisionSystem
  debug?: EntityDebug; // optional; present only when debug instrumentation is wanted
}

// Abstract player input the motor consumes (the app maps keys -> this). Unused
// until the dog arrives (later plan) but defined here as the motor's input contract.
export interface DogIntent {
  moveDir: Vec2; // normalized 8-way; {0,0} = stand
  sprint: boolean;
  bark: boolean;
}
