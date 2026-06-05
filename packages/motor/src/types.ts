import type { Vec2 } from "@getback/math";

export type Direction = "down" | "up" | "left" | "right";

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
}

// Abstract player input the motor consumes (the app maps keys -> this). Unused
// until the dog arrives (later plan) but defined here as the motor's input contract.
export interface DogIntent {
  moveDir: Vec2; // normalized 8-way; {0,0} = stand
  sprint: boolean;
  bark: boolean;
}
