# Motor: Grass Foraging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the flock a reason to roam: a depleting/regrowing **grass field**, a `graze` steering behavior that follows the grass gradient toward greener cells, and a **hunger drive** — so a hungry sheep autonomously drifts toward lush grass and grazes it down, in a unit test.

**Architecture:** Extends `@getback/motor` (still headless, Pixi-free). A `GrassField` is a coarse `Float32Array` density grid with pure ops (sample / gradient / deplete / regrow). `GrassSystem` regrows all cells and depletes the cell under each sheep each frame; `DriveSystem` raises hunger and lowers it where grass is lush. A new `graze` leaf reads the grass gradient from a grown `SteerContext` and blends with the existing flocking leaves. The `Game` pipeline becomes `Grass → Drives → Neighborhood → Steering → Movement`.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–2 (merged to `master`).

This is **Plan 3** (revised roadmap: 3 grass foraging · 4 collision · 5 pen · 6 dog/fun/respawn · 7 game+apps). Depends on Plan 2. Deliberately **out of scope** (later plans): water/shade attractors + thirst, fear/flee + stress sources, `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes (first needed by collision/pen), all collision, the pen. The grass `graze` leaf is **unconditional** here (always follows the gradient); hunger is tracked but does not yet gate behavior — gradient-following on a *uniform* field produces zero force, so it stays inert until grass actually varies.

---

## File structure (created/modified by this plan)

```
packages/motor/src/
  grass/
    GrassField.ts                  # NEW: GrassField + create/densityAt/setDensityAt/depleteAt/regrow/gradientAt
    GrassField.test.ts             # NEW
  systems/
    GrassSystem.ts                 # NEW: regrow + deplete under each sheep
    GrassSystem.test.ts            # NEW
    DriveSystem.ts                 # NEW: hunger up; down where grass is lush
    DriveSystem.test.ts            # NEW
    SteeringSystem.ts              # MODIFIED: signature gains `grass`; ctx carries grass
  ai/
    behaviors.ts                   # MODIFIED: add `graze`
    behaviors.test.ts              # MODIFIED: add graze tests
    trees.ts                       # MODIFIED: buildFlockTree -> buildSheepTree (adds graze)
  steering/types.ts                # MODIFIED: SteerContext gains `grass`
  entities/Sheep.ts                # MODIFIED: add `drives`; use buildSheepTree
  config.ts                        # MODIFIED: add grass/drives/graze tunables
  world/World.ts                   # MODIFIED: World gains `grass`; createWorld builds a default field
  world/Game.ts                    # MODIFIED: pipeline gains Grass + Drives
  world/Game.test.ts               # MODIFIED: add autonomous-grazing integration test
  systems/NeighborhoodSystem.test.ts # MODIFIED: update steeringSystem(...) call (new signature)
  index.ts                         # MODIFIED: export grass + systems + buildSheepTree
```

**Shared facts:** `.js` import extensions on `.ts` sources. `Vec2 = { x:number; y:number }` from `@getback/math`. Single test: `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commit messages. Work from repo root `/Users/tmshv/Workspace/Playground/getback` on a feature branch.

---

### Task 1: `GrassField` — density grid + pure ops

**Files:**
- Create: `packages/motor/src/grass/GrassField.ts`
- Create: `packages/motor/src/grass/GrassField.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/grass/GrassField.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createGrassField,
  densityAt,
  setDensityAt,
  depleteAt,
  regrow,
  gradientAt,
} from "./GrassField.js";

describe("GrassField", () => {
  it("creates a uniform field at the initial density", () => {
    const g = createGrassField({ cols: 4, rows: 3, cellSize: 10, regrowRate: 0.1, depleteRate: 0.5, initial: 1 });
    expect(g.density.length).toBe(12);
    expect(densityAt(g, 5, 5)).toBe(1);
  });

  it("set/read a cell by world position, clamping out-of-bounds to the edge", () => {
    const g = createGrassField({ cols: 4, rows: 3, cellSize: 10, regrowRate: 0.1, depleteRate: 0.5 });
    setDensityAt(g, 5, 5, 0.25);
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.25);
    // negative + beyond-grid positions clamp to nearest cell, never throw
    expect(() => densityAt(g, -999, -999)).not.toThrow();
    expect(() => densityAt(g, 9999, 9999)).not.toThrow();
  });

  it("deplete subtracts and clamps at 0; regrow adds and clamps at 1", () => {
    const g = createGrassField({ cols: 2, rows: 2, cellSize: 10, regrowRate: 0.3, depleteRate: 0.5, initial: 0.5 });
    depleteAt(g, 5, 5, 0.4);
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.1);
    depleteAt(g, 5, 5, 1); // would go negative
    expect(densityAt(g, 5, 5)).toBe(0);
    regrow(g, 1); // +0.3 to every cell
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.3);
    regrow(g, 100); // clamps at 1
    expect(densityAt(g, 5, 5)).toBe(1);
  });

  it("gradient points toward higher density", () => {
    const g = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0.1, depleteRate: 0.5, initial: 0.2 });
    setDensityAt(g, 40, 20, 1); // a lush cell to the east of (20,20)
    const out = { x: 0, y: 0 };
    gradientAt(g, 20, 20, out);
    expect(out.x).toBeGreaterThan(0); // points east toward the lush cell
    expect(Math.abs(out.y)).toBeLessThan(Math.abs(out.x));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/grass/GrassField.test.ts`
