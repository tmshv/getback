import { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import { createGrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { Pen } from "./Pen.js";
import type { Dog } from "../entities/Dog.js";
import { config } from "../config.js";

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
  pen: Pen | null;
  dog: Dog | null;
  grid: UniformGrid<Sheep>;
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
): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grass,
    obstacles,
    pen,
    dog,
    grid: new UniformGrid<Sheep>(config.flock.perception),
  };
}
