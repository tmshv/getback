# Motor: Attractors, Thirst & Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@getback/motor` with water and shade attractors, a thirst drive, `drink`/`rest` leaf behaviors, a goal-selector cascade that picks the dominant drive, per-sheep trait variation via a seeded RNG, and the matching config/World wiring — so sheep autonomously choose to drink when thirsty, graze when hungry, and idle at shade otherwise.

**Architecture:** Three interconnected additions: (1) a new headless `Attractor` entity type plus a `createTree` helper that pairs a solid `Obstacle` trunk with a shade `Attractor`; (2) `thirst` appended to `sheep.drives` and `DriveSystem` extended to tick thirst and reduce it inside a water attractor; (3) `ai/behaviors.ts` grows `drink`/`rest` leaves and `thirstIsTop`/`hungerIsTop` predicates, and `ai/trees.ts` replaces the single `graze` leaf inside the flocking blend's goal slot with a `selector([ conditional(thirstIsTop, drink), conditional(hungerIsTop, graze), rest ])` cascade — the outer `selector([ conditional(isPenned, pennedBlend), flocking ])` root from Plan 12 is kept completely intact.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–12 (merged to `master`). Uses `@getback/math` (`Vec2`, `Rng`, `makeRng`); motor stays Pixi-free/headless.

**Plan 13** of the roadmap. Depends on Plan 12. **Out of scope (later slices):** treats/Emitter/Pool/BuffSystem; ambient global scares; richer GameSignals; boldness wired into fear recovery (stored, deferred to Plan 14); the render layer.

---

## Key facts

- **`.js` import extensions** on `.ts` sources are correct (Bundler resolution). Never flag them as errors.
- **Optional-field pattern:** new `SteerContext` and `SteerEnv` fields are `optional` (`?`) so the ~20 existing ctx/env literals in tests compile unchanged without edits.
- **Keep the Plan 12 root intact:** the sheep root tree remains `selector([ conditional(isPenned, pennedBlend), flocking ])`. Only the internals of `flocking` change (the `graze` leaf is promoted into a goal sub-selector).
- **`config` uses `as const`** — new entries must be added inline (never reassigned).
- **`defaultSheepTraits()`** returns deterministic traits and is used by ~20 test files; it must NOT be removed or modified. `rollSheepTraits(rng)` is a separate factory.
- **`boldness` is stored** in `SheepTraits` from this plan forward but is **not yet wired** into `FearSystem`; the comment in FearSystem says "multiply by boldness — wired in Plan 14."
- **Attractor is NOT an Obstacle:** sheep enter it (no collision resolution). Only `Obstacle` uses `obstacleAvoid`.
- **`createTree(pos)`** returns `{ obstacle: Obstacle, shade: Attractor }` — it is a factory helper, not a new class. World holds `obstacles: Obstacle[]` and `attractors: Attractor[]` as separate lists.
- **Single test:** `npx vitest run <path>`. Full suite: `npm test`. Typecheck: `npm run typecheck`. One-line imperative commits.

---

## File structure (created/modified)

```
packages/motor/src/entities/Attractor.ts              # NEW: Attractor interface + createAttractor + createTree
packages/motor/src/entities/Attractor.test.ts         # NEW: createAttractor + createTree unit tests
packages/motor/src/entities/Sheep.ts                  # MODIFIED: add thirst to drives + boldness to SheepTraits + rollSheepTraits
packages/motor/src/entities/Sheep.test.ts             # MODIFIED: rollSheepTraits tests
packages/motor/src/config.ts                          # MODIFIED: drives.thirstRate, drink/rest weights, attractor radii, trait ranges
packages/motor/src/systems/DriveSystem.ts             # MODIFIED: tick thirst; drink inside water attractor
packages/motor/src/systems/DriveSystem.test.ts        # MODIFIED: thirst tests
packages/motor/src/steering/types.ts                  # MODIFIED: SteerContext gains optional water + shade
packages/motor/src/systems/SteeringSystem.ts          # MODIFIED: SteerEnv gains optional water + shade; populates ctx
packages/motor/src/ai/behaviors.ts                    # MODIFIED: add drink + rest + thirstIsTop + hungerIsTop
packages/motor/src/ai/behaviors.test.ts               # MODIFIED: drink, rest, thirstIsTop, hungerIsTop tests
packages/motor/src/ai/trees.ts                        # MODIFIED: replace single graze with goal selector cascade
packages/motor/src/world/World.ts                     # MODIFIED: World gains attractors list; createWorld param
packages/motor/src/world/World.test.ts                # MODIFIED: attractors default test
packages/motor/src/index.ts                           # MODIFIED: barrel exports for new symbols
```

---

### Task 1: `Attractor` entity + `createTree` factory

