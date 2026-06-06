import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import { config } from "../config.js";

// intentFollow: steer the dog toward the desired (sprint-scaled) velocity, or
// actively brake when there is no input so control feels tight. Writes dog.force,
// which MovementSystem then integrates (and clamps to maxForce/maxSpeed).
export function dogControlSystem(dog: Dog, intent: DogIntent): void {
  const dir = intent.moveDir;
  const mag = Math.hypot(dir.x, dir.y);
  if (mag < 1e-6) {
    dog.force.x = -dog.vel.x * config.dog.stopGain;
    dog.force.y = -dog.vel.y * config.dog.stopGain;
    return;
  }
  // "moving" is already guaranteed here by the stop-branch early return above, so
  // this predicate matches StaminaSystem's `intent.sprint && moving && stamina>0`.
  const sprinting = intent.sprint && dog.stamina > 0;
  const speed = dog.maxSpeed * (sprinting ? config.dog.sprintMult : 1);
  dog.force.x = (dir.x / mag) * speed - dog.vel.x;
  dog.force.y = (dir.y / mag) * speed - dog.vel.y;
}
