import type { Vec2 } from "@getback/math";

// Coarse grass-density grid. density[row*cols + col] in [0,1].
export interface GrassField {
  cols: number;
  rows: number;
  cellSize: number;
  density: Float32Array;
  regrowRate: number;
  depleteRate: number;
}

export interface GrassFieldOptions {
  cols: number;
  rows: number;
  cellSize: number;
  regrowRate: number;
  depleteRate: number;
  initial?: number;
}

export function createGrassField(opts: GrassFieldOptions): GrassField {
  const density = new Float32Array(opts.cols * opts.rows);
  density.fill(opts.initial ?? 1);
  return {
    cols: opts.cols,
    rows: opts.rows,
    cellSize: opts.cellSize,
    density,
    regrowRate: opts.regrowRate,
    depleteRate: opts.depleteRate,
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