**Files:**
- Create: `packages/motor/src/entities/Attractor.ts`
- Create: `packages/motor/src/entities/Attractor.test.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/entities/Attractor.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createAttractor, createTree } from "./Attractor.js";
import { config } from "../config.js";

describe("createAttractor", () => {
  it("creates a water attractor with the given fields", () => {
    const a = createAttractor("water", { x: 50, y: 80 }, 24);
    expect(a.kind).toBe("water");
    expect(a.pos).toEqual({ x: 50, y: 80 });
    expect(a.radius).toBe(24);
  });

  it("creates a shade attractor", () => {
    const a = createAttractor("shade", { x: 10, y: 10 }, 32);
    expect(a.kind).toBe("shade");
    expect(a.radius).toBe(32);
  });

  it("pos is a defensive copy (mutating source does not affect attractor)", () => {
    const src = { x: 1, y: 2 };
    const a = createAttractor("water", src, 10);
    src.x = 99;
    expect(a.pos.x).toBe(1);
  });
});

describe("createTree", () => {
  it("returns an obstacle (trunk) + shade attractor", () => {
    const { obstacle, shade } = createTree({ x: 100, y: 200 });
    expect(obstacle.kind).toBe("tree");
    expect(obstacle.pos).toEqual({ x: 100, y: 200 });
    expect(obstacle.radius).toBe(config.attractor.trunkRadius);
    expect(shade.kind).toBe("shade");
    expect(shade.pos).toEqual({ x: 100, y: 200 });
    expect(shade.radius).toBe(config.attractor.shadeRadius);
    expect(shade.radius).toBeGreaterThan(obstacle.radius);
  });

  it("trunk and shade share the same position (defensive copies)", () => {
    const pos = { x: 40, y: 60 };
    const { obstacle, shade } = createTree(pos);
    pos.x = 999;
    expect(obstacle.pos.x).toBe(40);
    expect(shade.pos.x).toBe(40);
  });
});
```
Run `npx vitest run packages/motor/src/entities/Attractor.test.ts` → FAIL (cannot resolve `./Attractor.js`).

- [ ] **Step 2: Implement**

First add `attractor` config block to `packages/motor/src/config.ts`. In the file the last line is:
```ts
  bounds: { x: 0, y: 0, w: 480, h: 270 },
} as const;
```
Replace it with:
```ts
  bounds: { x: 0, y: 0, w: 480, h: 270 },
  attractor: {
    trunkRadius: 7,      // solid tree trunk
    shadeRadius: 28,     // restful shade canopy, larger than trunk
    waterRadius: 22,     // default water hole radius
  },
} as const;
```

Now create `packages/motor/src/entities/Attractor.ts`:
```ts
import type { Vec2 } from "@getback/math";
import type { Obstacle } from "./Obstacle.js";
import { createObstacle } from "./Obstacle.js";
import { config } from "../config.js";

export type AttractorKind = "water" | "shade";

// A circular zone sheep ENTER (not a collision obstacle). Used for water holes
// (thirst) and tree shade (rest). Solid trunks are separate Obstacle entries.
export interface Attractor {
  kind: AttractorKind;
  pos: Vec2;
  radius: number;
}

export function createAttractor(kind: AttractorKind, pos: Vec2, radius: number): Attractor {
  return { kind, pos: { x: pos.x, y: pos.y }, radius };
}

// A tree is a solid circular trunk (Obstacle) PLUS a restful shade canopy
// (Attractor) at the same position but with larger radius (§9.3).
export function createTree(pos: Vec2): { obstacle: Obstacle; shade: Attractor } {
  return {
    obstacle: createObstacle("tree", pos, config.attractor.trunkRadius),
    shade: createAttractor("shade", pos, config.attractor.shadeRadius),
  };
}
```

- [ ] **Step 3: Run → PASS**

Run `npx vitest run packages/motor/src/entities/Attractor.test.ts` → expect 5 passing.
Run `npm run typecheck` → exit 0.

- [ ] **Step 4: Export from barrel**

In `packages/motor/src/index.ts`, append after the `createObstacle` export line:
```ts
export type { Attractor, AttractorKind } from "./entities/Attractor.js";
export { createAttractor, createTree } from "./entities/Attractor.js";
```

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/entities/Attractor.ts packages/motor/src/entities/Attractor.test.ts packages/motor/src/config.ts packages/motor/src/index.ts
git commit -m "Add Attractor entity and createTree factory"
```

---

### Task 2: Add `thirst` and `boldness` to sheep; `rollSheepTraits`

**Files:**
- Modify: `packages/motor/src/entities/Sheep.ts`
- Modify: `packages/motor/src/entities/Sheep.test.ts`
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Add trait-variation config**

In `packages/motor/src/config.ts`, add a `traits` block. The current last lines are:
```ts
  attractor: {
    trunkRadius: 7,
    shadeRadius: 28,
    waterRadius: 22,
  },
} as const;
```
Replace with:
```ts
  attractor: {
    trunkRadius: 7,
    shadeRadius: 28,
    waterRadius: 22,
  },
  traits: {
    maxSpeedJitter: 0.2,   // ±20% of flock.maxSpeed
    boldnessMin: 0.3,
    boldnessMax: 0.9,
    sociabilityMin: 0.4,
    sociabilityMax: 1.0,
  },
} as const;
```

- [ ] **Step 2: Write the failing tests**

READ `packages/motor/src/entities/Sheep.test.ts` (it tests `createSheep` and `defaultSheepTraits`).

Append at the end of `packages/motor/src/entities/Sheep.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { createSheep, defaultSheepTraits, rollSheepTraits } from "./Sheep.js";
import { config } from "../config.js";

describe("defaultSheepTraits", () => {
  it("includes boldness field with value 1 (deterministic baseline)", () => {
    const t = defaultSheepTraits();
    expect(typeof t.boldness).toBe("number");
    expect(t.boldness).toBe(1);
  });
});

