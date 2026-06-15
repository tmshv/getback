import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { selector, conditional, tag, tagIfForce } from "../steering/combinators.js";
import {
  separation, cohesion, follow, graze, obstacleAvoid, fleeStress,
  penInterior, isPenned, drink, rest, thirstIsTop, hungerIsTop,
} from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root behavior tree (§2.2 / §8.2).
//
// Root: selector([
//   conditional(isPenned, pennedBlend),   <- from Plan 12, unchanged
//   flockingBlend,
// ])
//
// flockingBlend contains a GOAL sub-selector in place of the old single graze:
//   selector([
//     conditional(thirstIsTop, drink),    <- highest drive wins
//     conditional(hungerIsTop, graze),
//     rest,                               <- idle default: loiter at shade
//   ])
//
// Built per-sheep so traits bake in. Trees are stateless and shareable.
export function buildSheepTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  const slowR = config.attractor.shadeRadius;

  // Goal cascade: pick the dominant drive or default to rest at shade.
  // Each goal leaf is tagged so the debug overlay can name the active mode.
  const goalNode = selector([
    conditional(thirstIsTop, tag("drink", drink(config.attractor.waterRadius))),
    conditional(hungerIsTop, tag("graze", graze())),
    tag("rest", rest(slowR)),
  ]);

  const flocking = blend([
    { node: tagIfForce("flee", fleeStress()),                       weight: config.flee.weight },
    { node: obstacleAvoid(config.obstacleAvoid.avoidRadius),        weight: config.obstacleAvoid.weight },
    { node: goalNode,                                                weight: config.graze.weight },
    { node: separation(traits.personalSpace),                        weight: w.separation },
    { node: cohesion(config.flock.cohesionK, config.flock.cohesionComfort, config.flock.cohesionRamp), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold),                     weight: w.follow * traits.sociability },
  ]);

  const pennedBlend = blend([
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: penInterior(config.pen.settleRadius), weight: config.pen.settleWeight },
  ]);

  return selector([
    tag("penned", conditional(isPenned, pennedBlend)),
    flocking,
  ]);
}
