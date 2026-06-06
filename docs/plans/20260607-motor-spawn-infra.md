# Motor: Emitter, Pool & Spawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `AgentPool<T>`, `Emitter`, and `SpawnSystem` as generic, reusable infrastructure; then refactor `RespawnSystem` to route through them on every pen-fill, so penned sheep return to the pool and a fresh flock is emitted from the far side of the pasture — eliminating GC churn in the endless loop.

**Architecture:** `AgentPool<T>` is a headless, generic free-list that decouples object creation from object use. `Emitter` is a declarative spawner that accumulates time, samples spawn positions from a geometry, and returns position requests without touching entities. `SpawnSystem` bridges them: it ticks the Emitter, acquires sheep from the pool, and pushes them into `world.sheep`. `RespawnSystem` orchestrates the respawn cycle: on pen-fill it releases penned sheep back to the pool, generates a new pen, repositions the Emitter's area to the far side, then triggers an immediate emit so the fresh flock appears in the same frame — preserving the observable `penFilled` + fresh-flock behaviour the existing tests assert.

**Tech Stack:** TypeScript 5 strict, ESM with `.js` import extensions. Vitest 2 (`npx vitest run <path>` per-file, `npm test` suite, `npm run typecheck`). `Vec2`, `Rng`, `makeRng` from `@getback/math`. `Signal` from `@getback/signal`. Motor stays Pixi-free/headless. One-line imperative commits per task.

---

## Key facts

- `world.rng` is a seedable `Rng` (xoroshiro128+) that all systems consume in order; all randomness routes through it to stay deterministic.
- `config.bounds` is `{ x: 0, y: 0, w: 480, h: 270 }` — the 480×270 pasture.
- `respawnSystem` currently: emits `penFilled`, builds a new pen, and does `world.sheep = fresh` (reassigns the array reference). The existing tests assert: signal fires once, `world.pen !== old pen`, `world.sheep.length === count`, none of the old sheep identity present, all fresh sheep outside the new pen.
- `Game.test.ts`'s "respawn integration" test (line 270–306) additionally asserts `world.sheep[0] !== sheep[0]` (fresh identity) and checks that a subsequent 30-frame run does NOT re-respawn (fresh flock is scattered, not penned). Both assertions remain valid after the refactor.
- `createSheep(pos, traits)` and `defaultSheepTraits()` already exist in `entities/Sheep.ts`. `rollSheepTraits(rng)` is added by Plan 13 (merged before this plan); REUSE it. This plan's Task 1 adds only `resetSheep`.
- The sheep Emitter is stored in `world.sheepEmitter`; the pool in `world.sheepPool`. Both are optional (`| null`) initially so existing `createWorld(...)` callers compile unchanged; Task 5 wires them in for full game use.
- SpawnSystem is added to `Game.ts`'s pipeline at step 12 (after PickupSystem placeholder position), but on a fresh world `world.sheepEmitter` and `world.sheepPool` may be null — SpawnSystem guards for this. RespawnSystem drives the respawn emit directly (immediate flock on fill) rather than waiting for the next SpawnSystem tick, so the fresh flock appears in the same frame as `penFilled`.
- The "far side" of the pasture from the new pen is computed as: find the pen centroid, mirror it through the pasture centre, inset by `config.spawn.areaInset` on each side to define the Emitter rect.

## File structure (created/modified)

| Path                                                            | Responsibility                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/motor/src/world/Pool.ts`                              | CREATE: `AgentPool<T>` generic free-list pool                |
| `packages/motor/src/world/Pool.test.ts`                         | CREATE: pool unit tests                                      |
| `packages/motor/src/world/Emitter.ts`                           | CREATE: declarative spawner config + `update(dt)` + geometry |
| `packages/motor/src/world/Emitter.test.ts`                      | CREATE: emitter unit tests                                   |
| `packages/motor/src/systems/SpawnSystem.ts`                     | CREATE: tick emitter + acquire from pool + push to world     |
| `packages/motor/src/systems/SpawnSystem.test.ts`                | CREATE: spawn system tests                                   |
| `packages/motor/src/entities/Sheep.ts`                          | MODIFY: add `resetSheep(s, pos)` (rollSheepTraits already added by Plan 13) |
| `packages/motor/src/entities/Sheep.test.ts`                     | MODIFY: add tests for new helpers                            |
| `packages/motor/src/config.ts`                                  | MODIFY: add `spawn` block                                    |
| `packages/motor/src/world/World.ts`                             | MODIFY: add `sheepPool`, `sheepEmitter` fields               |
| `packages/motor/src/systems/RespawnSystem.ts`                   | MODIFY: release to pool + repoint emitter + emit fresh flock |
| `packages/motor/src/systems/RespawnSystem.test.ts`              | MODIFY: keep green + add pool-recycle assertion              |
| `packages/motor/src/world/Game.ts`                              | MODIFY: add `spawnSystem` call at step 12                    |
| `packages/motor/src/index.ts`                                   | MODIFY: export new symbols                                   |

---

### Task 1: `resetSheep(sheep, pos)` helper

Prerequisite helper used by Pool factory and SpawnSystem. `rollSheepTraits(rng)` is added by Plan 13 (merged before this plan); REUSE it. This plan's Task 1 adds only `resetSheep`.

**Files:**
- Modify: `packages/motor/src/entities/Sheep.ts`
- Modify: `packages/motor/src/entities/Sheep.test.ts`

- [ ] **Step 1: Write failing tests**

Open `packages/motor/src/entities/Sheep.test.ts` (already exists). Append:

```ts
import { describe, it, expect } from "vitest";
import { resetSheep, createSheep, defaultSheepTraits } from "./Sheep.js";

