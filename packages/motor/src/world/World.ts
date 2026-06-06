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
import { AgentPool } from "./Pool.js";
import { Emitter, rectGeometry } from "./Emitter.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";
import type { Treat } from "../entities/Treat.js";
import { createTreat } from "../entities/Treat.js";
import type { AmbientScareState } from "../systems/AmbientScareSystem.js";
import { createAmbientScareState } from "../systems/AmbientScareSystem.js";

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
  sheepPool: AgentPool<Sheep> | null;
  sheepEmitter: Emitter | null;
  treats:       Treat[];
  treatPool:    AgentPool<Treat>;
  treatEmitter: Emitter;
  ambientScareState: AmbientScareState;
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
    sheepPool: null,
    sheepEmitter: null,
    treats:       [],
    treatPool:    new AgentPool<Treat>({
      create: () => createTreat({ x: 0, y: 0 }),
      reset:  () => {},  // position set by Game.ts after acquire
    }),
    treatEmitter: new Emitter({
      geometry: rectGeometry({
        x: config.bounds.x + 10,
        y: config.bounds.y + 10,
        w: config.bounds.w - 20,
        h: config.bounds.h - 20,
      }),
      period: config.treats.periodMin,  // starting period; Game re-uses update(dt)
      amount: 1,
      max:    config.treats.max,
      rng,
    }),
    ambientScareState: createAmbientScareState(rng),
  };
}

/** Build the sheep AgentPool with the standard create/reset pair. */
export function createSheepPool(): AgentPool<import("../entities/Sheep.js").Sheep> {
  return new AgentPool({
    create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
    reset: (s) => resetSheep(s, { x: 0, y: 0 }),
  });
}

/** Build the sheep Emitter pointed at the full pasture inset. */
export function createSheepEmitter(rng: import("@getback/math").Rng): Emitter {
  const b = config.bounds;
  const i = config.spawn.areaInset;
  return new Emitter({
    geometry: rectGeometry({ x: b.x + i, y: b.y + i, w: b.w - i * 2, h: b.h - i * 2 }),
    period: config.spawn.period,
    amount: config.spawn.flockSize,
    max: config.spawn.flockSize,
    rng,
  });
}