Expected: FAIL — cannot resolve `./GrassField.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/grass/GrassField.ts`:

```ts
import type { Vec2 } from "@getback/math";

// Coarse grass-density grid. density[row*cols + col] in [0,1].
export interface GrassField {
  cols: number;
  rows: number;
  cellSize: number;
  density: Float32Array;
  regrowRate: number; // per second
  depleteRate: number; // per second per grazing sheep
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

// World position -> flat cell index, clamped to the grid edges.
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
  const cs = field.cellSize;
  out.x = densityAt(field, x + cs, y) - densityAt(field, x - cs, y);
  out.y = densityAt(field, x, y + cs) - densityAt(field, x, y - cs);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/grass/GrassField.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/grass/GrassField.ts packages/motor/src/grass/GrassField.test.ts
git commit -m "Add motor GrassField density grid and ops"
```

---

### Task 2: `GrassSystem` — regrow + deplete under sheep

**Files:**
- Create: `packages/motor/src/systems/GrassSystem.ts`
- Create: `packages/motor/src/systems/GrassSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/systems/GrassSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { grassSystem } from "./GrassSystem.js";
import { createGrassField, densityAt, setDensityAt } from "../grass/GrassField.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

describe("grassSystem", () => {
  it("regrows all cells and depletes the cell under each sheep", () => {
    // regrowRate 0 isolates the depletion effect.
    const g = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0.5, initial: 1 });
    const sheep = [createSheep({ x: 25, y: 25 }, defaultSheepTraits())];

    grassSystem(g, sheep, 1); // deplete 0.5 under the sheep

    expect(densityAt(g, 25, 25)).toBeCloseTo(0.5);
    expect(densityAt(g, 5, 5)).toBe(1); // a cell with no sheep is untouched (regrow 0)
  });

  it("regrows ungrazed cells back toward 1", () => {
    const g = createGrassField({ cols: 3, rows: 3, cellSize: 10, regrowRate: 0.2, depleteRate: 0, initial: 0.5 });
    grassSystem(g, [], 1); // no sheep; just regrow +0.2 everywhere
    expect(densityAt(g, 5, 5)).toBeCloseTo(0.7);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/GrassSystem.test.ts`
Expected: FAIL — cannot resolve `./GrassSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/systems/GrassSystem.ts`:

```ts
import type { GrassField } from "../grass/GrassField.js";
import { regrow, depleteAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";

// Grass regrows everywhere; each sheep nibbles the cell it stands on. (Until
// behavior-gated grazing arrives, every sheep grazes continuously — fine: the
// herd's wandering still depletes and frees pasture.)
export function grassSystem(grass: GrassField, sheep: Sheep[], dt: number): void {
  regrow(grass, dt);
  const amount = grass.depleteRate * dt;
  for (const s of sheep) depleteAt(grass, s.pos.x, s.pos.y, amount);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/GrassSystem.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/GrassSystem.ts packages/motor/src/systems/GrassSystem.test.ts
git commit -m "Add motor GrassSystem regrow and graze depletion"
```

---

### Task 3: `graze` behavior + grow `SteerContext`

**Files:**
- Modify: `packages/motor/src/steering/types.ts`
- Modify: `packages/motor/src/ai/behaviors.ts`
- Modify: `packages/motor/src/ai/behaviors.test.ts`

