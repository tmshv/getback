# Motor: Pen Geometry & Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a randomly-generated **pen** on the pasture and detect when sheep are inside it: a `generatePen` that emits a random simple polygon + gate, a `buildPen` that derives both a containment model and the solid fence segments from that one geometry, and a `PenSystem` that flags sheep inside the polygon as `penned` — verified headless.

**Architecture:** Extends `@getback/motor`. A pen's single source of truth is an ordered vertex ring (`outline`) + a `gateEdge` index. `buildPen` derives: the **containment** test (point-in-polygon over the closed ring) and the **fence** segments (every edge except the gate). The gate's inward normal comes from the polygon winding. `PenSystem` runs each frame and sets `sheep.penned = penContains(pen, sheep.pos)`. **No fence collision yet** — sheep pass freely through fences in this plan; the hard collision (closest-feature + swept CCD + one-way gate) that physically contains them is Plan 6.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–4 (merged to `master`). Uses `@getback/math`'s `signedArea`, `pointInPolygon`, and `makeRng`.

**Plan 5** of the roadmap (3 grass · 4 obstacles · **5 pen geometry+capture** · 6 fence collision · 7 dog/fun/respawn · 8 game+apps). **Out of scope (Plan 6):** fence-segment collision, closest-feature push-out, swept CCD, the one-way gate, penned interior-seeking behavior, the `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes, `StaticIndex` for segments.

---

## File structure (created/modified)

```
packages/motor/src/
  world/penGen.ts                  # NEW: generatePen (random simple polygon + gate)
  world/penGen.test.ts             # NEW
  world/Pen.ts                     # NEW: Segment, Pen, buildPen, penContains
  world/Pen.test.ts                # NEW
  systems/PenSystem.ts             # NEW: capture (point-in-polygon -> penned)
  systems/PenSystem.test.ts        # NEW
  entities/Sheep.ts                # MODIFIED: add `penned: boolean`
  config.ts                        # MODIFIED: add pen-generation tunables
  world/World.ts                   # MODIFIED: World gains `pen: Pen | null`; createWorld param
  world/Game.ts                    # MODIFIED: run PenSystem (capture) when a pen exists
  world/Game.test.ts               # MODIFIED: add pen-capture integration test
  index.ts                         # MODIFIED: export penGen/Pen/PenSystem
```

**Shared facts:** `.js` import extensions. `Vec2 = {x,y}`, `Rng`, `makeRng`, `signedArea`, `pointInPolygon` from `@getback/math`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `generatePen` — random simple polygon + gate

**Files:**
- Create: `packages/motor/src/world/penGen.ts`
- Create: `packages/motor/src/world/penGen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/world/penGen.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { generatePen } from "./penGen.js";

const opts = { center: { x: 240, y: 135 }, rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24 };

