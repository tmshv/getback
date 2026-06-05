import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { separation, cohesion, follow, graze, obstacleAvoid, flee } from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root behavior tree: graze (follow the grass gradient) blended with
// the social forces, in priority order. Built per-sheep so traits bake in.
export function buildSheepTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  return blend([
    { node: flee(), weight: config.flee.weight },
    { node: obstacleAvoid(config.obstacleAvoid.avoidRadius), weight: config.obstacleAvoid.weight },
    { node: graze(), weight: config.graze.weight },
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
  ]);
}
