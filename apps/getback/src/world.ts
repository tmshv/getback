import {
  createWorld,
  createDog,
  createSheep,
  rollSheepTraits,
  createObstacle,
  createTree,
  createAttractor,
  generatePen,
  buildPen,
  config,
} from "@getback/motor";
import { makeRng } from "@getback/math";
import type { World, Obstacle, Attractor } from "@getback/motor";

const FLOCK_SIZE = 8;
const { w, h } = config.bounds;

/**
 * Build the full GetBack game scenario: dog at center, a varied flock of
 * sheep, trees (trunk + shade), rocks, a water hole, and a randomly generated
 * pen. Pure — no Pixi, no DOM.
 */
export function buildGameWorld(seed: number): World {
  const rng = makeRng(seed);

  // Dog starts at the center of the pasture.
  const dog = createDog({ x: w / 2, y: h / 2 });

  // Flock: scatter sheep away from the center so they don't overlap the dog.
  // Traits are rolled per sheep so the herd never moves mechanically.
  const sheep = Array.from({ length: FLOCK_SIZE }, (_, i) => {
    const angle = (i / FLOCK_SIZE) * Math.PI * 2;
    const r = rng.range(40, 80);
    return createSheep(
      { x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r },
      rollSheepTraits(rng),
    );
  });

  // Trees give solid trunks + restful shade; rocks are plain obstacles.
  const treeA = createTree({ x: 80, y: 60 });
  const treeB = createTree({ x: 390, y: 200 });
  const obstacles: Obstacle[] = [
    treeA.obstacle,
    treeB.obstacle,
    createObstacle("rock", { x: 300, y: 60 }, 7),
    createObstacle("rock", { x: 100, y: 190 }, 7),
  ];

  // A real water hole (sheep enter it to drink — not an obstacle).
  const water = createAttractor("water", { x: 240, y: 215 }, 16);
  const attractors: Attractor[] = [water, treeA.shade, treeB.shade];

  // Pen: random polygon in the right third so the dog can herd toward it.
  const penCenter = {
    x: rng.range(300, 400),
    y: rng.range(90, 170),
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

  return createWorld(sheep, undefined, obstacles, pen, dog, rng, attractors);
}
