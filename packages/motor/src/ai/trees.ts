import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { separation, cohesion, follow } from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root behavior tree: a prioritized blend of the social forces.
// Built per-sheep so each animal's traits (personalSpace, sociability) bake in.
export function buildFlockTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  return blend([
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
  ]);
}