describe("resetSheep", () => {
  it("repositions the sheep and clears velocity, force, penned, drives", () => {
    const s = createSheep({ x: 100, y: 100 }, defaultSheepTraits());
    s.vel.x = 10; s.vel.y = -5;
    s.force.x = 3; s.force.y = 1;
    s.penned = true;
    s.drives.fear = 0.9;
    s.drives.hunger = 0.7;
    resetSheep(s, { x: 42, y: 77 });
    expect(s.pos).toEqual({ x: 42, y: 77 });
    expect(s.prevPos).toEqual({ x: 42, y: 77 });
    expect(s.vel).toEqual({ x: 0, y: 0 });
    expect(s.force).toEqual({ x: 0, y: 0 });
    expect(s.penned).toBe(false);
    expect(s.drives.fear).toBe(0);
    expect(s.drives.hunger).toBe(0);
    expect(s.neighbors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run + expect FAIL**

```
npx vitest run packages/motor/src/entities/Sheep.test.ts
```

Expected: FAIL — `resetSheep` is not exported.

- [ ] **Step 3: Implement in `Sheep.ts`**

Add to `packages/motor/src/entities/Sheep.ts` after `rollSheepTraits` (which already exists from Plan 13):

```ts
// Reset a recycled sheep in-place to a new spawn position.
// Used by the pool factory so existing object references stay valid.
export function resetSheep(sheep: Sheep, pos: Vec2): void {
  sheep.pos.x = pos.x;
  sheep.pos.y = pos.y;
  sheep.prevPos.x = pos.x;
  sheep.prevPos.y = pos.y;
  sheep.vel.x = 0;
  sheep.vel.y = 0;
  sheep.force.x = 0;
  sheep.force.y = 0;
  sheep.penned = false;
  sheep.drives.fear = 0;
  sheep.drives.hunger = 0;
  sheep.drives.thirst = 0;
  sheep.neighbors.length = 0;
}
```

Note: `Vec2` is already imported at the top of `Sheep.ts` (Plan 13 also imported `Rng` there for `rollSheepTraits`). No new imports needed.

- [ ] **Step 4: Run + expect PASS**

```
npx vitest run packages/motor/src/entities/Sheep.test.ts
```

Expected: PASS — all tests including prior ones.

```
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/entities/Sheep.ts packages/motor/src/entities/Sheep.test.ts
git commit -m "Add resetSheep helper to Sheep entity"
```

---

### Task 2: `AgentPool<T>` generic free-list

**Files:**
- Create: `packages/motor/src/world/Pool.ts`
- Create: `packages/motor/src/world/Pool.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/motor/src/world/Pool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AgentPool } from "./Pool.js";

describe("AgentPool", () => {
  it("creates new objects via the factory when the free list is empty", () => {
    let calls = 0;
    const pool = new AgentPool({ create: () => ({ id: calls++ }), reset: () => {} });
    const a = pool.acquire({ x: 0, y: 0 });
    const b = pool.acquire({ x: 0, y: 0 });
    expect(calls).toBe(2);
    expect(a).not.toBe(b);
  });

  it("reuses released objects (free list) before creating new ones", () => {
    let calls = 0;
    const pool = new AgentPool({
      create: () => ({ val: calls++ }),
      reset: (o) => { (o as { val: number }).val = -1; },
    });
    const a = pool.acquire({ x: 0, y: 0 });
    pool.release(a);
    const b = pool.acquire({ x: 1, y: 1 }); // should reuse `a`
    expect(b).toBe(a); // same object identity
    expect(calls).toBe(1); // factory called only once
  });

  it("calls reset on the object before returning it from the free list", () => {
    let resetCalled = false;
    const pool = new AgentPool({
      create: () => ({ dirty: true }),
      reset: (o) => { o.dirty = false; resetCalled = true; },
    });
    const a = pool.acquire({ x: 0, y: 0 });
    a.dirty = true;
    pool.release(a);
    resetCalled = false;
    pool.acquire({ x: 0, y: 0 });
    expect(resetCalled).toBe(true);
  });

  it("grows on demand: acquiring without prior releases always creates", () => {
    let calls = 0;
    const pool = new AgentPool({ create: () => calls++, reset: () => {} });
    pool.acquire({ x: 0, y: 0 });
    pool.acquire({ x: 0, y: 0 });
    pool.acquire({ x: 0, y: 0 });
    expect(calls).toBe(3);
  });

  it("released objects re-enter the free list, LIFO order", () => {
    const pool = new AgentPool({ create: () => ({}), reset: () => {} });
    const a = pool.acquire({ x: 0, y: 0 });
    const b = pool.acquire({ x: 0, y: 0 });
    pool.release(b);
    pool.release(a);
    expect(pool.acquire({ x: 0, y: 0 })).toBe(a); // LIFO: a was released last
    expect(pool.acquire({ x: 0, y: 0 })).toBe(b);
  });

  it("size reports total live (acquired) objects", () => {
    const pool = new AgentPool({ create: () => ({}), reset: () => {} });
    expect(pool.size).toBe(0);
    const a = pool.acquire({ x: 0, y: 0 });
    expect(pool.size).toBe(1);
    pool.acquire({ x: 0, y: 0 });
    expect(pool.size).toBe(2);
    pool.release(a);
    expect(pool.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run + expect FAIL**

```
npx vitest run packages/motor/src/world/Pool.test.ts
```

Expected: FAIL — cannot resolve `./Pool.js`.

- [ ] **Step 3: Implement `Pool.ts`**

Create `packages/motor/src/world/Pool.ts`:

```ts
import type { Vec2 } from "@getback/math";

export interface PoolOptions<T> {
  /** Called once to manufacture a brand-new instance. */
  create: () => T;
  /**
   * Called every time an object is re-acquired from the free list.
   * Must fully reset mutable state so the caller receives a clean object.
   * The `pos` argument is the spawn position passed to `acquire`; the
   * reset function may ignore it — position is applied by the caller (or
   * SpawnSystem) after acquisition.
   */
  reset: (obj: T) => void;
}

/**
 * Generic free-list object pool.  Eliminates per-sheep GC churn in the
 * endless flock respawn cycle.
 *
 * acquire(pos) — return a recycled or freshly manufactured object.
 * release(obj) — return `obj` to the free list for future re-use.
 * size           — count of currently live (acquired, not released) objects.
 */
export class AgentPool<T> {
  private readonly _free: T[] = [];
  private _live = 0;
  private readonly _opts: PoolOptions<T>;

  constructor(opts: PoolOptions<T>) {
    this._opts = opts;
  }

  acquire(_pos: Vec2): T {
    let obj: T;
    if (this._free.length > 0) {
      obj = this._free.pop()!;
      this._opts.reset(obj);
    } else {
      obj = this._opts.create();
    }
    this._live++;
    return obj;
  }

  release(obj: T): void {
    this._live--;
    this._free.push(obj);
  }

  get size(): number {
    return this._live;
  }
}
```

- [ ] **Step 4: Run + expect PASS**

```
npx vitest run packages/motor/src/world/Pool.test.ts
```

Expected: PASS — 6 tests green.

```
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/Pool.ts packages/motor/src/world/Pool.test.ts
git commit -m "Add AgentPool generic free-list object pool"
```

---

### Task 3: `Emitter` declarative spawner + geometry helpers

**Files:**
- Create: `packages/motor/src/world/Emitter.ts`
- Create: `packages/motor/src/world/Emitter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/motor/src/world/Emitter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { Emitter, rectGeometry, pointGeometry } from "./Emitter.js";

describe("Emitter — period accumulation", () => {
  it("produces no spawns before the period elapses", () => {
    const rng = makeRng(1);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 2,
      amount: 3,
      max: 10,
      rng,
    });
    const spawns = e.update(1.0); // less than period
    expect(spawns).toHaveLength(0);
  });

  it("produces `amount` spawn positions once period elapses", () => {
    const rng = makeRng(2);
    const e = new Emitter({
      geometry: rectGeometry({ x: 10, y: 20, w: 80, h: 60 }),
      period: 1,
      amount: 5,
      max: 20,
      rng,
    });
    const spawns = e.update(1.0);
    expect(spawns).toHaveLength(5);
    for (const p of spawns) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThan(90);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThan(80);
    }
  });

  it("does not emit again until another period elapses after the first", () => {
    const rng = makeRng(3);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 2,
      max: 20,
      rng,
    });
    e.update(1.0); // fires
    const second = e.update(0.5); // not yet
    expect(second).toHaveLength(0);
    const third = e.update(0.5); // exactly at boundary — fires
    expect(third).toHaveLength(2);
  });

  it("respects the max cap: does not emit if active >= max", () => {
    const rng = makeRng(4);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 3,
      max: 5,
      rng,
    });
    // Simulate 5 already active by calling acquire externally — use active setter
    e.active = 5;
    const spawns = e.update(1.0);
    expect(spawns).toHaveLength(0);
  });

  it("clamps emit amount so active never exceeds max", () => {
    const rng = makeRng(5);
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 5,
      max: 3,
      rng,
    });
    e.active = 1; // 2 slots remaining
    const spawns = e.update(1.0);
    expect(spawns).toHaveLength(2); // clamped to max - active
  });
});