- [ ] **Step 1: Grow `SteerContext` with the grass field**

In `packages/motor/src/steering/types.ts`, the current `SteerContext` is:
```ts
export interface SteerContext {
  neighbors: readonly Mobile[];
  dt: number;
}
```
Add a `grass` field and the import. Replace the interface with:
```ts
import type { GrassField } from "../grass/GrassField.js";
// ... (keep existing Vec2/Mobile imports)

export interface SteerContext {
  neighbors: readonly Mobile[];
  grass: GrassField;
  dt: number;
}
```
(Add the `import type { GrassField } ...` line near the top with the other imports.)

- [ ] **Step 2: Add the failing `graze` test**

Append to `packages/motor/src/ai/behaviors.test.ts` (and add `graze` to the import from `./behaviors.js`, and `createGrassField`/`setDensityAt` imports from `../grass/GrassField.js`):

```ts
import { graze } from "./behaviors.js";
import { createGrassField, setDensityAt } from "../grass/GrassField.js";

describe("graze", () => {
  it("steers toward greener grass (up the density gradient)", () => {
    const grass = createGrassField({ cols: 10, rows: 10, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0.2 });
    setDensityAt(grass, 70, 50, 1); // lush cell to the east of (50,50)
    const self = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const out = { x: 0, y: 0 };
    graze().run(self, { neighbors: [], grass, dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0); // heads east toward the lush cell
  });
  it("produces no force on a uniform field", () => {
    const grass = createGrassField({ cols: 10, rows: 10, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0.5 });
    const self = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const out = { x: 1, y: 1 };
    graze().run(self, { neighbors: [], grass, dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
```

