import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { selector, conditional } from "../steering/combinators.js";
import { separation, cohesion, follow, graze, obstacleAvoid, fleeStress, penInterior, isPenned } from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root: a Selector. When penned, the gated `pennedBlend` fires (calm
// settle toward the pen centre, keeping personal space) and the flocking blend is
// skipped. Otherwise the Conditional skips and the full flocking blend runs. Built
// per-sheep so traits bake in.
export function buildSheepTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  const flocking = blend([
    { node: fleeStress(), weight: config.flee.weight },
    { node: obstacleAvoid(config.obstacleAvoid.avoidRadius), weight: config.obstacleAvoid.weight },
    { node: graze(), weight: config.graze.weight },
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
  ]);
  const pennedBlend = blend([
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: penInterior(config.pen.settleRadius), weight: config.pen.settleWeight },
  ]);
  return selector([
    conditional(isPenned, pennedBlend),
    flocking,
  ]);
}