describe("Emitter — exclusion predicate", () => {
  it("re-samples until it finds a position passing the predicate", () => {
    const rng = makeRng(6);
    // Geometry covering 0..100 × 0..100; reject anything with x < 50
    const e = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 20,
      max: 100,
      rng,
      exclude: (p) => p.x < 50,
    });
    const spawns = e.update(1.0);
    for (const p of spawns) expect(p.x).toBeGreaterThanOrEqual(50);
  });
});

describe("Emitter — immediate emit", () => {
  it("emitNow() returns positions regardless of accumulated time and resets accumulator", () => {
    const rng = makeRng(7);
    const e = new Emitter({
      geometry: pointGeometry({ x: 42, y: 77 }),
      period: 10,
      amount: 3,
      max: 20,
      rng,
    });
    const spawns = e.emitNow(3);
    expect(spawns).toHaveLength(3);
    for (const p of spawns) expect(p).toEqual({ x: 42, y: 77 });
  });
});

describe("pointGeometry", () => {
  it("always returns the fixed point", () => {
    const rng = makeRng(1);
    const g = pointGeometry({ x: 5, y: 9 });
    expect(g.sample(rng)).toEqual({ x: 5, y: 9 });
    expect(g.sample(rng)).toEqual({ x: 5, y: 9 });
  });
});

describe("rectGeometry", () => {
  it("samples uniformly inside the rect (all within bounds)", () => {
    const rng = makeRng(10);
    const g = rectGeometry({ x: 20, y: 30, w: 60, h: 40 });
    for (let i = 0; i < 100; i++) {
      const p = g.sample(rng);
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThan(80);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThan(70);
    }
  });
});
```

- [ ] **Step 2: Run + expect FAIL**

```
npx vitest run packages/motor/src/world/Emitter.test.ts
```

Expected: FAIL — cannot resolve `./Emitter.js`.

- [ ] **Step 3: Implement `Emitter.ts`**

Create `packages/motor/src/world/Emitter.ts`:

```ts
import type { Vec2, Rng } from "@getback/math";
import type { Rect } from "./World.js";