Note: the existing flocking tests in this file build `ctx` as `{ neighbors: [...], dt: 0 }`. Now that `SteerContext` requires `grass`, those will fail to type-check. Update each existing `{ neighbors: ..., dt: 0 }` in this test file to also include a grass field. Add a shared helper near the top of the file after the imports:
```ts
const noGrass = createGrassField({ cols: 1, rows: 1, cellSize: 1000, regrowRate: 0, depleteRate: 0, initial: 0 });
```
and change every existing `{ neighbors: [near], dt: 0 }` (etc.) to `{ neighbors: [near], grass: noGrass, dt: 0 }`. (The flocking leaves ignore grass, so this does not change their behavior.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: FAIL — `graze` is not exported yet (and/or type errors until the ctx objects include `grass`).

- [ ] **Step 4: Implement `graze`**

Append to `packages/motor/src/ai/behaviors.ts` (add the import at the top):
```ts
import { gradientAt } from "../grass/GrassField.js";

// Follow the grass-density gradient toward greener cells (Reynolds steer toward
// the desired direction). Zero gradient (uniform/flat grass) => no force.
export function graze(): BehaviorNode {
  const g = { x: 0, y: 0 };
  return {
    run(e, ctx, out) {
      gradientAt(ctx.grass, e.pos.x, e.pos.y, g);
      const m = Math.hypot(g.x, g.y);
      if (m === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      out.x = (g.x / m) * e.maxSpeed - e.vel.x;
      out.y = (g.y / m) * e.maxSpeed - e.vel.y;
      return "fired";
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: PASS — the existing flocking tests plus the 2 new graze tests.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts
git commit -m "Add motor graze behavior and grass in SteerContext"
```

---

### Task 4: Hunger drive + `DriveSystem`

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/entities/Sheep.ts`
- Create: `packages/motor/src/systems/DriveSystem.ts`
- Create: `packages/motor/src/systems/DriveSystem.test.ts`

- [ ] **Step 1: Add config tunables**

In `packages/motor/src/config.ts`, add a `grass`, `drives`, and `graze` section inside the `config` object (alongside `flock`). The full `config` becomes:
```ts
export const config = {
  dtClampMax: 1 / 30,
  damping: 0.1,
  flock: {
    radius: 5,
    maxSpeed: 38,
    maxForce: 80,
    personalSpace: 12,
    perception: 40,
    cohesionK: 6,
    moveThreshold: 2,
    weights: { separation: 1.6, cohesion: 0.9, follow: 0.5 },
  },
  grass: { cellSize: 16, regrowRate: 0.03, depleteRate: 0.4, initial: 1 },
  drives: { hungerRate: 0.05, grazeRate: 0.5 }, // hunger up/sec; satiation/sec when on full grass
  graze: { weight: 1.0 },
  bounds: { x: 0, y: 0, w: 480, h: 270 },
} as const;
```

- [ ] **Step 2: Add `drives` to `Sheep`**

In `packages/motor/src/entities/Sheep.ts`, add a `drives` field to the `Sheep` interface and initialize it in `createSheep`. Change the `Sheep` interface to:
```ts
export interface Sheep extends Mobile {
  traits: SheepTraits;
  drives: { hunger: number }; // [0..1]; grows in later plans (thirst, fear)
  neighbors: Sheep[];
  root: BehaviorNode;
}
```
and in `createSheep`, add `drives: { hunger: 0 },` to the returned object (next to `traits`).

- [ ] **Step 3: Write the failing test**

Create `packages/motor/src/systems/DriveSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { driveSystem } from "./DriveSystem.js";
import { createGrassField } from "../grass/GrassField.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

describe("driveSystem", () => {
  it("raises hunger over time when there is no grass to graze", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    driveSystem([s], bare, 1); // hunger += hungerRate(0.05), no satiation (density 0)
    expect(s.drives.hunger).toBeCloseTo(0.05);
  });

  it("lowers hunger when standing on lush grass (satiation outpaces growth)", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.hunger = 0.5;
    driveSystem([s], lush, 1); // +0.05 hungerRate, -0.5 grazeRate*density(1) => net -0.45
    expect(s.drives.hunger).toBeCloseTo(0.05);
  });

  it("clamps hunger to [0,1]", () => {
    const lush = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 1 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.hunger = 0.1;
    driveSystem([s], lush, 1); // would go negative
    expect(s.drives.hunger).toBe(0);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/DriveSystem.test.ts`
Expected: FAIL — cannot resolve `./DriveSystem.js`.

- [ ] **Step 5: Write the implementation**

Create `packages/motor/src/systems/DriveSystem.ts`:
```ts
import type { GrassField } from "../grass/GrassField.js";
import { densityAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";
import { config } from "../config.js";

// Hunger rises over time and falls while a sheep stands on grass (proportional
// to local density — grazing). Clamped to [0,1].
export function driveSystem(sheep: Sheep[], grass: GrassField, dt: number): void {
  const { hungerRate, grazeRate } = config.drives;
  for (const s of sheep) {
    const dens = densityAt(grass, s.pos.x, s.pos.y);
    const next = s.drives.hunger + hungerRate * dt - grazeRate * dens * dt;
    s.drives.hunger = next < 0 ? 0 : next > 1 ? 1 : next;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/DriveSystem.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/entities/Sheep.ts packages/motor/src/systems/DriveSystem.ts packages/motor/src/systems/DriveSystem.test.ts
git commit -m "Add motor hunger drive and DriveSystem"
```

---

### Task 5: Wire grass into the sheep tree, systems, and world

**Files:**
- Modify: `packages/motor/src/ai/trees.ts`
- Modify: `packages/motor/src/entities/Sheep.ts`
- Modify: `packages/motor/src/systems/SteeringSystem.ts`
- Modify: `packages/motor/src/systems/NeighborhoodSystem.test.ts`
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: `buildFlockTree` → `buildSheepTree` (adds graze)**

Replace the contents of `packages/motor/src/ai/trees.ts` with:
```ts
import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { separation, cohesion, follow, graze } from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root behavior tree: graze (follow the grass gradient) blended with
// the social forces, in priority order. Built per-sheep so traits bake in.
export function buildSheepTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  return blend([
    { node: graze(), weight: config.graze.weight },
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
  ]);
}
```

- [ ] **Step 2: Use `buildSheepTree` in `createSheep`**

In `packages/motor/src/entities/Sheep.ts`, change the import `import { buildFlockTree } from "../ai/trees.js";` to `import { buildSheepTree } from "../ai/trees.js";` and change `root: buildFlockTree(traits),` to `root: buildSheepTree(traits),`.

- [ ] **Step 3: `SteeringSystem` gains `grass`**

Replace `packages/motor/src/systems/SteeringSystem.ts` with:
```ts
import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import type { SteerContext } from "../steering/types.js";

// Evaluate each sheep's behavior tree, writing the resulting steering force into
// `sheep.force` for MovementSystem to integrate.
export function steeringSystem(sheep: Sheep[], grass: GrassField, dt: number): void {
  for (const s of sheep) {
    const ctx: SteerContext = { neighbors: s.neighbors, grass, dt };
    s.root.run(s, ctx, s.force);
  }
}
```

- [ ] **Step 4: Fix the `NeighborhoodSystem.test.ts` steering call**

That test calls `steeringSystem(sheep, 1 / 60)`, which no longer type-checks. In `packages/motor/src/systems/NeighborhoodSystem.test.ts`, add an import:
```ts
import { createGrassField } from "../grass/GrassField.js";
```
and change the steering call in the `steeringSystem` describe block to pass a (uniform, inert) grass field:
```ts
    const grass = createGrassField({ cols: 1, rows: 1, cellSize: 1000, regrowRate: 0, depleteRate: 0, initial: 0 });
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, grass, 1 / 60);
```
(The assertion that `a.force.x > 0` still holds: uniform grass => graze contributes nothing; cohesion toward `b` at +x dominates.)

- [ ] **Step 5: `World` gains `grass`; `createWorld` builds a default field**

Replace `packages/motor/src/world/World.ts` with:
```ts
import { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import { createGrassField } from "../grass/GrassField.js";
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

export function createWorld(sheep: Sheep[] = [], grass: GrassField = defaultGrass()): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grass,
    grid: new UniformGrid<Sheep>(config.flock.perception),
  };
}
```

- [ ] **Step 6: `Game` pipeline gains Grass + Drives**

Replace `packages/motor/src/world/Game.ts` with:
```ts
import type { World } from "./World.js";
import { config } from "../config.js";
import { grassSystem } from "../systems/GrassSystem.js";
import { driveSystem } from "../systems/DriveSystem.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem } from "../systems/MovementSystem.js";

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {}

  update(dt: number): void {
    // Clamp dt ONCE so every system agrees on the timestep.
    const step = Math.min(dt, config.dtClampMax);
    const { sheep, grass, grid } = this.world;
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, step);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, grass, step);
    movementSystem(sheep, step);
  }
}
```

- [ ] **Step 7: Export the new symbols**

In `packages/motor/src/index.ts`: change `export { buildFlockTree } ...` to `export { buildSheepTree } from "./ai/trees.js";`, add `graze` to the `./ai/behaviors.js` export line, and add:
```ts
export type { GrassField, GrassFieldOptions } from "./grass/GrassField.js";
export { createGrassField, densityAt, setDensityAt, depleteAt, regrow, gradientAt } from "./grass/GrassField.js";
export { grassSystem } from "./systems/GrassSystem.js";
export { driveSystem } from "./systems/DriveSystem.js";
```

- [ ] **Step 8: Verify everything still type-checks and the existing suite passes**

Run: `npm test`
Expected: PASS — all existing tests (including the Plan 2 flocking integration test, which uses uniform default grass so graze stays inert).

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/motor/src/ai/trees.ts packages/motor/src/entities/Sheep.ts packages/motor/src/systems/SteeringSystem.ts packages/motor/src/systems/NeighborhoodSystem.test.ts packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts
git commit -m "Wire grass and drives into the sheep tree, systems, and world"
```

