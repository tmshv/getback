import type { Vec2, Rng } from "@getback/math";

// Coarse grass-density grid. density[row*cols + col] in [0,1].
export interface GrassField {
  cols: number;
  rows: number;
  cellSize: number;
  density: Float32Array;
  regrowRate: number;
  // Per-second graze-down rate. `depleteRate` is the uniform fallback; when the
  // field is built with a range + rng, `cellDepleteRate` holds an independent
  // random rate per cell (so some patches are tougher to graze than others).
  depleteRate: number;
  cellDepleteRate?: Float32Array;
}

export interface GrassFieldOptions {
  cols: number;
  rows: number;
  cellSize: number;
  regrowRate: number;
  // Uniform deplete rate, OR the LOWER bound when `depleteRateMax` + `rng` are
  // given (then each cell draws its own rate in [depleteRate, depleteRateMax]).
  depleteRate: number;
  depleteRateMax?: number;
  rng?: Rng;
  initial?: number;
}

export function createGrassField(opts: GrassFieldOptions): GrassField {
  const n = opts.cols * opts.rows;
  const density = new Float32Array(n);
  density.fill(opts.initial ?? 1);
  let cellDepleteRate: Float32Array | undefined;
  if (opts.depleteRateMax !== undefined && opts.rng) {
    cellDepleteRate = new Float32Array(n);
    for (let i = 0; i < n; i++) cellDepleteRate[i] = opts.rng.range(opts.depleteRate, opts.depleteRateMax);
  }
  return {
    cols: opts.cols,
    rows: opts.rows,
    cellSize: opts.cellSize,
    density,
    regrowRate: opts.regrowRate,
    depleteRate: opts.depleteRate,
    cellDepleteRate,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function indexAt(field: GrassField, x: number, y: number): number {
  const cx = clamp(Math.floor(x / field.cellSize), 0, field.cols - 1);
  const cy = clamp(Math.floor(y / field.cellSize), 0, field.rows - 1);
  return cy * field.cols + cx;
}

export function densityAt(field: GrassField, x: number, y: number): number {
  return field.density[indexAt(field, x, y)]!;
}

export function setDensityAt(field: GrassField, x: number, y: number, value: number): void {
  field.density[indexAt(field, x, y)] = clamp(value, 0, 1);
}

// Per-second graze-down rate for the cell at a world position: the cell's own
// randomized rate when present, else the uniform fallback.
export function depleteRateAt(field: GrassField, x: number, y: number): number {
  return field.cellDepleteRate ? field.cellDepleteRate[indexAt(field, x, y)]! : field.depleteRate;
}

export function depleteAt(field: GrassField, x: number, y: number, amount: number): void {
  const i = indexAt(field, x, y);
  field.density[i] = Math.max(0, field.density[i]! - amount);
}

export function regrow(field: GrassField, dt: number): void {
  const add = field.regrowRate * dt;
  const d = field.density;
  for (let i = 0; i < d.length; i++) d[i] = Math.min(1, d[i]! + add);
}

// Central-difference gradient of density at a world position. Points toward
// increasing density (greener pasture). Writes into `out`.
export function gradientAt(field: GrassField, x: number, y: number, out: Vec2): void {
  const h = field.cellSize * 2;
  out.x = densityAt(field, x + h, y) - densityAt(field, x - h, y);
  out.y = densityAt(field, x, y + h) - densityAt(field, x, y - h);
}