describe("rollSheepTraits", () => {
  it("returns traits within documented ranges", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 20; i++) {
      const t = rollSheepTraits(rng);
      const baseSpeed = config.flock.maxSpeed;
      const jitter = config.traits.maxSpeedJitter;
      expect(t.maxSpeed).toBeGreaterThanOrEqual(baseSpeed * (1 - jitter));
      expect(t.maxSpeed).toBeLessThanOrEqual(baseSpeed * (1 + jitter));
      expect(t.boldness).toBeGreaterThanOrEqual(config.traits.boldnessMin);
      expect(t.boldness).toBeLessThanOrEqual(config.traits.boldnessMax);
      expect(t.sociability).toBeGreaterThanOrEqual(config.traits.sociabilityMin);
      expect(t.sociability).toBeLessThanOrEqual(config.traits.sociabilityMax);
    }
  });

  it("produces different traits on consecutive calls (not constant)", () => {
    const rng = makeRng(7);
    const a = rollSheepTraits(rng);
    const b = rollSheepTraits(rng);
    // At least one field differs (they are random, not a constant)
    const same = a.maxSpeed === b.maxSpeed && a.boldness === b.boldness && a.sociability === b.sociability;
    expect(same).toBe(false);
  });

  it("is reproducible: same seed gives same sequence", () => {
    const t1 = rollSheepTraits(makeRng(99));
    const t2 = rollSheepTraits(makeRng(99));
    expect(t1.maxSpeed).toBeCloseTo(t2.maxSpeed);
    expect(t1.boldness).toBeCloseTo(t2.boldness);
    expect(t1.sociability).toBeCloseTo(t2.sociability);
  });
});

describe("createSheep thirst drive", () => {
  it("initialises thirst to 0", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    expect(s.drives.thirst).toBe(0);
  });
});
```
Run `npx vitest run packages/motor/src/entities/Sheep.test.ts` → FAIL (`rollSheepTraits` not exported; `boldness` not on `SheepTraits`).

- [ ] **Step 3: Implement**

Replace `packages/motor/src/entities/Sheep.ts` entirely:
```ts
import type { Vec2 } from "@getback/math";
import type { Rng } from "@getback/math";
import type { Mobile } from "../types.js";
import type { BehaviorNode } from "../steering/types.js";
import { config } from "../config.js";
import { buildSheepTree } from "../ai/trees.js";

export interface SheepTraits {
  maxSpeed: number;
  maxForce: number;
  personalSpace: number;
  perception: number;
  sociability: number; // [0..1] scales cohesion + follow
  boldness: number;    // [0..1] low = skittish; wired into fear recovery in Plan 14
}

export interface Sheep extends Mobile {
  traits: SheepTraits;
  drives: { hunger: number; thirst: number; fear: number }; // each [0..1]
  penned: boolean;
  neighbors: Sheep[]; // refilled each frame by NeighborhoodSystem
  root: BehaviorNode;
}

// Deterministic baseline — used by all existing tests. Never remove.
export function defaultSheepTraits(): SheepTraits {
  return {
    maxSpeed: config.flock.maxSpeed,
    maxForce: config.flock.maxForce,
    personalSpace: config.flock.personalSpace,
    perception: config.flock.perception,
    sociability: 1,
    boldness: 1,
  };
}

// Randomised traits for a fresh sheep at spawn (§8.5). Seeded so the herd is
// reproducible. boldness is stored here; FearSystem wires it in Plan 14.
export function rollSheepTraits(rng: Rng): SheepTraits {
  const t = config.traits;
  const baseSpeed = config.flock.maxSpeed;
  return {
    maxSpeed: rng.range(baseSpeed * (1 - t.maxSpeedJitter), baseSpeed * (1 + t.maxSpeedJitter)),
    maxForce: config.flock.maxForce,
    personalSpace: config.flock.personalSpace,
    perception: config.flock.perception,
    sociability: rng.range(t.sociabilityMin, t.sociabilityMax),
    boldness: rng.range(t.boldnessMin, t.boldnessMax),
  };
}

export function createSheep(pos: Vec2, traits: SheepTraits): Sheep {
  return {
    pos: { x: pos.x, y: pos.y },
    prevPos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: config.flock.radius,
    maxSpeed: traits.maxSpeed,
    maxForce: traits.maxForce,
    facing: "down",
    traits,
    drives: { hunger: 0, thirst: 0, fear: 0 },
    penned: false,
    neighbors: [],
    root: buildSheepTree(traits),
  };
}
```

- [ ] **Step 4: Run → PASS**

Run `npx vitest run packages/motor/src/entities/Sheep.test.ts` → all pass (existing + new).
Run `npm test` → ALL pass (the new `thirst` field in drives doesn't break any existing test because existing tests only read `hunger` and `fear`).
Run `npm run typecheck` → exit 0.

- [ ] **Step 5: Export + commit**

In `packages/motor/src/index.ts`, find the line:
```ts
export { createSheep, defaultSheepTraits } from "./entities/Sheep.js";
```
Replace with:
```ts
export { createSheep, defaultSheepTraits, rollSheepTraits } from "./entities/Sheep.js";
```

```bash
git add packages/motor/src/entities/Sheep.ts packages/motor/src/entities/Sheep.test.ts packages/motor/src/config.ts packages/motor/src/index.ts
git commit -m "Add thirst drive, boldness trait, and rollSheepTraits to Sheep"
```

---

### Task 3: Extend `DriveSystem` with thirst + drinking

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/systems/DriveSystem.ts`
- Modify: `packages/motor/src/systems/DriveSystem.test.ts`

- [ ] **Step 1: Add thirst/drink config**