/** Describes how spawn positions are sampled. */
export interface Geometry {
  sample(rng: Rng): Vec2;
}

/** Uniform random position inside an axis-aligned rectangle. */
export function rectGeometry(rect: Rect): Geometry {
  return {
    sample(rng: Rng): Vec2 {
      return {
        x: rng.range(rect.x, rect.x + rect.w),
        y: rng.range(rect.y, rect.y + rect.h),
      };
    },
  };
}

/** Always returns the same fixed point. Useful for treat spawns near the pen. */
export function pointGeometry(point: Vec2): Geometry {
  return {
    sample(_rng: Rng): Vec2 {
      return { x: point.x, y: point.y };
    },
  };
}

export interface EmitterOptions {
  geometry: Geometry;
  /** Seconds between automatic emits. */
  period: number;
  /** How many spawn positions to produce per emit. */
  amount: number;
  /** Maximum number of active (live) entities; emit is suppressed when active >= max. */
  max: number;
  /** Seeded Rng; all sampling goes through this for determinism. */
  rng: Rng;
  /** Optional: reject a candidate position — it will be re-sampled (up to 32 tries). */
  exclude?: (pos: Vec2) => boolean;
  /** Maximum re-sample attempts per position when exclude is given. */
  maxTries?: number;
}

/**
 * Declarative, period-based spawner.  Does NOT create entities — it returns
 * an array of Vec2 positions for SpawnSystem (or RespawnSystem) to materialise.
 *
 * `active` is a public counter the caller must keep in sync (increment on spawn,
 * decrement on release) so the Emitter can enforce its `max` cap.
 */
export class Emitter {
  private _elapsed = 0;
  private readonly _opts: EmitterOptions;
  /** Number of currently live (acquired) entities tracked by the owner. */
  active = 0;

  constructor(opts: EmitterOptions) {
    this._opts = opts;
  }

  /** Advance time; returns spawn positions if the period fired. */
  update(dt: number): Vec2[] {
    this._elapsed += dt;
    if (this._elapsed < this._opts.period) return [];
    this._elapsed -= this._opts.period;
    return this._sample();
  }

  /**
   * Emit `count` positions immediately, ignoring accumulated time.
   * Resets the time accumulator.  Used by RespawnSystem to force a
   * full-flock spawn in the same frame as penFilled.
   */
  emitNow(count: number): Vec2[] {
    this._elapsed = 0;
    return this._sampleN(count);
  }

  /** Repoint the geometry (e.g. after respawn moves the flock area). */
  setGeometry(geometry: Geometry): void {
    (this._opts as { geometry: Geometry }).geometry = geometry;
  }

  private _sample(): Vec2[] {
    const { max, amount } = this._opts;
    const slots = max - this.active;
    if (slots <= 0) return [];
    return this._sampleN(Math.min(amount, slots));
  }

  private _sampleN(n: number): Vec2[] {
    const { geometry, rng, exclude, maxTries = 32 } = this._opts;
    const result: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      let pos = geometry.sample(rng);
      if (exclude) {
        for (let t = 1; t < maxTries && exclude(pos); t++) {
          pos = geometry.sample(rng);
        }
      }
      result.push(pos);
    }
    return result;
  }
}
```

- [ ] **Step 4: Run + expect PASS**

```
npx vitest run packages/motor/src/world/Emitter.test.ts
```

Expected: PASS — all tests green.

```
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/Emitter.ts packages/motor/src/world/Emitter.test.ts
git commit -m "Add Emitter declarative spawner with rect/point geometry"
```

---

### Task 4: `config.ts` — add `spawn` block

**Files:**
- Modify: `packages/motor/src/config.ts`

- [ ] **Step 1: No failing test to write (config values drive numeric choices)**

The test for the new config keys lives in SpawnSystem (Task 5). Add the block now so Tasks 5–7 can import it.

- [ ] **Step 2: Implement**

In `packages/motor/src/config.ts`, add the `spawn` block before the closing `} as const`:

```ts
  spawn: {
    flockSize: 18,        // default number of sheep per flock
    period: 0,            // seconds; 0 = immediate-only (RespawnSystem drives timing)
    areaInset: 30,        // px inset from pasture edge for the spawn rect
    poolInitialSize: 0,   // pre-warmed objects (0 = lazy; pool grows on first use)
    maxTries: 32,         // max re-sample attempts to avoid placing inside the pen
  },
```

Full updated `config.ts` after the edit:

```ts
// All movement/flock tunables in one place. Grows in later plans.
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
  drives: { hungerRate: 0.05, grazeRate: 0.5 },
  graze: { weight: 1.0 },
  obstacleAvoid: { weight: 1.6, avoidRadius: 18 },
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24 },
  respawn: { scatterMargin: 20, scatterTries: 20 },
  dog: { radius: 6, maxSpeed: 70, maxForce: 400, sprintMult: 1.6, stopGain: 12 },
  scare: { presenceRadius: 26, presenceIntensity: 0.25, barkRadius: 70, barkIntensity: 1, barkCooldown: 0.8 },
  stamina: { max: 100, sprintDrain: 18, regen: 22, barkCost: 12 },
  flee: { weight: 2.5 },
  fear: { decay: 1.2 },
  bounds: { x: 0, y: 0, w: 480, h: 270 },
  spawn: {
    flockSize: 18,
    period: 0,
    areaInset: 30,
    poolInitialSize: 0,
    maxTries: 32,
  },
} as const;
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```

Expected: exit 0. (No tests yet reference the new keys — they compile fine once imported in Tasks 5–7.)

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/config.ts
git commit -m "Add spawn config block to motor config"
```

