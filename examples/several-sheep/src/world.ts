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

const SHEEP_COUNT = 5;

// Builds a small flocking scenario: five sheep with varied traits, a dog at
// centre, and a randomly-generated pen. Each sheep is placed outside the pen.
// Shows cohesion, follow, and fear-bunching at small flock scale.
export function buildWorld(seed: number): World {
  const rng = makeRng(seed);
  const b = config.bounds;
  const margin = 30;

  // pen: right-centre of the pasture
  const penCenter = {
    x: rng.range(b.x + b.w * 0.6, b.x + b.w - config.pen.rMax - margin),
    y: rng.range(b.y + config.pen.rMax + margin, b.y + b.h - config.pen.rMax - margin),
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

  // sheep: scatter across the left half, all outside the pen
  const sheep = [];
  for (let i = 0; i < SHEEP_COUNT; i++) {
    let pos = {
      x: rng.range(b.x + margin, b.x + b.w * 0.5),
      y: rng.range(b.y + margin, b.y + b.h - margin),
    };
    for (let tries = 0; tries < 20 && penContains(pen, pos); tries++) {
      pos = {
        x: rng.range(b.x + margin, b.x + b.w - margin),
        y: rng.range(b.y + margin, b.y + b.h - margin),
      };
    }
    sheep.push(createSheep(pos, rollSheepTraits(rng)));
  }

  const dog = createDog({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  return createWorld(sheep, undefined, [], pen, dog, rng);
}