In `packages/motor/src/config.ts`, the current drives line is:
```ts
  drives: { hungerRate: 0.05, grazeRate: 0.5 },
```
Replace it with:
```ts
  drives: { hungerRate: 0.05, grazeRate: 0.5, thirstRate: 0.03, drinkRate: 0.6 },
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/motor/src/systems/DriveSystem.test.ts`:
```ts
import type { Attractor } from "../entities/Attractor.js";
import { createAttractor } from "../entities/Attractor.js";

describe("driveSystem — thirst", () => {
  it("raises thirst over time (no water nearby)", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    driveSystem([s], bare, [], 1);
    expect(s.drives.thirst).toBeCloseTo(0.03);
  });

  it("reduces thirst while sheep is inside a water attractor", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const water: Attractor = createAttractor("water", { x: 25, y: 25 }, 30);
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.thirst = 0.5;
    driveSystem([s], bare, [water], 1);
    // net = 0.5 + 0.03 - 0.6 = -0.07 => clamped to 0
    expect(s.drives.thirst).toBe(0);
  });

  it("does not reduce thirst when outside the water radius", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const water: Attractor = createAttractor("water", { x: 200, y: 200 }, 20);
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    driveSystem([s], bare, [water], 1);
    expect(s.drives.thirst).toBeCloseTo(0.03);
  });

  it("clamps thirst to [0,1]", () => {
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.thirst = 0.99;
    // Run 10 seconds without water: would reach >1
    driveSystem([s], bare, [], 10);
    expect(s.drives.thirst).toBe(1);
  });

  it("hunger still rises even while fleeing (no dependency on behavior)", () => {
    // DriveSystem is behavior-agnostic — it always ticks hunger and thirst
    const bare = createGrassField({ cols: 5, rows: 5, cellSize: 10, regrowRate: 0, depleteRate: 0, initial: 0 });
    const s = createSheep({ x: 25, y: 25 }, defaultSheepTraits());
    s.drives.fear = 1; // maximally afraid
    driveSystem([s], bare, [], 1);
    expect(s.drives.hunger).toBeGreaterThan(0); // hunger still ticked
    expect(s.drives.thirst).toBeGreaterThan(0); // thirst still ticked
  });
});
```
Run `npx vitest run packages/motor/src/systems/DriveSystem.test.ts` → FAIL (driveSystem signature mismatch, `thirst` missing).

- [ ] **Step 3: Implement**

Replace `packages/motor/src/systems/DriveSystem.ts`:
```ts
import type { GrassField } from "../grass/GrassField.js";
import { densityAt } from "../grass/GrassField.js";
import type { Sheep } from "../entities/Sheep.js";
import type { Attractor } from "../entities/Attractor.js";
import { config } from "../config.js";

// Hunger and thirst rise every frame regardless of behavior (§8.1: "they keep
// rising even while fleeing"). Hunger falls while grazing (proportional to local
// grass density). Thirst falls while the sheep is inside a water attractor radius.
// All drives are clamped to [0,1].
export function driveSystem(
  sheep: Sheep[],
  grass: GrassField,
  attractors: readonly Attractor[],
  dt: number,
): void {
  const { hungerRate, grazeRate, thirstRate, drinkRate } = config.drives;
  for (const s of sheep) {
    // hunger
    const dens = densityAt(grass, s.pos.x, s.pos.y);
    const nextHunger = s.drives.hunger + hungerRate * dt - grazeRate * dens * dt;
    s.drives.hunger = nextHunger < 0 ? 0 : nextHunger > 1 ? 1 : nextHunger;

    // thirst: check if inside any water attractor
    let drinking = false;
    for (const a of attractors) {
      if (a.kind !== "water") continue;
      const dx = s.pos.x - a.pos.x;
      const dy = s.pos.y - a.pos.y;
      if (dx * dx + dy * dy <= a.radius * a.radius) {
        drinking = true;
        break;
      }
    }
    const nextThirst = s.drives.thirst + thirstRate * dt - (drinking ? drinkRate * dt : 0);
    s.drives.thirst = nextThirst < 0 ? 0 : nextThirst > 1 ? 1 : nextThirst;
  }
}
```

- [ ] **Step 4: Fix the call sites**

`DriveSystem` now takes `attractors` as its third argument. The only call site is `packages/motor/src/world/Game.ts`. Read that file and update the `driveSystem` call from:
```ts
driveSystem(sheep, world.grass, dt);
```
to:
```ts
driveSystem(sheep, world.grass, world.attractors, dt);
```
(The `attractors` array is added to `World` in Task 5. Until then, pass an empty array literal `[]` as a temporary shim — this is fine because Task 5 is the very next World task and this plan is run sequentially.)

- [ ] **Step 5: Run → PASS**