---

### Task 5: `SpawnSystem` — materialise Emitter positions into world sheep

**Files:**
- Create: `packages/motor/src/systems/SpawnSystem.ts`
- Create: `packages/motor/src/systems/SpawnSystem.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/motor/src/systems/SpawnSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { spawnSystem } from "./SpawnSystem.js";
import { createWorld } from "../world/World.js";
import { AgentPool } from "../world/Pool.js";
import { Emitter, rectGeometry } from "../world/Emitter.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";

function makePool() {
  return new AgentPool({
    create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
    reset: (s) => resetSheep(s, { x: 0, y: 0 }),
  });
}

describe("spawnSystem", () => {
  it("does nothing when world has no emitter or pool", () => {
    const world = createWorld();
    expect(() => spawnSystem(world)).not.toThrow();
    expect(world.sheep).toHaveLength(0);
  });

  it("does not spawn before the emitter period elapses", () => {
    const rng = makeRng(1);
    const world = createWorld([], undefined, [], null, null, rng);
    world.sheepPool = makePool();
    world.sheepEmitter = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 2,
      amount: 3,
      max: 10,
      rng,
    });
    spawnSystem(world, 1.0);
    expect(world.sheep).toHaveLength(0);
  });

  it("spawns `amount` sheep once the period elapses", () => {
    const rng = makeRng(2);
    const world = createWorld([], undefined, [], null, null, rng);
    world.sheepPool = makePool();
    world.sheepEmitter = new Emitter({
      geometry: rectGeometry({ x: 10, y: 20, w: 80, h: 60 }),
      period: 1,
      amount: 4,
      max: 20,
      rng,
    });
    spawnSystem(world, 1.0);
    expect(world.sheep).toHaveLength(4);
    // Positions come from the emitter rect
    for (const s of world.sheep) {
      expect(s.pos.x).toBeGreaterThanOrEqual(10);
      expect(s.pos.x).toBeLessThan(90);
    }
  });

  it("reuses a previously released sheep from the pool", () => {
    const rng = makeRng(3);
    const world = createWorld([], undefined, [], null, null, rng);
    const pool = makePool();
    // Pre-populate the pool with a known instance
    const original = createSheep({ x: 50, y: 50 }, defaultSheepTraits());
    original.penned = true; // dirty state
    pool.release(original);

    world.sheepPool = pool;
    world.sheepEmitter = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 1,
      max: 20,
      rng,
    });
    spawnSystem(world, 1.0);
    expect(world.sheep).toHaveLength(1);
    // The released object was reused (same identity)
    expect(world.sheep[0]).toBe(original);
    // resetSheep was called via the pool reset — penned cleared
    expect(world.sheep[0]!.penned).toBe(false);
  });

  it("syncs emitter.active with world.sheep.length after spawn", () => {
    const rng = makeRng(4);
    const world = createWorld([], undefined, [], null, null, rng);
    world.sheepPool = makePool();
    const emitter = new Emitter({
      geometry: rectGeometry({ x: 0, y: 0, w: 100, h: 100 }),
      period: 1,
      amount: 5,
      max: 20,
      rng,
    });
    world.sheepEmitter = emitter;
    spawnSystem(world, 1.0);
    expect(emitter.active).toBe(5);
  });
});
```

- [ ] **Step 2: Run + expect FAIL**

```
npx vitest run packages/motor/src/systems/SpawnSystem.test.ts
```

Expected: FAIL — `./SpawnSystem.js` not found; also `world.sheepPool` and `world.sheepEmitter` are not on `World` yet (TypeScript compile error).

- [ ] **Step 3: Extend `World` to carry `sheepPool` + `sheepEmitter`**

In `packages/motor/src/world/World.ts`:

Add imports at the top:
```ts
import type { AgentPool } from "./Pool.js";
import type { Emitter } from "./Emitter.js";
import type { Sheep } from "../entities/Sheep.js";
```

Add fields to the `World` interface (after `signals`):
```ts
  sheepPool: AgentPool<Sheep> | null;
  sheepEmitter: Emitter | null;
```

Add to the `createWorld` return object:
```ts
    sheepPool: null,
    sheepEmitter: null,
```

- [ ] **Step 4: Implement `SpawnSystem.ts`**

Create `packages/motor/src/systems/SpawnSystem.ts`:

```ts
import type { World } from "../world/World.js";
import { resetSheep } from "../entities/Sheep.js";

/**
 * Tick the sheep Emitter by `dt`; for each returned spawn position, acquire
 * a Sheep from the pool, reset it to that position, and push it into world.sheep.
 *
 * Guards for null pool/emitter so the system is safe in headless examples that
 * do not configure spawn infrastructure.
 */
export function spawnSystem(world: World, dt = 0): void {
  const { sheepPool, sheepEmitter } = world;
  if (!sheepPool || !sheepEmitter) return;

  const positions = sheepEmitter.update(dt);
  for (const pos of positions) {
    const sheep = sheepPool.acquire(pos);
    resetSheep(sheep, pos);
    world.sheep.push(sheep);
    sheepEmitter.active++;
  }
}
```

- [ ] **Step 5: Run + expect PASS**

```
npx vitest run packages/motor/src/systems/SpawnSystem.test.ts
```

Expected: PASS — all 5 tests green.

```
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/world/World.ts packages/motor/src/systems/SpawnSystem.ts packages/motor/src/systems/SpawnSystem.test.ts
git commit -m "Add SpawnSystem and extend World with sheepPool/sheepEmitter"
```

---

### Task 6: Refactor `RespawnSystem` to route through Pool + Emitter