---

### Task 6: Autonomous-grazing integration test

**Files:**
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (add imports for `createGrassField`, `setDensityAt`, `densityAt` from `../grass/GrassField.js`):

```ts
import { createGrassField, setDensityAt, densityAt } from "../grass/GrassField.js";

describe("autonomous grazing integration", () => {
  it("a lone sheep drifts toward greener grass and grazes it down", () => {
    // A field that is bare in the west and lush in the east third.
    const grass = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0.4, initial: 0.1 });
    for (let cx = 20; cx < 30; cx++) {
      for (let cy = 0; cy < 18; cy++) {
        setDensityAt(grass, cx * 16 + 8, cy * 16 + 8, 1); // lush eastern band, world x >= ~320
      }
    }
    const sheep = [createSheep({ x: 120, y: 140 }, defaultSheepTraits())];
    const game = new Game(createWorld(sheep, grass));

    const startX = sheep[0]!.pos.x;
    const lushBefore = densityAt(grass, 360, 140); // a cell inside the lush band

    for (let i = 0; i < 1200; i++) game.update(1 / 60); // 20 s

    // It moved east, toward the greener pasture.
    expect(sheep[0]!.pos.x).toBeGreaterThan(startX + 50);
    // ...and grazed the lush band down somewhere it passed through.
    // (Total grass in the lush band dropped because the sheep ate while crossing.)
    let lushSum = 0;
    for (let cx = 20; cx < 30; cx++) lushSum += densityAt(grass, cx * 16 + 8, 140);
    expect(lushSum).toBeLessThan(10 * lushBefore); // 10 cells, each started at lushBefore(=1)
    // numerically sane
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
    expect(Number.isFinite(sheep[0]!.pos.y)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run packages/motor/src/world/Game.test.ts`
