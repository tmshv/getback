import { createWorld, createDog, config } from "@getback/motor";
import { makeRng } from "@getback/math";
import type { World } from "@getback/motor";

// Builds a dog-only scenario: no sheep, no pen. Used to tune movement feel,
// sprint responsiveness, bark FX, and stamina drain/regen without the
// complexity of herding. The HUD flock counter auto-hides (spec §13.3).
export function buildWorld(seed: number): World {
  const rng = makeRng(seed);
  const b = config.bounds;
  const dog = createDog({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  return createWorld([], undefined, [], null, dog, rng);
}