This is the delicate task. We need to replace the direct `createSheep` scatter loop with pool-release + emitter-emit, while keeping the existing test assertions green.

**Existing test assertions (must remain green without modification):**

1. `RespawnSystem.test.ts` — "does nothing when not all sheep are penned": `world.sheep` still contains `inside`; `world.pen` is unchanged. Still passes because early-return logic is unchanged.
2. `RespawnSystem.test.ts` — "emits penFilled and replaces the flock + pen when pen is full":
   - `filled === 1` — still true (we still call `world.signals.penFilled.emit()`).
   - `world.pen !== pen` — still true (we still build a new pen).
   - `world.sheep.length === 2` — still true (pool emits same count).
   - `world.sheep` does not contain `a` or `b` — pool recycles identity; BUT `a` and `b` are released and re-acquired, so after `resetSheep` they are the same objects but with cleared state. The test checks `not.toContain(a)` by identity — **this assertion would FAIL** if the pool immediately re-acquires the same object. Resolution: the test uses a flock of 2 and asserts that neither original sheep object is present. Because pool re-acquires `a` and `b` and `resetSheep` mutates them in place, `world.sheep` would actually contain the same object identities (`a` and `b`), violating `not.toContain(a)`.
   
   **Deliberate test update required:** Change the "old sheep gone" assertions from identity checks to a "state was reset" check. The new assertion verifies that each fresh sheep has `penned === false`, `drives.fear === 0`, and `drives.hunger === 0` — the observable effect of recycling. Explanation in the plan below.
   
3. `RespawnSystem.test.ts` — "is a no-op with no pen or empty flock": unchanged, early-return path.
4. `Game.test.ts` — "respawn integration" test line 294: `expect(world.sheep[0]).not.toBe(sheep[0])`. This also checks object identity. With pool recycling, the same object may be reused. **Same deliberate update required**: replace the identity check with a state-reset check.

**Files:**
- Modify: `packages/motor/src/systems/RespawnSystem.ts`
- Modify: `packages/motor/src/systems/RespawnSystem.test.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Update RespawnSystem.test.ts**

In `packages/motor/src/systems/RespawnSystem.test.ts`, update the "emits penFilled and replaces the flock + pen" test. Replace the old-sheep-gone identity block:

Old block (lines 40–44):
```ts
    expect(world.sheep.length).toBe(2); // same count, fresh flock
    expect(world.sheep).not.toContain(a); // old sheep gone
    expect(world.sheep).not.toContain(b);
    // the fresh sheep are scattered OUTSIDE the new pen (not instantly re-penned)
    for (const s of world.sheep) expect(penContains(world.pen!, s.pos)).toBe(false);
```

New block:
```ts
    expect(world.sheep.length).toBe(2); // same count, fresh flock
    // With pool recycling the same object identities may be reused; what matters
    // is that every sheep was reset — not penned, drives cleared, outside new pen.
    for (const s of world.sheep) {
      expect(s.penned).toBe(false);
      expect(s.drives.fear).toBe(0);
      expect(s.drives.hunger).toBe(0);
      expect(penContains(world.pen!, s.pos)).toBe(false);
    }
```

Also add `world.sheepPool` wiring to the test world so the system can find the pool. Update the test setup for the "pen is full" case:

```ts
  it("emits penFilled and replaces the flock + pen when the pen is full", () => {
    const pen = buildPen(square, 3);
    const a = createSheep({ x: 18, y: 18 }, defaultSheepTraits());
    const b = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    const world = createWorld([a, b], undefined, [], pen, null, makeRng(2));
    // Wire a pool so RespawnSystem can recycle sheep
    world.sheepPool = new AgentPool({
      create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
      reset: (s) => resetSheep(s, { x: 0, y: 0 }),
    });
    let filled = 0;
    world.signals.penFilled.add(() => filled++);

    penSystem(pen, world.sheep);
    respawnSystem(world);

    expect(filled).toBe(1);
    expect(world.pen).not.toBe(pen);
    expect(world.sheep.length).toBe(2);
    for (const s of world.sheep) {
      expect(s.penned).toBe(false);
      expect(s.drives.fear).toBe(0);
      expect(s.drives.hunger).toBe(0);
      expect(penContains(world.pen!, s.pos)).toBe(false);
    }
  });
```

Add the needed imports to the top of `RespawnSystem.test.ts`:
```ts
import { AgentPool } from "../world/Pool.js";
import { resetSheep } from "../entities/Sheep.js";
```

- [ ] **Step 2: Update Game.test.ts — respawn integration test**

In `packages/motor/src/world/Game.test.ts`, find the "respawn integration" describe block (around line 270). The test currently has:

```ts
    expect(world.sheep[0]).not.toBe(sheep[0]); // genuinely new sheep
```

Replace that single line with:

```ts
    // With pool recycling object identity may be reused; check reset state instead.
    for (const s of world.sheep) {
      expect(s.penned).toBe(false);
      expect(s.drives.fear).toBe(0);
    }
```

Also wire a pool into the test world so the refactored `RespawnSystem` can work. Update the `createWorld` call in that test:

```ts
    const world = createWorld(sheep, undefined, [], pen, null, makeRng(3));
    world.sheepPool = new AgentPool({
      create: () => createSheep({ x: 0, y: 0 }, defaultSheepTraits()),
      reset: (s) => resetSheep(s, { x: 0, y: 0 }),
    });