describe("generatePen", () => {
  it("is deterministic for a fixed seed", () => {
    const a = generatePen(makeRng(7), opts);
    const b = generatePen(makeRng(7), opts);
    expect(a.outline).toEqual(b.outline);
    expect(a.gateEdge).toBe(b.gateEdge);
  });

  it("produces an outline within the vertex-count range and a valid gate index", () => {
    const p = generatePen(makeRng(3), opts);
    expect(p.outline.length).toBeGreaterThanOrEqual(opts.minVerts);
    expect(p.outline.length).toBeLessThanOrEqual(opts.maxVerts);
    expect(p.gateEdge).toBeGreaterThanOrEqual(0);
    expect(p.gateEdge).toBeLessThan(p.outline.length);
  });

  it("the gate edge is at least minGateWidth wide", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = generatePen(makeRng(seed), opts);
      const a = p.outline[p.gateEdge]!;
      const b = p.outline[(p.gateEdge + 1) % p.outline.length]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(opts.minGateWidth - 1e-6);
    }
  });

  it("vertices are sorted by angle around the center (=> simple, non-self-intersecting)", () => {
    const p = generatePen(makeRng(9), opts);
    const angles = p.outline.map((v) => Math.atan2(v.y - opts.center.y, v.x - opts.center.x));
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThanOrEqual(angles[i - 1]!);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/world/penGen.test.ts`
Expected: FAIL — cannot resolve `./penGen.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/world/penGen.ts`:
```ts
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
// (star-shaped) polygon. The gate is one edge wide enough to admit sheep.
export function generatePen(rng: Rng, opts: PenGenOptions): PenShape {
  const n = rng.int(opts.minVerts, opts.maxVerts);
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push(rng.range(0, Math.PI * 2));
  angles.sort((a, b) => a - b);
  const outline: Vec2[] = angles.map((a) => {
    const r = rng.range(opts.rMin, opts.rMax);
    return { x: opts.center.x + Math.cos(a) * r, y: opts.center.y + Math.sin(a) * r };
  });

  // choose the widest edge as the gate, guaranteeing >= minGateWidth when possible.
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
```

Note: choosing the **widest** edge as the gate guarantees the gate is at least as wide as any other edge; with `rMin..rMax` spanning the radii, the widest edge comfortably exceeds `minGateWidth` for these params. The test's `minGateWidth - 1e-6` tolerance covers float wobble. (If a future tightening of params makes even the widest edge too narrow, regenerate — not needed here.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/world/penGen.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/penGen.ts packages/motor/src/world/penGen.test.ts
git commit -m "Add motor generatePen random simple-polygon generator"
```

---

### Task 2: `Pen` — one geometry, two models

**Files:**
- Create: `packages/motor/src/world/Pen.ts`
- Create: `packages/motor/src/world/Pen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/world/Pen.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildPen, penContains } from "./Pen.js";

// CCW unit square scaled to 4, gate = bottom edge (index 0).
const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

describe("buildPen", () => {
  it("derives fences as every edge EXCEPT the gate", () => {
    const pen = buildPen(square, 0);
    expect(pen.fences.length).toBe(3); // 4 edges - 1 gate
    // none of the fence segments is the gate edge (0,0)->(4,0)
    for (const f of pen.fences) {
      const isGate = f.a.x === 0 && f.a.y === 0 && f.b.x === 4 && f.b.y === 0;
      expect(isGate).toBe(false);
    }
  });

  it("computes the gate mouth and an inward-pointing normal", () => {
    const pen = buildPen(square, 0); // gate = bottom edge; interior is above (+y)
    expect(pen.gate.mouth.a).toEqual({ x: 0, y: 0 });
    expect(pen.gate.mouth.b).toEqual({ x: 4, y: 0 });
    expect(pen.gate.inwardNormal.x).toBeCloseTo(0);
    expect(pen.gate.inwardNormal.y).toBeCloseTo(1); // points up, into the square
  });

  it("computes the centroid", () => {
    const pen = buildPen(square, 0);
    expect(pen.centroid).toEqual({ x: 2, y: 2 });
  });
});

describe("penContains", () => {
  it("is true inside, false outside (concave-safe via point-in-polygon)", () => {
    const pen = buildPen(square, 0);
    expect(penContains(pen, { x: 2, y: 2 })).toBe(true);
    expect(penContains(pen, { x: 9, y: 9 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/world/Pen.test.ts`
Expected: FAIL — cannot resolve `./Pen.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/world/Pen.ts`:
```ts
import type { Vec2 } from "@getback/math";
import { signedArea, pointInPolygon } from "@getback/math";
import type { Sheep } from "../entities/Sheep.js";

export interface Segment {
  a: Vec2;
  b: Vec2;
}

export interface Pen {
  outline: Vec2[];
  gateEdge: number;
  fences: Segment[]; // every edge except the gate
  gate: { mouth: Segment; inwardNormal: Vec2 };
  centroid: Vec2;
  contained: Set<Sheep>;
}

// One geometry, two derived models: the CLOSED ring is the containment polygon
// (point-in-polygon), and the same edges MINUS the gate are the solid fence.
export function buildPen(outline: Vec2[], gateEdge: number): Pen {
  const n = outline.length;
  const fences: Segment[] = [];
  let mouth: Segment = { a: outline[0]!, b: outline[1 % n]! };
  for (let i = 0; i < n; i++) {
    const seg: Segment = { a: outline[i]!, b: outline[(i + 1) % n]! };
    if (i === gateEdge) mouth = seg;
    else fences.push(seg);
  }

  // inward normal of the gate edge, from polygon winding. For a CCW ring the
  // interior is to the LEFT of each directed edge A->B; left normal of (dx,dy) is
  // (-dy, dx). Flip for CW.
  const ccw = signedArea(outline) > 0;
  let nx = -(mouth.b.y - mouth.a.y);
  let ny = mouth.b.x - mouth.a.x;
  if (!ccw) {
    nx = -nx;
    ny = -ny;
  }
  const m = Math.hypot(nx, ny);
  const inwardNormal: Vec2 = m > 0 ? { x: nx / m, y: ny / m } : { x: 0, y: 1 };

  let cx = 0;
  let cy = 0;
  for (const v of outline) {
    cx += v.x;
    cy += v.y;
  }
  const centroid: Vec2 = { x: cx / n, y: cy / n };

  return { outline, gateEdge, fences, gate: { mouth, inwardNormal }, centroid, contained: new Set() };
}

export function penContains(pen: Pen, p: Vec2): boolean {
  return pointInPolygon(p, pen.outline);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/world/Pen.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/Pen.ts packages/motor/src/world/Pen.test.ts
git commit -m "Add motor Pen model: fences, gate normal, containment from one polygon"
```

---

### Task 3: `penned` flag + `PenSystem` capture

**Files:**
- Modify: `packages/motor/src/entities/Sheep.ts`
- Create: `packages/motor/src/systems/PenSystem.ts`
- Create: `packages/motor/src/systems/PenSystem.test.ts`

- [ ] **Step 1: Add `penned` to `Sheep`**

In `packages/motor/src/entities/Sheep.ts`, add `penned: boolean;` to the `Sheep` interface (after `drives`), and `penned: false,` to the object returned by `createSheep` (next to `drives`). Read the file first; change nothing else.

- [ ] **Step 2: Write the failing test**

Create `packages/motor/src/systems/PenSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { penSystem } from "./PenSystem.js";
import { buildPen } from "../world/Pen.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

describe("penSystem", () => {
  it("flags sheep inside the polygon as penned and collects them", () => {
    const pen = buildPen(square, 0);
    const inside = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    const outside = createSheep({ x: 200, y: 200 }, defaultSheepTraits());
    penSystem(pen, [inside, outside]);
    expect(inside.penned).toBe(true);
    expect(outside.penned).toBe(false);
    expect(pen.contained.has(inside)).toBe(true);
    expect(pen.contained.has(outside)).toBe(false);
    expect(pen.contained.size).toBe(1);
  });

  it("recomputes cleanly each call (a sheep that leaves is un-penned)", () => {
    const pen = buildPen(square, 0);
    const s = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    penSystem(pen, [s]);
    expect(s.penned).toBe(true);
    s.pos.x = 500; // wander out
    penSystem(pen, [s]);
    expect(s.penned).toBe(false);
    expect(pen.contained.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/PenSystem.test.ts`
Expected: FAIL — cannot resolve `./PenSystem.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/motor/src/systems/PenSystem.ts`:
```ts
import type { Pen } from "../world/Pen.js";
import { penContains } from "../world/Pen.js";
import type { Sheep } from "../entities/Sheep.js";

// Capture: a sheep whose position is inside the pen polygon is flagged `penned`
// and added to `pen.contained`. Recomputed each frame (no fence yet to hold them
// in — physical containment + a sticky penned state arrive with the fence in the
// next plan).
export function penSystem(pen: Pen, sheep: Sheep[]): void {
  pen.contained.clear();
  for (const s of sheep) {
    s.penned = penContains(pen, s.pos);
    if (s.penned) pen.contained.add(s);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/PenSystem.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/entities/Sheep.ts packages/motor/src/systems/PenSystem.ts packages/motor/src/systems/PenSystem.test.ts
git commit -m "Add motor penned flag and PenSystem capture"
```

---

### Task 4: Wire the pen into the world + capture integration test

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Add pen-generation tunables**

In `packages/motor/src/config.ts`, add inside the `config` object (after `obstacleAvoid`):
```ts
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24 },
```

- [ ] **Step 2: `World` gains an optional `pen`**

In `packages/motor/src/world/World.ts`: add `import type { Pen } from "./Pen.js";`, add `pen: Pen | null;` to the `World` interface (after `obstacles`), and add a `pen` parameter to `createWorld` (default `null`):
```ts
export function createWorld(
  sheep: Sheep[] = [],
  grass: GrassField = defaultGrass(),
  obstacles: Obstacle[] = [],
  pen: Pen | null = null,
): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grass,
    obstacles,
    pen,
    grid: new UniformGrid<Sheep>(config.flock.perception),
  };
}
```

- [ ] **Step 3: `Game` runs `PenSystem` when a pen exists**

In `packages/motor/src/world/Game.ts`: add `import { penSystem } from "../systems/PenSystem.js";`, destructure `pen` from `this.world`, and after the `collisionSystem(...)` line add:
```ts
    if (pen) penSystem(pen, sheep);
```
(Capture is computed on the post-collision positions, at the end of the step.)

- [ ] **Step 4: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export type { PenShape, PenGenOptions } from "./world/penGen.js";
export { generatePen } from "./world/penGen.js";
export type { Pen, Segment } from "./world/Pen.js";
export { buildPen, penContains } from "./world/Pen.js";
export { penSystem } from "./systems/PenSystem.js";
```

- [ ] **Step 5: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (add imports `import { makeRng } from "@getback/math";`, `import { generatePen } from "../world/penGen.js";`, `import { buildPen } from "../world/Pen.js";`, `import { config } from "../config.js";`):
```ts
describe("pen capture integration", () => {
  it("a generated pen captures sheep placed inside it and not those outside", () => {
    const shape = generatePen(makeRng(11), { center: { x: 240, y: 135 }, ...config.pen });
    const pen = buildPen(shape.outline, shape.gateEdge);
    // place one sheep at the pen centroid (definitely inside), one far outside.
    const inside = createSheep({ x: pen.centroid.x, y: pen.centroid.y }, defaultSheepTraits());
    const outside = createSheep({ x: 10, y: 10 }, defaultSheepTraits());
    const game = new Game(createWorld([inside, outside], undefined, [], pen));

    game.update(1 / 60);

    expect(inside.penned).toBe(true);
    expect(outside.penned).toBe(false);
    expect(pen.contained.has(inside)).toBe(true);
  });
});
```
Note: `createWorld([...], undefined, [], pen)` passes `undefined` for grass so it uses the default field; `[]` obstacles; the `pen`. (`undefined` is fine for a defaulted parameter.)

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: PASS — every test (existing Plan-2/3/4 integration tests pass a `null` pen by default, so `PenSystem` doesn't run for them).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Wire pen into the world and add pen-capture integration test"
```

---

## Self-review

**Spec coverage (§11.1 one-geometry-two-models, §11.2 random generation, §11.3 capture):**
- Random simple-polygon + gate (§11.2) → Task 1 ✓
- `outline + gateEdge` → containment + fences + gate inward-normal (§11.1) → Task 2 ✓
- Capture via point-in-polygon → `penned` + `contained` (§11.3) → Task 3 ✓
- Wired into the world/pipeline + validated end-to-end → Task 4 ✓
- **Deliberately deferred** (Plan 6): fence-segment collision, closest-feature push-out, swept CCD, one-way gate (§10.3–10.5, §11.4–11.5 hard containment), penned interior-seeking behavior, Selector/Conditional/Sequence/Dynamic nodes, StaticIndex for segments. Capture here recomputes each frame (a sheep can drift out); the fence + sticky penned state that *keep* them in are Plan 6.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `Sheep` gains `penned: boolean` (Task 3), initialized in `createSheep`; existing `Sheep.test` checks individual fields, not a whole-object `toEqual`, so it stays green. `Pen` imports the `Sheep` type for `contained: Set<Sheep>`; `Sheep.ts` does not import `Pen`, so no cycle. `World` gains `pen: Pen | null` with default `null`, so existing `createWorld(sheep[, grass[, obstacles]])` callers keep working and `PenSystem` is skipped for them. `generatePen` consumes `Rng` from `@getback/math`; `buildPen` uses `signedArea`/`pointInPolygon` already exported there.

**Generation correctness note:** angle-sorting the vertices guarantees a simple (non-self-intersecting) star-shaped polygon — proven by the monotonic-angle test. Choosing the widest edge as the gate guarantees the gate is the widest edge (>= every other), comfortably above `minGateWidth` for the configured radii.

---

## Next plans

- **Plan 6 — Motor: fence collision & containment:** fence-segment collision (closest-feature push-out for resting contact/corners; motion-segment crossing detection to prevent tunneling); the one-way gate (block outward crossings via the inward normal); sticky penned state; penned interior-seeking behavior; `Selector`/`Conditional` nodes to branch penned-vs-normal; `StaticIndex` broad-phase for the fence segments; `prevPos` on `Mobile` for the crossing test.
- **Plan 7 — Motor: dog, fun layer, respawn.**
- **Plan 8 — `@getback/game` + apps/examples.**
