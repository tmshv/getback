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

// A random simple polygon. Each vertex is placed in its OWN angular sector (with a
// margin from the sector edges), so consecutive vertices stay well separated — this
// guarantees a fat, non-degenerate star-shaped polygon (no slivers) whose interior
// reliably contains both the generation center and the vertex-average centroid.
// Angles span [-π, π) so the sorted ring matches atan2's range. The gate is the
// widest edge (>= every other edge, comfortably above minGateWidth for these radii).
export function generatePen(rng: Rng, opts: PenGenOptions): PenShape {
  const n = rng.int(opts.minVerts, opts.maxVerts);
  const sector = (Math.PI * 2) / n;
  const margin = sector * 0.15;
  const outline: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI + i * sector + rng.range(margin, sector - margin);
    const r = rng.range(opts.rMin, opts.rMax);
    outline.push({ x: opts.center.x + Math.cos(angle) * r, y: opts.center.y + Math.sin(angle) * r });
  }

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