Run `npx vitest run packages/motor/src/systems/DriveSystem.test.ts` → all pass (existing 3 + new 5).
Run `npm test` → ALL pass (Game.ts compiles with the updated call; the `thirst` field on `sheep.drives` doesn't break any existing test).
Run `npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/systems/DriveSystem.ts packages/motor/src/systems/DriveSystem.test.ts packages/motor/src/world/Game.ts
git commit -m "Extend DriveSystem with thirst drive and water-attractor drinking"
```

---

### Task 4: Thread attractors into `SteerContext` / `SteerEnv`

**Files:**
- Modify: `packages/motor/src/steering/types.ts`
- Modify: `packages/motor/src/systems/SteeringSystem.ts`

These fields are **optional** so every existing `SteerContext` literal (in `behaviors.test.ts`, `Behavior.test.ts`, `combinators.test.ts`, `NeighborhoodSystem.test.ts`) keeps compiling unchanged. No behavior reads them until Task 5 adds the readers, so the suite stays green.

- [ ] **Step 1: Grow `SteerContext`**

In `packages/motor/src/steering/types.ts`, add the `Attractor` type import at the top (after the existing imports):
```ts
import type { Attractor } from "../entities/Attractor.js";
```
Add two optional fields to `SteerContext` after `penCentroid?`:
```ts
  water?: Attractor | null;  // nearest/only water attractor, if any; read by drink leaf
  shade?: Attractor | null;  // nearest/only shade attractor, if any; read by rest leaf
```

- [ ] **Step 2: Grow `SteerEnv` and populate ctx**

In `packages/motor/src/systems/SteeringSystem.ts`, add the `Attractor` import:
```ts
import type { Attractor } from "../entities/Attractor.js";
```
Add optional fields to `SteerEnv`:
```ts
export interface SteerEnv {
  grass: GrassField;
  obstacles: readonly Obstacle[];
  stress: readonly StressSource[];
  pen?: Pen | null;
  water?: Attractor | null;
  shade?: Attractor | null;
}
```
Populate the two new ctx fields in the per-sheep loop. The full ctx object becomes:
```ts
    const ctx: SteerContext = {
      neighbors: s.neighbors,
      grass: env.grass,
      obstacles: env.obstacles,
      stress: env.stress,
      fear: s.drives.fear,
      dt,
      penned: s.penned,
      penCentroid: env.pen ? env.pen.centroid : null,
      water: env.water ?? null,
      shade: env.shade ?? null,
    };
```

- [ ] **Step 3: Verify (no behaviour change yet)**

Run `npm run typecheck` → exit 0.
Run `npm test` → ALL pass (optional fields, no reader yet).

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/systems/SteeringSystem.ts
git commit -m "Thread water and shade attractors into SteerContext and SteerEnv"
```

---

### Task 5: `World` gains `attractors`; `Game` wires env

**Files:**
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/World.test.ts`
- Modify: `packages/motor/src/world/Game.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/motor/src/world/World.test.ts`:
```ts
import { createAttractor } from "../entities/Attractor.js";

describe("createWorld attractors", () => {
  it("defaults to an empty attractors array", () => {
    const w = createWorld();
    expect(Array.isArray(w.attractors)).toBe(true);
    expect(w.attractors.length).toBe(0);
  });

  it("accepts a provided attractors list", () => {
    const water = createAttractor("water", { x: 100, y: 100 }, 24);
    const w = createWorld([], undefined, [], null, null, undefined, [water]);
    expect(w.attractors).toHaveLength(1);
    expect(w.attractors[0]).toBe(water);
  });
});
```
Run `npx vitest run packages/motor/src/world/World.test.ts` → FAIL (createWorld has no `attractors` param; `World` has no `attractors` field).

- [ ] **Step 2: Implement**

In `packages/motor/src/world/World.ts`, add the `Attractor` import:
```ts
import type { Attractor } from "../entities/Attractor.js";
```
Add `attractors: Attractor[]` to the `World` interface (after `obstacles`):
```ts
  attractors: Attractor[];
```
Add `attractors` as the last optional parameter of `createWorld` (after `rng`):
```ts
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
```

- [ ] **Step 3: Wire into `Game.ts`**

In `packages/motor/src/world/Game.ts`, find the `steeringSystem` call. It currently passes `{ grass: world.grass, obstacles: world.obstacles, stress: world.stress, pen: world.pen }`. Update it to also pass the first water and shade attractors found in `world.attractors`:
```ts
    // Resolve the primary water + shade attractors for the steering context
    // (first of each kind; later plans may use nearest-neighbour lookup).
    const water = world.attractors.find(a => a.kind === "water") ?? null;
    const shade = world.attractors.find(a => a.kind === "shade") ?? null;
    steeringSystem(sheep, {
      grass: world.grass,
      obstacles: world.obstacles,
      stress: world.stress,
      pen: world.pen,
      water,
      shade,
    }, dt);
```
Also remove the temporary empty-array shim from Task 3 if it was added as a literal `[]` — replace it with `world.attractors`:
```ts
    driveSystem(sheep, world.grass, world.attractors, dt);
```

- [ ] **Step 4: Run → PASS**

Run `npx vitest run packages/motor/src/world/World.test.ts` → all pass (existing + new).
Run `npm test` → ALL pass.
Run `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/World.ts packages/motor/src/world/World.test.ts packages/motor/src/world/Game.ts
git commit -m "Add attractors list to World and wire water/shade into SteerEnv"
```

---

### Task 6: `drink`, `rest`, `thirstIsTop`, `hungerIsTop` leaf behaviors

**Files:**
- Modify: `packages/motor/src/ai/behaviors.ts`
- Modify: `packages/motor/src/ai/behaviors.test.ts`
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Add drink/rest weights to config**

In `packages/motor/src/config.ts`, the current lines are:
```ts
  graze: { weight: 1.0 },
```
Add immediately after that line:
```ts
  drink: { weight: 1.4 },  // higher than graze: thirst is more urgent
  rest:  { weight: 0.5 },  // lower than graze: shade is only the idle default
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/motor/src/ai/behaviors.test.ts`:
```ts
import { drink, rest, thirstIsTop, hungerIsTop } from "./behaviors.js";
import type { Sheep } from "../entities/Sheep.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { createAttractor } from "../entities/Attractor.js";

function sheepAgent(drives: { hunger: number; thirst: number; fear: number }): Sheep {
  const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
  s.drives = drives;
  return s;
}

describe("drink", () => {
  it("steers toward the water attractor when ctx.water is set", () => {
    const s = sheepAgent({ hunger: 0.3, thirst: 0.8, fear: 0 });
    const water = createAttractor("water", { x: 100, y: 0 }, 24);
    const out = { x: 0, y: 0 };
    const status = drink(24).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, water },
      out,
    );
    expect(status).toBe("fired");
    expect(out.x).toBeGreaterThan(0); // steers toward +x water
  });

  it("skips with zero force when ctx.water is absent", () => {
    const s = sheepAgent({ hunger: 0, thirst: 1, fear: 0 });
    const out = { x: 1, y: 1 };
    const status = drink(24).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 },
      out,
    );
    expect(status).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it("produces zero force when already at the water centre", () => {
    const s = sheepAgent({ hunger: 0, thirst: 1, fear: 0 });
    const water = createAttractor("water", { x: 0, y: 0 }, 24);
    const out = { x: 99, y: 99 };
    drink(24).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, water },
      out,
    );
    // `arrive` at distance 0 returns -vel (which is 0 for a stationary sheep)
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0);
  });
});

describe("rest", () => {
  it("steers toward the shade attractor when ctx.shade is set", () => {
    const s = sheepAgent({ hunger: 0.3, thirst: 0.1, fear: 0 });
    const shade = createAttractor("shade", { x: 0, y: 80 }, 28);
    const out = { x: 0, y: 0 };
    const status = rest(28).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, shade },
      out,
    );
    expect(status).toBe("fired");
    expect(out.y).toBeGreaterThan(0); // steers toward +y shade
  });

  it("skips with zero force when ctx.shade is absent", () => {
    const s = sheepAgent({ hunger: 0, thirst: 0, fear: 0 });
    const out = { x: 1, y: 1 };
    const status = rest(28).run(
      s,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 },
      out,
    );
    expect(status).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("thirstIsTop", () => {
  it("is true when thirst > hunger", () => {
    const s = sheepAgent({ hunger: 0.3, thirst: 0.8, fear: 0 });
    expect(thirstIsTop(s, { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 })).toBe(true);
  });
  it("is false when hunger >= thirst", () => {
    const s = sheepAgent({ hunger: 0.8, thirst: 0.3, fear: 0 });
    expect(thirstIsTop(s, { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 })).toBe(false);
  });
  it("is false when drives are equal (hunger wins the tie)", () => {
    const s = sheepAgent({ hunger: 0.5, thirst: 0.5, fear: 0 });
    expect(thirstIsTop(s, { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 })).toBe(false);
  });
});

describe("hungerIsTop", () => {
  it("is true when hunger > thirst", () => {
    const s = sheepAgent({ hunger: 0.9, thirst: 0.1, fear: 0 });
    expect(hungerIsTop(s, { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 })).toBe(true);
  });
  it("is false when thirst > hunger", () => {
    const s = sheepAgent({ hunger: 0.1, thirst: 0.9, fear: 0 });
    expect(hungerIsTop(s, { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 })).toBe(false);
  });
});
```
Run `npx vitest run packages/motor/src/ai/behaviors.test.ts` → FAIL (`drink`/`rest`/`thirstIsTop`/`hungerIsTop` not exported; `Sheep` not accepted by `run`).

Note: the `behaviors.test.ts` file builds `SteerContext` inline as an object literal — the new optional `water?` and `shade?` fields compile without edits because they are optional.

- [ ] **Step 3: Implement**

In `packages/motor/src/ai/behaviors.ts`:

The file currently imports `BehaviorNode, Predicate` from `./steering/types.js`. We need to also read `Attractor` from entities. Ensure the import block at the top of the file reads:
```ts
import type { Mobile } from "../types.js";
import type { BehaviorNode, Predicate } from "../steering/types.js";
import { seek, arrive } from "../steering/primitives.js";
import { gradientAt } from "../grass/GrassField.js";
```
(No change needed for `seek` and `arrive` — `arrive` was already imported in Plan 12 for `penInterior`.)

Append at the END of the file (after `isPenned`):
```ts
// Arrive at the water attractor. Skips (zero force) when ctx.water is absent
// (no water hole on the map). Weight in the tree scales with thirst config.
export function drink(slowRadius: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      const w = ctx.water;
      if (!w) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      arrive(e, w.pos, slowRadius, out);
      return "fired";
    },
  };
}

// Arrive at the shade attractor (low-weight idle default). Skips when no shade
// is available. Weight in the tree is lower than graze/drink.
export function rest(slowRadius: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      const s = ctx.shade;
      if (!s) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      arrive(e, s.pos, slowRadius, out);
      return "fired";
    },
  };
}

// True when thirst is the strictly dominant drive (beats hunger).
// Sheep reads ctx.self implicitly via the `e` argument — but drives live on
// the Sheep entity, which is a Mobile with an extra `drives` property.
// We cast: Sheep always has drives; the tree is only used on sheep.
export const thirstIsTop: Predicate = (e, _ctx) => {
  const s = e as { drives?: { hunger: number; thirst: number } };
  if (!s.drives) return false;
  return s.drives.thirst > s.drives.hunger;
};

// True when hunger is the strictly dominant drive (thirst <= hunger).
export const hungerIsTop: Predicate = (e, _ctx) => {
  const s = e as { drives?: { hunger: number; thirst: number } };
  if (!s.drives) return false;
  return s.drives.hunger > s.drives.thirst;
};
```

- [ ] **Step 4: Run → PASS**

Run `npx vitest run packages/motor/src/ai/behaviors.test.ts` → all pass (existing + new).
Run `npm run typecheck` → exit 0.

- [ ] **Step 5: Export + commit**

In `packages/motor/src/index.ts`, find the behaviors export line:
```ts
export { separation, cohesion, follow, graze, obstacleAvoid, fleeStress } from "./ai/behaviors.js";
```
Replace with:
```ts
export { separation, cohesion, follow, graze, obstacleAvoid, fleeStress, penInterior, isPenned, drink, rest, thirstIsTop, hungerIsTop } from "./ai/behaviors.js";
```

```bash
git add packages/motor/src/config.ts packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts packages/motor/src/index.ts
git commit -m "Add drink, rest, thirstIsTop, hungerIsTop behavior leaves"
```

---

### Task 7: Goal-selector cascade in the sheep tree + integration tests

**Files:**
- Modify: `packages/motor/src/ai/trees.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Rewire `buildSheepTree`**

Replace the body of `packages/motor/src/ai/trees.ts` with:
```ts
import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { selector, conditional } from "../steering/combinators.js";
import {
  separation, cohesion, follow, graze, obstacleAvoid, fleeStress,
  penInterior, isPenned, drink, rest, thirstIsTop, hungerIsTop,
} from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root behavior tree (§2.2 / §8.2).
//
// Root: selector([
//   conditional(isPenned, pennedBlend),   <- from Plan 12, unchanged
//   flockingBlend,
// ])
//
// flockingBlend contains a GOAL sub-selector in place of the old single graze:
//   selector([
//     conditional(thirstIsTop, drink),    <- highest drive wins
//     conditional(hungerIsTop, graze),
//     rest,                               <- idle default: loiter at shade
//   ])
//
// Built per-sheep so traits bake in. Trees are stateless and shareable.
export function buildSheepTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  const slowR = config.attractor.shadeRadius;

  // Goal cascade: pick the dominant drive or default to rest at shade.
  const goalNode = selector([
    conditional(thirstIsTop, drink(config.attractor.waterRadius)),
    conditional(hungerIsTop, graze()),
    rest(slowR),
  ]);

  const flocking = blend([
    { node: fleeStress(),                                            weight: config.flee.weight },
    { node: obstacleAvoid(config.obstacleAvoid.avoidRadius),        weight: config.obstacleAvoid.weight },
    { node: goalNode,                                                weight: config.graze.weight },
    { node: separation(traits.personalSpace),                        weight: w.separation },
    { node: cohesion(config.flock.cohesionK),                       weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold),                     weight: w.follow * traits.sociability },
  ]);

  const pennedBlend = blend([
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: penInterior(config.pen.settleRadius), weight: config.pen.settleWeight },
  ]);

  return selector([
    conditional(isPenned, pennedBlend),
    flocking,
  ]);
}
```

- [ ] **Step 2: Run the existing suite (expect green)**

Run `npm test`. All tests must pass — the `graze()` leaf was replaced by the goal selector, but the existing integration tests use `defaultSheepTraits()` and don't place water/shade attractors, so `thirstIsTop` and `hungerIsTop` are initially false (drives start at 0), `thirstIsTop` false, `hungerIsTop` false → `rest` fires but has `ctx.shade = null` → skips → the selector skips → the slot contributes 0 force. Net behavior: same as before (existing tests remain green). Report the total.

- [ ] **Step 3: Write integration tests (thirsty sheep drinks; shade sheep rests)**

Append to `packages/motor/src/world/Game.test.ts`:
```ts
import { createAttractor, createTree } from "../entities/Attractor.js";

