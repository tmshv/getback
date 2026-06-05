import type { Vec2, Rng } from "@getback/math";

export interface PenShape {
  outline: Vec2[];
  gateEdge: number;
}

export interface PenGenOptions {
  center: Vec2;
  rMin: number;
  rMax: number;
  minVerts: number;
  maxVerts: number;
  minGateWidth: number;
}

// A random simple polygon: pick N vertices at random angles (SORTED) and random
// radii around the center. Angle-sorting guarantees a non-self-intersecting
// (star-shaped) polygon. The gate is the widest edge (wide enough to admit sheep).
export function generatePen(rng: Rng, opts: PenGenOptions): PenShape {
  const n = rng.int(opts.minVerts, opts.maxVerts);
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push(rng.range(-Math.PI, Math.PI));
  angles.sort((a, b) => a - b);
  const outline: Vec2[] = angles.map((a) => {
    const r = rng.range(opts.rMin, opts.rMax);
    return { x: opts.center.x + Math.cos(a) * r, y: opts.center.y + Math.sin(a) * r };
  });

  let gateEdge = 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    if (w > best) {
      best = w;
      gateEdge = i;
    }
  }
  return { outline, gateEdge };
}
