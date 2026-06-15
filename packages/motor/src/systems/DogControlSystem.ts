import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import { config } from "../config.js";

// intentFollow: steer the dog toward the desired (sprint-scaled) velocity, or
// actively brake when there is no input so control feels tight. Writes dog.force,
// which MovementSystem then integrates (and clamps to maxForce/maxSpeed).
export function dogControlSystem(dog: Dog, intent: DogIntent, dt: number): void {
  // Zoomies raises the dog's effective top speed. We scale dog.maxSpeed itself so
  // MovementSystem's velocity clamp (which uses dog.maxSpeed) permits the higher
  // speed; the base is restored from config when the buff is inactive.
  const zoomies = dog.activeBuff?.kind === "zoomies";
  const zoomiesMult = zoomies ? config.buffs.zoomies.mult : 1;
  dog.maxSpeed = config.dog.maxSpeed * zoomiesMult;

  const dir = intent.moveDir;
  const mag = Math.hypot(dir.x, dir.y);
  if (mag < 1e-6) {
    // Brake = -vel*gain integrated as vel += force*dt => vel *= (1 - gain*dt).
    // If gain*dt > 1 (high stopGain at the dt clamp ceiling) the velocity
    // overshoots past zero and flips sign every frame, ringing the facing
    // left/right ("<><>"). Cap the effective gain at 1/dt so the brake is
    // critically damped: it removes at most 100% of velocity per frame, snapping
    // to a clean stop instead of oscillating.
    const g = Math.min(config.dog.stopGain, 1 / dt);
    dog.force.x = -dog.vel.x * g;
    dog.force.y = -dog.vel.y * g;
    return;
  }
  // "moving" is already guaranteed here by the stop-branch early return above, so
  // this predicate matches StaminaSystem's `intent.sprint && moving && stamina>0`.
  const sprinting = intent.sprint && dog.stamina > 0;
  const speed = dog.maxSpeed * (sprinting ? config.dog.sprintMult : 1);
  const g = config.dog.accelGain;
  dog.force.x = ((dir.x / mag) * speed - dog.vel.x) * g;
  dog.force.y = ((dir.y / mag) * speed - dog.vel.y) * g;
}
