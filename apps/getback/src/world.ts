import {
  createWorld,
  createDog,
  createSheep,
  defaultSheepTraits,
  createObstacle,
  generatePen,
  buildPen,
  config,
} from "@getback/motor";
import { makeRng } from "@getback/math";
import type { World } from "@getback/motor";

const FLOCK_SIZE = 8;
const { w, h } = config.bounds;

/**
 * Build the full GetBack game scenario: dog at center, a random flock of sheep,
 * static obstacles, and a randomly generated pen. Pure — no Pixi, no DOM.
 */
export function buildGameWorld(seed: number): World {
  const rng = makeRng(seed);

  // Dog starts at the center of the pasture.
  const dog = createDog({ x: w / 2, y: h / 2 });

  // Flock: scatter sheep away from the center so they don't overlap the dog.
  const sheep = Array.from({ length: FLOCK_SIZE }, (_, i) => {
    const angle = (i / FLOCK_SIZE) * Math.PI * 2;
    const r = rng.range(40, 80);
    const s = createSheep(
      { x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r },
      defaultSheepTraits(),
    );
    return s;
  });

  // Static obstacles: 2 trees + 2 rocks + 1 water-hole (modelled as rock).
  const obstacles = [
    createObstacle("tree",  { x: 80,  y: 60  }, 10),
    createObstacle("tree",  { x: 390, y: 200 }, 10),
    createObstacle("rock",  { x: 300, y: 60  }, 7),
    createObstacle("rock",  { x: 100, y: 190 }, 7),
    createObstacle("rock",  { x: 240, y: 210 }, 14), // water hole — larger radius
  ];

  // Pen: random polygon in the lower-right quadrant so the dog can herd toward it.
  const penCenter = {
    x: rng.range(280, 400),
    y: rng.range(150, 220),
  };
  const penShape = generatePen(rng, {
    center:       penCenter,
    rMin:         config.pen.rMin,
    rMax:         config.pen.rMax,
    minVerts:     config.pen.minVerts,
    maxVerts:     config.pen.maxVerts,
    minGateWidth: config.pen.minGateWidth,
  });
  const pen = buildPen(penShape.outline, penShape.gateEdge);

  return createWorld(sheep, undefined, obstacles, pen, dog, rng);
}