Expected: PASS — both the flocking and the grazing integration tests.

If `pos.x > startX + 50` fails, the sheep did not travel far enough toward the grass: confirm `config.graze.weight` is high enough relative to the (neighbor-less, so inert) flocking weights, and that `gradientAt` points up-gradient. If `lushSum` did not drop, confirm `grassSystem` runs before movement in `Game.update` and `depleteRate > 0`. Do not weaken the assertions; the behavior (travel toward grass + deplete it) is the requirement. Report DONE_WITH_CONCERNS with the observed numbers if you cannot satisfy it after principled tuning.

- [ ] **Step 3: Full verification**

Run: `npm test`
Expected: PASS — every test across all four packages (Plan 1 + motor, now with grass/drives + the two integration tests).

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/world/Game.test.ts
git commit -m "Add autonomous grazing integration test"
```

---

## Self-review

**Spec coverage (against §9.1 grass, §8.1 drives, §8.3 graze goal, §5.2 pipeline):**
- Grass density grid + deplete/regrow/gradient (§9.1) → Task 1 ✓
- GrassSystem regrow + graze depletion (§9.1, §5.2 step 4) → Task 2 ✓
- `graze` gradient-follow behavior (§8.3) → Task 3 ✓
- Hunger drive + DriveSystem (§8.1, §5.2 step 5) → Task 4 ✓
- Pipeline `Grass → Drives → Neighborhood → Steering → Movement` (§5.2) → Task 5 ✓
- Emergent forage behavior validated end-to-end → Task 6 ✓
- **Deliberately deferred** (correct, per revised roadmap): water/shade attractors + thirst, fear/flee + stress, Selector/Conditional/Sequence/Dynamic nodes, collision, pen, dog, fun layer, signals → Plans 4–7. Hunger is tracked but does not yet gate the `graze` weight (graze is unconditional); on a uniform field it produces zero force, so Plan 2's flocking test is unaffected.

**Placeholder scan:** none — every step has runnable code and an exact command with expected output. Steps that *modify* existing files quote the exact before/after.

**Type consistency:** `SteerContext` gains `grass` (Task 3) and every constructor of a ctx is updated in the same plan (behaviors.test, SteeringSystem, NeighborhoodSystem.test). `steeringSystem` signature change `(sheep, dt)` → `(sheep, grass, dt)` is propagated to its only two call sites (`Game.ts`, `NeighborhoodSystem.test.ts`). `buildFlockTree` → `buildSheepTree` is propagated to its only consumer (`Sheep.ts`) and the barrel. `Sheep` gains `drives: { hunger }`; `createSheep` initializes it; the Plan-2 `Sheep.test` checks individual fields (not a whole-object `toEqual`), so it stays green. `World` gains `grass` with a default, so `createWorld(sheep)` callers (the Plan-2 integration test) keep working.

**Backward-compat risk:** the Plan-2 flocking integration test calls `createWorld(sheep)` and `game.update(1/60)`; with default uniform grass the new `grassSystem`/`driveSystem`/`graze` are inert (gradient 0), so that test's assertions are unchanged. Verified by reasoning; Task 5 step 8 runs the whole suite to confirm.

---

## Next plans (not part of this one)

- **Plan 4 — Motor: collision:** `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes; point obstacles (rock/tree) + circle-circle resolution; fence segments; closest-feature push-out; swept circle-segment CCD; wall-/obstacle-avoidance steering; the `StaticIndex` broad-phase wired in.
- **Plan 5 — Motor: pen:** random simple-polygon `penGen`; one-geometry→two-models (containment + fence); capture via point-in-polygon; one-way gate; penned interior-seeking behavior.
- **Plan 6 — Motor: dog, fun layer, respawn:** `intentFollow` + dog; water/shade attractors + thirst; fear/flee + ScareSystem/bark; StaminaSystem; treats + Emitter + Pool + BuffSystem; pen fill + respawn; ambient scares; GameSignals; `Game.update(dt, intent)`.
- **Plan 7 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*`.
