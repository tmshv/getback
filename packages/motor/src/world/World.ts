import { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";
import { config } from "../config.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface World {
  sheep: Sheep[];
  bounds: Rect;
  grid: UniformGrid<Sheep>;
}

export function createWorld(sheep: Sheep[] = []): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grid: new UniformGrid<Sheep>(config.flock.perception),
  };
}