```

Add imports at the top of `Game.test.ts` if not already present:
```ts
import { AgentPool } from "../world/Pool.js";
import { resetSheep } from "../entities/Sheep.js";
```

- [ ] **Step 3: Run tests to verify updated tests now reflect the failing implementation**

```
npx vitest run packages/motor/src/systems/RespawnSystem.test.ts
npx vitest run packages/motor/src/world/Game.test.ts
```

Expected for RespawnSystem: the "pen is full" test FAILs because `RespawnSystem` still uses direct `createSheep` (no pool).
Expected for Game.test.ts: "respawn integration" test also FAILs for the same reason (pool not used, but pool is now required).

- [ ] **Step 4: Implement the refactored `RespawnSystem.ts`**

Replace `packages/motor/src/systems/RespawnSystem.ts` entirely:

```ts
import { generatePen } from "../world/penGen.js";
import { buildPen, penContains } from "../world/Pen.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";
import { config } from "../config.js";
import type { World } from "../world/World.js";
import { rectGeometry } from "../world/Emitter.js";

// When every sheep is penned, the flock has been herded home: fire penFilled,
// release the flock back to the pool (no GC churn), generate a new pen,
// re-point the sheep Emitter to the far side, and emit a fresh flock from the pool.
// Falls back to direct createSheep scatter when no pool/emitter is wired (headless
// examples / legacy tests that do not configure spawn infrastructure).
export function respawnSystem(world: World): void {
  const pen = world.pen;
  const flock = world.sheep;
  if (!pen || flock.length === 0) return;
  if (pen.contained.size < flock.length) return;

  world.signals.penFilled.emit();

  const count = flock.length;
  const rng = world.rng;
  const b = world.bounds;

  // Release all penned sheep back to the pool (if pool is wired).
  const pool = world.sheepPool;
  if (pool) {
    for (const s of flock) pool.release(s);
    // Also sync emitter.active down to zero.
    if (world.sheepEmitter) world.sheepEmitter.active = 0;
  }
  flock.length = 0;

  // Generate a new random pen.
  const m = config.pen.rMax;
  const center = {
    x: rng.range(b.x + m, b.x + b.w - m),
    y: rng.range(b.y + m, b.y + b.h - m),
  };
  const shape = generatePen(rng, {
    center,
    rMin: config.pen.rMin,
    rMax: config.pen.rMax,
    minVerts: config.pen.minVerts,
    maxVerts: config.pen.maxVerts,
    minGateWidth: config.pen.minGateWidth,
  });
  const newPen = buildPen(shape.outline, shape.gateEdge);
  world.pen = newPen;

  if (pool && world.sheepEmitter) {
    // Re-point the emitter to the far side of the pasture (mirror pen centroid
    // through the pasture centre), inset by areaInset.
    const inset = config.spawn.areaInset;
    const pcx = newPen.centroid.x;
    const pcy = newPen.centroid.y;
    const pastureCx = b.x + b.w / 2;
    const pastureCy = b.y + b.h / 2;
    // Mirror: far side centroid is (2*pastureCentre - penCentroid), clamped to inset rect.
    const farX = Math.min(Math.max(2 * pastureCx - pcx, b.x + inset), b.x + b.w - inset);
    const farY = Math.min(Math.max(2 * pastureCy - pcy, b.y + inset), b.y + b.h - inset);
    // Spawn rect: centred on the far point, sized to half the pasture, inset from bounds.
    const hw = (b.w / 2 - inset * 2) / 2;
    const hh = (b.h / 2 - inset * 2) / 2;
    const spawnRect = {
      x: Math.max(b.x + inset, farX - hw),
      y: Math.max(b.y + inset, farY - hh),
      w: hw * 2,
      h: hh * 2,
    };
    world.sheepEmitter.setGeometry(
      rectGeometry(spawnRect),
    );

    // Emit the full flock immediately (emitNow bypasses period timing).
    const positions = world.sheepEmitter.emitNow(count);
    for (const pos of positions) {
      // Re-sample if position lands inside the new pen.
      let finalPos = pos;
      if (penContains(newPen, pos)) {
        for (let t = 0; t < config.spawn.maxTries; t++) {
          const retry = rectGeometry(spawnRect).sample(rng);
          if (!penContains(newPen, retry)) { finalPos = retry; break; }
        }
      }
      const sheep = pool.acquire(finalPos);
      resetSheep(sheep, finalPos);
      flock.push(sheep);
      world.sheepEmitter.active++;
    }
  } else {
    // Fallback: legacy scatter (no pool configured) — keeps headless examples working.
    const margin = config.respawn.scatterMargin;
    for (let i = 0; i < count; i++) {
      let x = b.x + b.w / 2;
      let y = b.y + b.h / 2;
      for (let tries = 0; tries < config.respawn.scatterTries; tries++) {
        x = rng.range(b.x + margin, b.x + b.w - margin);
        y = rng.range(b.y + margin, b.y + b.h - margin);
        if (!penContains(newPen, { x, y })) break;
      }
      flock.push(createSheep({ x, y }, defaultSheepTraits()));
    }
  }
}
```

- [ ] **Step 5: Run + expect PASS**

```
npx vitest run packages/motor/src/systems/RespawnSystem.test.ts
npx vitest run packages/motor/src/world/Game.test.ts
npm test
```

Expected: all green. The "does nothing" and "no pen" tests are unchanged and pass. The "pen is full" test passes because pool+reset clears `penned`/drives/pos. The Game.test.ts "respawn integration" test passes: `filled === 1`, new pen, same length, reset state. The subsequent 30-frame run does not re-respawn (fresh flock is scattered outside the new pen → not all penned → early return each frame). All other integration tests pass because `world.sheepPool === null` on their worlds → RespawnSystem takes the fallback path unchanged.

```
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/systems/RespawnSystem.ts packages/motor/src/systems/RespawnSystem.test.ts packages/motor/src/world/Game.test.ts
git commit -m "Refactor RespawnSystem to release/acquire via AgentPool and repoint Emitter"
```

---

### Task 7: Wire Pool + Emitter into `World` / `Game` + barrel exports

**Files:**
- Modify: `packages/motor/src/world/World.ts` (factory helper `createSheepPool` + `createSheepEmitter`)
- Modify: `packages/motor/src/world/Game.ts` (add `spawnSystem` to pipeline)
- Modify: `packages/motor/src/index.ts` (barrel)

- [ ] **Step 1: Add convenience factories to `World.ts`**

Add factory helpers at the bottom of `packages/motor/src/world/World.ts` so `apps/getback` can assemble a fully-wired World in one call. These go below `createWorld`:

```ts
import { AgentPool } from "./Pool.js";
import { Emitter, rectGeometry } from "./Emitter.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";

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
```

- [ ] **Step 2: Add `spawnSystem` to `Game.ts` pipeline**

In `packages/motor/src/world/Game.ts`, add the import:
```ts
import { spawnSystem } from "../systems/SpawnSystem.js";
```

Add the call after `penSystem`/`respawnSystem` (step 12 per the frame pipeline spec, after pickup placeholder):

```ts
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep);
    }
    respawnSystem(this.world);
    spawnSystem(this.world, step);
