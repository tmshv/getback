import {
  createWorld,
  createDog,
  createSheep,
  rollSheepTraits,
  generatePen,
  buildPen,
  penContains,
  config,
} from "@getback/motor";
import { makeRng } from "@getback/math";
import type { World } from "@getback/motor";

// Builds a minimal herding scenario: one sheep, a dog at centre, and a small
// randomly-generated pen. The sheep starts scattered outside the pen. The
// caller passes a seed for determinism (headless tests) or Date.now() for
// variety in the browser.
export function buildWorld(seed: number): World {
  const rng = makeRng(seed);
  const b = config.bounds;
  const margin = 30;

  // pen: small, near the bottom-right quadrant so the sheep has room to roam
  const penCenter = {
    x: rng.range(b.x + b.w * 0.55, b.x + b.w - config.pen.rMax - margin),
    y: rng.range(b.y + b.h * 0.55, b.y + b.h - config.pen.rMax - margin),
  };
  const shape = generatePen(rng, {
    center: penCenter,
    rMin: config.pen.rMin,
    rMax: config.pen.rMax,
    minVerts: config.pen.minVerts,
    maxVerts: config.pen.maxVerts,
    minGateWidth: config.pen.minGateWidth,
  });
  const pen = buildPen(shape.outline, shape.gateEdge);

  // sheep: scatter in the top-left half, outside the pen
  let sheepPos = { x: rng.range(b.x + margin, b.x + b.w * 0.45), y: rng.range(b.y + margin, b.y + b.h * 0.45) };
  for (let tries = 0; tries < 20 && penContains(pen, sheepPos); tries++) {
    sheepPos = { x: rng.range(b.x + margin, b.x + b.w - margin), y: rng.range(b.y + margin, b.y + b.h - margin) };
  }
  const traits = rollSheepTraits(rng);
  const sheep = createSheep(sheepPos, traits);

  // dog: centre of the pasture
  const dog = createDog({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  return createWorld([sheep], undefined, [], pen, dog, rng);
}