describe("drive goal cascade integration", () => {
  it("a thirsty sheep near water moves toward it and thirst falls", () => {
    // Place water east of the sheep. Sheep starts with full thirst (1.0).
    const water = createAttractor("water", { x: 300, y: 135 }, 24);
    const s = createSheep({ x: 100, y: 135 }, defaultSheepTraits());
    s.drives.thirst = 1.0;
    s.drives.hunger = 0.0;
    const world = createWorld([s], undefined, [], null, null, undefined, [water]);
    const game = new Game(world);

    // Run 5 seconds. The sheep should travel toward x=300.
    for (let i = 0; i < 300; i++) game.update(1 / 60);

    expect(s.pos.x).toBeGreaterThan(150); // moved toward water
    // Once inside the water radius thirst should have fallen from the max
    expect(s.drives.thirst).toBeLessThan(1.0);
  });

  it("a hungry (not thirsty) sheep follows the grass gradient, not water", () => {
    const water = createAttractor("water", { x: 300, y: 135 }, 24);
    // Lush grass to the west (low x); water is to the east (x=300)
    const grass = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < 30; cx++) {
      const d = 1 - (cx / 29); // 1.0 at west, 0 at east
      for (let cy = 0; cy < 18; cy++) setDensityAt(grass, cx * 16 + 8, cy * 16 + 8, d);
    }
    const s = createSheep({ x: 240, y: 135 }, defaultSheepTraits());
    s.drives.hunger = 1.0;
    s.drives.thirst = 0.0;
    const world = createWorld([s], grass, [], null, null, undefined, [water]);
    const game = new Game(world);

    for (let i = 0; i < 300; i++) game.update(1 / 60);

    // Hungry sheep should move WEST (toward grass), not east (toward water)
    expect(s.pos.x).toBeLessThan(240);
  });

  it("a sheep at a tree rests in shade (createTree integration)", () => {
    // createTree gives us both a trunk obstacle and a shade attractor.
    const { obstacle, shade } = createTree({ x: 240, y: 135 });
    const s = createSheep({ x: 100, y: 135 }, defaultSheepTraits());
    s.drives.hunger = 0.0;
    s.drives.thirst = 0.0;
    const world = createWorld([s], undefined, [obstacle], null, null, undefined, [shade]);
    const game = new Game(world);

    for (let i = 0; i < 300; i++) game.update(1 / 60);

    // Sheep should have moved toward the shade (x=240, within shadeRadius=28)
    expect(s.pos.x).toBeGreaterThan(150);
    // Must NOT have entered the solid trunk (obstacle.radius=7, centred at x=240)
    const dx = s.pos.x - obstacle.pos.x;
    const dy = s.pos.y - obstacle.pos.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(obstacle.radius + s.radius - 1);
  });
});
```

- [ ] **Step 4: Run → PASS**

Run `npx vitest run packages/motor/src/world/Game.test.ts` → all pass (existing + new 3).
Run `npm test` → ALL pass.
Run `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/ai/trees.ts packages/motor/src/world/Game.test.ts
git commit -m "Replace single graze with goal-selector cascade in sheep tree"
```

---

### Task 8: Export all new symbols + final sweep

**Files:**
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Audit barrel exports**

Read `packages/motor/src/index.ts`. Verify the following exports are present (add any that are missing):
```ts
export type { Attractor, AttractorKind } from "./entities/Attractor.js";
export { createAttractor, createTree } from "./entities/Attractor.js";
export { rollSheepTraits } from "./entities/Sheep.js";
export { separation, cohesion, follow, graze, obstacleAvoid, fleeStress, penInterior, isPenned, drink, rest, thirstIsTop, hungerIsTop } from "./ai/behaviors.js";
```
Also verify `driveSystem` (already exported since Plan earlier) is still on the right signature — its type changed to accept `attractors` as the third arg. The export line itself doesn't need changing (it re-exports the function by name); just confirm it is present.

- [ ] **Step 2: Final run**

Run `npm test` → ALL pass. Report the total count.
Run `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/motor/src/index.ts
git commit -m "Barrel-export all Plan 13 symbols"
```

---

## Self-review

**Scope item → task mapping:**

| Scope item                                                             | Task          |
| ---------------------------------------------------------------------- | ------------- |
| 1. `Attractor` type + `createAttractor` factory                        | Task 1        |
| 2. Trees carry shade: `createTree` returns `{ obstacle, shade }`       | Task 1        |
| 3. `thirst` drive + `DriveSystem` extended with drinking               | Tasks 2, 3    |
| 4. `drink` / `rest` leaves + `thirstIsTop` / `hungerIsTop` predicates  | Task 6        |
| 5. Goal selector cascade in `ai/trees.ts`; Plan 12 root intact         | Task 7        |
| 6. `water?` / `shade?` threaded into `SteerContext` / `SteerEnv`       | Task 4        |
| 7. `boldness` in `SheepTraits` + `rollSheepTraits(rng)`                | Task 2        |
| 8. `World` gains `attractors: Attractor[]`                             | Task 5        |
| 9. Config additions (`thirstRate`, `drinkRate`, radii, trait ranges)   | Tasks 1, 2, 3 |

**Placeholder scan:** none — every step shows complete TypeScript source and an exact `npx vitest run` / `npm test` / `npm run typecheck` command with expected output.

**Type consistency:**
- `Attractor: { kind: AttractorKind; pos: Vec2; radius: number }` — plain data, no class.
- `createTree(pos: Vec2): { obstacle: Obstacle; shade: Attractor }` — factory, not a subclass.
- `SheepTraits.boldness: number` — added alongside existing fields; `defaultSheepTraits()` returns `boldness: 1`; `rollSheepTraits(rng: Rng)` returns randomised. `boldness` is NOT yet read by `FearSystem` (see Plan 14 note in comment).
- `Sheep.drives: { hunger: number; thirst: number; fear: number }` — `thirst` added; all existing tests only read `hunger`/`fear` so they compile unchanged.
- `driveSystem(sheep, grass, attractors, dt)` — signature extended; the only call site in `Game.ts` is updated in Task 3 step 4.
- `SteerContext.water?: Attractor | null`, `SteerContext.shade?: Attractor | null` — OPTIONAL; the ~20 existing ctx literals in tests compile unchanged.
- `SteerEnv.water?: Attractor | null`, `SteerEnv.shade?: Attractor | null` — OPTIONAL; the env literal in `NeighborhoodSystem.test.ts` compiles unchanged.
- `drink(slowRadius: number): BehaviorNode` uses `arrive` from `steering/primitives.ts`. `rest(slowRadius)` same.
- `thirstIsTop: Predicate` / `hungerIsTop: Predicate` cast `e` to a duck-type to read `drives` (tree is only built for sheep, so this cast is safe).
- `config.attractor.trunkRadius / shadeRadius / waterRadius` — consumed by `createTree` and `buildSheepTree`.
- `config.traits.*` — consumed by `rollSheepTraits` only.
- `config.drives.thirstRate / drinkRate` — consumed by `DriveSystem`.
- `config.drink.weight` / `config.rest.weight` — available for future fine-tuning; not yet read by `buildSheepTree` (the goal slot inherits `config.graze.weight` for the whole sub-selector, matching the original single-leaf weight).

---

## Next plans

**Plan 14 — Motor: Emitter, Pool & Spawn:** treat entities, `Emitter`, `AgentPool`, `BuffSystem`, `ambientScare` signal, richer `GameSignals`, and boldness wired into `FearSystem` fear-decay scaling.
