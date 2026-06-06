import { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import { createGrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { Attractor } from "../entities/Attractor.js";
import type { Pen } from "./Pen.js";
import type { Dog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { StressSource } from "../scare/StressSource.js";
import type { Rng } from "@getback/math";
import { makeRng } from "@getback/math";
import type { GameSignals } from "./signals.js";
import { createSignals } from "./signals.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface World {
  sheep: Sheep[];
  bounds: Rect; // reserved: boundary containment / bounds-avoidance steering arrives in a later plan
  grass: GrassField;
  obstacles: Obstacle[];
  attractors: Attractor[];
  pen: Pen | null;
  dog: Dog | null;
  stress: StressSource[];
  grid: UniformGrid<Sheep>;
  rng: Rng;
  signals: GameSignals;
}

function defaultGrass(): GrassField {
  const cs = config.grass.cellSize;
  return createGrassField({
    cols: Math.ceil(config.bounds.w / cs),
    rows: Math.ceil(config.bounds.h / cs),
    cellSize: cs,
    regrowRate: config.grass.regrowRate,
    depleteRate: config.grass.depleteRate,
    initial: config.grass.initial,
  });
}

export function createWorld(
  sheep: Sheep[] = [],
  grass: GrassField = defaultGrass(),
  obstacles: Obstacle[] = [],
  pen: Pen | null = null,
  dog: Dog | null = null,
  rng: Rng = makeRng(1),
  attractors: Attractor[] = [],
): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grass,
    obstacles,
    attractors,
    pen,
    dog,
    stress: [],
    grid: new UniformGrid<Sheep>(config.flock.perception),
    rng,
    signals: createSignals(),
  };
}