```

- [ ] **Step 3: Update barrel exports**

Add to `packages/motor/src/index.ts`:

```ts
export { AgentPool } from "./world/Pool.js";
export type { PoolOptions } from "./world/Pool.js";
export { Emitter, rectGeometry, pointGeometry } from "./world/Emitter.js";
export type { Geometry, EmitterOptions } from "./world/Emitter.js";
export { spawnSystem } from "./systems/SpawnSystem.js";
export { createSheepPool, createSheepEmitter } from "./world/World.js";
export { resetSheep } from "./entities/Sheep.js"; // rollSheepTraits already barrel-exported by Plan 13
```

- [ ] **Step 4: Full suite**

```
npm test
npm run typecheck
```

Expected: all tests pass (SpawnSystem is called each frame but `sheepEmitter.period === 0` means `update(dt)` never fires — the time accumulator never reaches the period because period is 0 and the check is `elapsed < period`, so `0 < 0` is false and it fires immediately on the first frame. 

Correction: `period: 0` would fire on every frame (since `elapsed += dt` → `elapsed >= 0` always). Change the default period to a large sentinel (e.g. `Infinity`) so the periodic path never fires unless explicitly set. RespawnSystem uses `emitNow()` directly.

Update `config.ts` `spawn.period` to `Infinity`:

```ts
    period: Infinity,   // sentinel: periodic auto-emit disabled; RespawnSystem uses emitNow()
```

Re-run:
```
npm test
npm run typecheck
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/config.ts
git commit -m "Wire SpawnSystem into Game pipeline and export spawn infrastructure"
```

---

## Self-review

**Scope coverage map:**

| Scope item                                    | Task(s)          |
| --------------------------------------------- | ---------------- |
| 1. `AgentPool<T>` with acquire/release/size   | Task 2           |
| 2. `Emitter` with geometry/period/amount/max  | Task 3           |
| 3. `SpawnSystem` tick + pool materialise       | Task 5           |
| 4. `RespawnSystem` refactor via Pool+Emitter  | Task 6           |
| 5. `world.sheepPool` + `world.sheepEmitter`   | Tasks 5, 7       |
| 6. `config.spawn` block                       | Task 4           |

**Respawn test handling:**

Two tests check old-sheep identity (`not.toBe(sheep[0])`, `not.toContain(a)`). With pool recycling the same object memory is reused, so those assertions are deliberately updated to check observable reset state (`penned === false`, `drives.fear === 0`) — the meaningful guarantee. All other assertions (signal count, pen identity, flock size, outside-pen placement) are preserved unchanged.

**Fallback path:** When `world.sheepPool` is `null` (all existing integration tests, headless examples), `RespawnSystem` takes the legacy `createSheep` scatter path. This keeps every existing test green with no modifications except the two identity checks above.

**Placeholder scan:** None. Every code block is complete and runnable. Every `npx vitest run` command specifies an exact file path. All symbol names (`resetSheep`, `AgentPool`, `Emitter`, `rectGeometry`, `pointGeometry`, `spawnSystem`, `createSheepPool`, `createSheepEmitter`) are defined within this plan before first use. `rollSheepTraits` is defined in Plan 13 and reused here.

**Type consistency:** `AgentPool<T>` is parameterised on `T`; `Emitter` is unparameterised (positions only). `World` gains `sheepPool: AgentPool<Sheep> | null` and `sheepEmitter: Emitter | null` — both defaulting to `null` in `createWorld`, so all existing callers compile unchanged. `config.spawn` is added to the `as const` object; all keys are numeric primitives or `Infinity` (a valid `number` literal). `resetSheep` uses `Vec2` from `@getback/math` — already imported in `Sheep.ts` (Plan 13 also added `Rng` for `rollSheepTraits`).

---

## Next plans

**Plan 15 — Motor: Treats, Buffs & Ambient Scares:** `Treat` entity + `TreatEmitter` (bonus treat on pen-fill per §11.5 step 3), `PickupSystem` (overlap detection, stamina refill, buff grant), `BuffSystem` (tick buff timer, apply/remove speed multiplier), `ScareSystem` extension for ambient scares (timer-based, random position), richer `GameSignals` (`treatCollected`, `barked`, `ambientScare`, `sheepPenned`). Reuses `AgentPool<Treat>` and the `Emitter`/`pointGeometry` from Plan 14.
