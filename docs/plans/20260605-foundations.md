# Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the npm-workspaces monorepo and the three pure foundational packages — `@getback/math`, `@getback/signal`, `@getback/spatial` — each fully unit-tested.

**Architecture:** A private npm-workspaces monorepo. Each package is plain TypeScript consumed as source across the workspace (no build step for dev; Vitest/esbuild transforms TS, `tsc --noEmit` type-checks). All three packages are Pixi-free and DOM-free, so they run headless under Vitest. Later plans (motor, game) build on these.

**Tech Stack:** TypeScript 5 (strict), Vitest 2, npm workspaces. Runtime deps: `pure-rand` (PRNG), `robust-point-in-polygon` (containment), `rbush` (R-tree).

This is **Plan 1 of 5** (see `docs/specs/20260604-getback-corgi-herding.md` §2 for the full package map). It depends on nothing and produces three tested libraries.

---

## File structure created by this plan

```
package.json                 # workspace root: { workspaces: ["packages/*","apps/*","examples/*"] }
tsconfig.base.json           # shared strict compiler options
tsconfig.json                # root typecheck: includes packages/*/src
vitest.config.ts             # test.include = packages/**/*.test.ts
packages/
  math/
    package.json             # @getback/math; deps: pure-rand, robust-point-in-polygon
    src/{ vec2, geometry, rng, index }.ts
    src/{ vec2, geometry, rng }.test.ts
  signal/
    package.json             # @getback/signal; no deps
    src/{ Signal, index }.ts
    src/Signal.test.ts
  spatial/
    package.json             # @getback/spatial; deps: rbush, @getback/math
    src/{ grid, staticIndex, index }.ts
    src/{ grid, staticIndex }.test.ts
```

**Shared type:** `Vec2` is `{ x: number; y: number }`, defined once in `@getback/math` (`vec2.ts`) and imported elsewhere.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the root workspace `package.json`**

Create `package.json`:

```json
{
  "name": "getback",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*", "examples/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 3: Create the root `tsconfig.json` (typecheck entrypoint)**

Create `tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/*/src"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Install and verify the empty workspace runs**

Run: `npm install`
Expected: completes without error, creates `node_modules/` and `package-lock.json`.

Run: `npm test`
Expected: Vitest reports **"No test files found"** and exits 0 (no tests yet). This confirms the harness works.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.json vitest.config.ts
git commit -m "Scaffold npm-workspaces monorepo with Vitest + TS"
```

---

### Task 2: `@getback/math` — vec2

**Files:**
- Create: `packages/math/package.json`
- Create: `packages/math/src/vec2.ts`
- Create: `packages/math/src/vec2.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/math/package.json`:

```json
{
  "name": "@getback/math",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "pure-rand": "^6.1.0",
    "robust-point-in-polygon": "^1.0.3"
  }
}
```

Run: `npm install`
Expected: links `@getback/math` into the workspace and installs `pure-rand` + `robust-point-in-polygon`.

- [ ] **Step 2: Write the failing test**

Create `packages/math/src/vec2.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { add, sub, scale, dot, len, lenSq, dist, normalize, truncate, perp } from "./vec2.js";

describe("vec2", () => {
  it("adds and subtracts", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual({ x: 2, y: 2 });
  });
  it("scales and dots", () => {
    expect(scale({ x: 2, y: -3 }, 2)).toEqual({ x: 4, y: -6 });
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
  });
  it("measures length and distance", () => {
    expect(len({ x: 3, y: 4 })).toBe(5);
    expect(lenSq({ x: 3, y: 4 })).toBe(25);
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it("normalizes, with zero-vector guard", () => {
    expect(normalize({ x: 0, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
  it("truncates only when longer than max", () => {
    expect(truncate({ x: 3, y: 4 }, 5)).toEqual({ x: 3, y: 4 });
    expect(truncate({ x: 6, y: 8 }, 5)).toEqual({ x: 3, y: 4 });
  });
  it("computes a left perpendicular", () => {
    const p = perp({ x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0); // tolerant of -0
    expect(p.y).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/math/src/vec2.test.ts`
Expected: FAIL — cannot resolve `./vec2.js` (module does not exist).

- [ ] **Step 4: Write the implementation**

Create `packages/math/src/vec2.ts`:

```ts
export interface Vec2 {
  x: number;
  y: number;
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const lenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec2): number => Math.sqrt(lenSq(a));
export const distSq = (a: Vec2, b: Vec2): number => lenSq(sub(a, b));
export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(distSq(a, b));

export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

export const truncate = (a: Vec2, max: number): Vec2 => {
  const l = len(a);
  return l > max && l > 0 ? scale(a, max / l) : { x: a.x, y: a.y };
};

// left-hand perpendicular (90° CCW)
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/math/src/vec2.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/math/package.json packages/math/src/vec2.ts packages/math/src/vec2.test.ts package-lock.json
git commit -m "Add @getback/math vec2 module"
```

---

### Task 3: `@getback/math` — geometry

**Files:**
- Create: `packages/math/src/geometry.ts`
- Create: `packages/math/src/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/math/src/geometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { closestPointOnSegment, signedArea, isCCW, pointInPolygon } from "./geometry.js";

const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
]; // CCW

describe("closestPointOnSegment", () => {
  it("projects onto the segment interior", () => {
    const r = closestPointOnSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.point).toEqual({ x: 2, y: 0 });
    expect(r.t).toBeCloseTo(0.5);
    expect(r.distSq).toBeCloseTo(9);
  });
  it("clamps to an endpoint (vertex case)", () => {
    const r = closestPointOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.point).toEqual({ x: 0, y: 0 });
    expect(r.t).toBe(0);
  });
});

describe("polygon winding", () => {
  it("computes signed area and CCW orientation", () => {
    expect(signedArea(square)).toBeCloseTo(16);
    expect(isCCW(square)).toBe(true);
    expect(isCCW([...square].reverse())).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("detects inside and outside (concave-safe)", () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 9, y: 9 }, square)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/math/src/geometry.test.ts`
Expected: FAIL — cannot resolve `./geometry.js`.

- [ ] **Step 3: Write the implementation**

`robust-point-in-polygon` ships no type declarations, so first add the community types (root devDependency): `npm i -D @types/robust-point-in-polygon@^1.0.4`. Then create `packages/math/src/geometry.ts`:

```ts
import rpip from "robust-point-in-polygon";
import type { Vec2 } from "./vec2.js";

export interface ClosestResult {
  point: Vec2;
  t: number;
  distSq: number;
}

// Closest point on segment ab to p, with the projection parameter clamped to [0,1].
// When t hits 0 or 1 the closest feature is the vertex (the rounded-cap case).
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): ClosestResult {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  let t = denom === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  const dx = p.x - point.x;
  const dy = p.y - point.y;
  return { point, t, distSq: dx * dx + dy * dy };
}

// Signed area via the shoelace formula. Positive = counter-clockwise winding.
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const isCCW = (poly: Vec2[]): boolean => signedArea(poly) > 0;

// Ray-cast point-in-polygon (robust, concave-safe) via robust-point-in-polygon.
// rpip returns -1 inside, 0 on boundary, 1 outside.
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  const ring = poly.map((v) => [v.x, v.y] as [number, number]);
  return rpip(ring, [p.x, p.y]) < 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/math/src/geometry.test.ts`
Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
git add packages/math/src/geometry.ts packages/math/src/geometry.test.ts
git commit -m "Add @getback/math geometry module"
```

---

### Task 4: `@getback/math` — rng + package barrel

**Files:**
- Create: `packages/math/src/rng.ts`
- Create: `packages/math/src/rng.test.ts`
- Create: `packages/math/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/math/src/rng.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "./rng.js";

describe("rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a.float(), a.float(), a.float()];
    const seqB = [b.float(), b.float(), b.float()];
    expect(seqA).toEqual(seqB);
  });
  it("produces floats in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("ints stay within the inclusive range", () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
  it("different seeds diverge", () => {
    expect(makeRng(1).float()).not.toBe(makeRng(2).float());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/math/src/rng.test.ts`
Expected: FAIL — cannot resolve `./rng.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/math/src/rng.ts`:

```ts
import prand from "pure-rand";

export interface Rng {
  float(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  range(min: number, max: number): number; // [min, max)
  pick<T>(items: readonly T[]): T;
}

// Seedable PRNG over pure-rand's xoroshiro128+. The unsafe* distributions mutate
// the generator in place, giving a simple deterministic stream.
export function makeRng(seed: number): Rng {
  const gen = prand.xoroshiro128plus(seed);
  const u32 = () => prand.unsafeUniformIntDistribution(0, 0xffffffff, gen);
  const float = () => u32() / 0x100000000;
  const int = (min: number, max: number) => prand.unsafeUniformIntDistribution(min, max, gen);
  const range = (min: number, max: number) => min + float() * (max - min);
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError("pick from empty array");
    return items[int(0, items.length - 1)]!;
  };
  return { float, int, range, pick };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/math/src/rng.test.ts`
Expected: PASS — all green.

- [ ] **Step 5: Create the package barrel**

Create `packages/math/src/index.ts`:

```ts
export type { Vec2 } from "./vec2.js";
export { add, sub, scale, dot, len, lenSq, dist, distSq, normalize, truncate, perp } from "./vec2.js";
export type { ClosestResult } from "./geometry.js";
export { closestPointOnSegment, signedArea, isCCW, pointInPolygon } from "./geometry.js";
export type { Rng } from "./rng.js";
export { makeRng } from "./rng.js";
```

- [ ] **Step 6: Typecheck the whole workspace so far**

Run: `npm run typecheck`
Expected: exits 0 with no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/math/src/rng.ts packages/math/src/rng.test.ts packages/math/src/index.ts
git commit -m "Add @getback/math rng module and package barrel"
```

---

### Task 5: `@getback/signal`

**Files:**
- Create: `packages/signal/package.json`
- Create: `packages/signal/src/Signal.ts`
- Create: `packages/signal/src/Signal.test.ts`
- Create: `packages/signal/src/index.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/signal/package.json`:

```json
{
  "name": "@getback/signal",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

Run: `npm install`
Expected: links `@getback/signal` into the workspace.

- [ ] **Step 2: Write the failing test**

Create `packages/signal/src/Signal.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Signal } from "./Signal.js";

describe("Signal", () => {
  it("emits to all listeners in registration order", () => {
    const s = new Signal<number>();
    const calls: string[] = [];
    s.add(() => calls.push("a"));
    s.add(() => calls.push("b"));
    s.emit(1);
    expect(calls).toEqual(["a", "b"]);
  });
  it("passes the emitted value", () => {
    const s = new Signal<{ n: number }>();
    const fn = vi.fn();
    s.add(fn);
    s.emit({ n: 7 });
    expect(fn).toHaveBeenCalledWith({ n: 7 });
  });
  it("does not fire removed listeners", () => {
    const s = new Signal<void>();
    const fn = vi.fn();
    s.add(fn);
    s.remove(fn);
    s.emit();
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/signal/src/Signal.test.ts`
Expected: FAIL — cannot resolve `./Signal.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/signal/src/Signal.ts`:

```ts
export type Listener<T> = (value: T) => void;

// Tiny synchronous pub/sub. A Set preserves insertion order and dedupes listeners.
export class Signal<T = void> {
  private readonly listeners = new Set<Listener<T>>();

  add(fn: Listener<T>): void {
    this.listeners.add(fn);
  }

  remove(fn: Listener<T>): void {
    this.listeners.delete(fn);
  }

  emit(value: T): void {
    for (const fn of this.listeners) fn(value);
  }
}
```

- [ ] **Step 5: Create the barrel and run the test**

Create `packages/signal/src/index.ts`:

```ts
export { Signal } from "./Signal.js";
export type { Listener } from "./Signal.js";
```

Run: `npx vitest run packages/signal/src/Signal.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/signal package-lock.json
git commit -m "Add @getback/signal pub-sub package"
```

---

### Task 6: `@getback/spatial` — UniformGrid

**Files:**
- Create: `packages/spatial/package.json`
- Create: `packages/spatial/src/grid.ts`
- Create: `packages/spatial/src/grid.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/spatial/package.json`:

```json
{
  "name": "@getback/spatial",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@getback/math": "*",
    "rbush": "^4.0.1"
  }
}
```

Run: `npm install`
Expected: links `@getback/spatial`, links the workspace `@getback/math` into it, installs `rbush`.

- [ ] **Step 2: Write the failing test**

Create `packages/spatial/src/grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { UniformGrid } from "./grid.js";

interface P {
  pos: { x: number; y: number };
  id: number;
}

describe("UniformGrid", () => {
  it("returns all in-radius items with no false negatives", () => {
    const grid = new UniformGrid<P>(10);
    const near: P = { pos: { x: 5, y: 5 }, id: 1 };
    const alsoNear: P = { pos: { x: 12, y: 6 }, id: 2 };
    const far: P = { pos: { x: 200, y: 200 }, id: 3 };
    for (const p of [near, alsoNear, far]) grid.insert(p);

    const ids = grid.queryRadius({ x: 6, y: 6 }, 10).map((p) => p.id).sort();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3); // far cell never returned
  });

  it("clear() empties the grid", () => {
    const grid = new UniformGrid<P>(10);
    grid.insert({ pos: { x: 1, y: 1 }, id: 1 });
    grid.clear();
    expect(grid.queryRadius({ x: 1, y: 1 }, 10)).toEqual([]);
  });

  it("handles negative coordinates", () => {
    const grid = new UniformGrid<P>(10);
    const p: P = { pos: { x: -15, y: -3 }, id: 9 };
    grid.insert(p);
    expect(grid.queryRadius({ x: -14, y: -2 }, 5)).toContain(p);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/spatial/src/grid.test.ts`
Expected: FAIL — cannot resolve `./grid.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/spatial/src/grid.ts`:

```ts
import type { Vec2 } from "@getback/math";

// 2D uniform grid for broad-phase neighbour queries over moving agents.
// String cell keys avoid hash collisions (correctness over micro-perf at this scale).
export class UniformGrid<T extends { pos: Vec2 }> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): string {
    return cx + "," + cy;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.pos.x / this.cellSize);
    const cy = Math.floor(item.pos.y / this.cellSize);
    const k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push(item);
  }

  // Returns all items in cells overlapping the query disc's AABB — a superset
  // (broad-phase). Callers do the precise distance check. No false negatives.
  queryRadius(center: Vec2, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minCx = Math.floor((center.x - radius) / this.cellSize);
    const maxCx = Math.floor((center.x + radius) / this.cellSize);
    const minCy = Math.floor((center.y - radius) / this.cellSize);
    const maxCy = Math.floor((center.y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const it of arr) out.push(it);
      }
    }
    return out;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/spatial/src/grid.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/spatial/package.json packages/spatial/src/grid.ts packages/spatial/src/grid.test.ts package-lock.json
git commit -m "Add @getback/spatial UniformGrid"
```

---

### Task 7: `@getback/spatial` — StaticIndex (rbush wrapper) + barrel

**Files:**
- Create: `packages/spatial/src/staticIndex.ts`
- Create: `packages/spatial/src/staticIndex.test.ts`
- Create: `packages/spatial/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/spatial/src/staticIndex.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { StaticIndex } from "./staticIndex.js";

describe("StaticIndex", () => {
  it("returns only items whose AABB overlaps the query", () => {
    const idx = new StaticIndex<string>();
    idx.insert("left", { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    idx.insert("right", { minX: 10, minY: 10, maxX: 12, maxY: 12 });

    const hit = idx.search({ minX: 1, minY: 1, maxX: 3, maxY: 3 });
    expect(hit).toEqual(["left"]);
  });

  it("returns both when the query spans them", () => {
    const idx = new StaticIndex<string>();
    idx.insert("a", { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    idx.insert("b", { minX: 5, minY: 5, maxX: 6, maxY: 6 });
    expect(idx.search({ minX: 0, minY: 0, maxX: 6, maxY: 6 }).sort()).toEqual(["a", "b"]);
  });

  it("clear() empties the index", () => {
    const idx = new StaticIndex<string>();
    idx.insert("a", { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    idx.clear();
    expect(idx.search({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/spatial/src/staticIndex.test.ts`
Expected: FAIL — cannot resolve `./staticIndex.js`.

- [ ] **Step 3: Write the implementation**

`rbush` v4 ships no type declarations, so add the community types (root devDependency): `npm i -D @types/rbush@^4.0.0`. Then create `packages/spatial/src/staticIndex.ts`:

```ts
import RBush from "rbush";

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Boxed<T> extends AABB {
  item: T;
}

// Thin wrapper over an rbush R-tree for static geometry (fence segments, obstacles).
// Stores arbitrary items keyed by an AABB; query returns the items, not the boxes.
export class StaticIndex<T> {
  private readonly tree = new RBush<Boxed<T>>();

  insert(item: T, aabb: AABB): void {
    this.tree.insert({ ...aabb, item });
  }

  search(aabb: AABB): T[] {
    return this.tree.search(aabb).map((b) => b.item);
  }

  clear(): void {
    this.tree.clear();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/spatial/src/staticIndex.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Create the barrel**

Create `packages/spatial/src/index.ts`:

```ts
export { UniformGrid } from "./grid.js";
export { StaticIndex } from "./staticIndex.js";
export type { AABB } from "./staticIndex.js";
```

- [ ] **Step 6: Full verification — all tests + typecheck**

Run: `npm test`
Expected: PASS — every test file across `@getback/math`, `@getback/signal`, `@getback/spatial` is green.

Run: `npm run typecheck`
Expected: exits 0, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/spatial/src/staticIndex.ts packages/spatial/src/staticIndex.test.ts packages/spatial/src/index.ts
git commit -m "Add @getback/spatial StaticIndex rbush wrapper"
```

---

## Self-review

**Spec coverage (against §2 package map):**
- `@getback/math` (vec2, geometry, rng) → Tasks 2–4 ✓
- `@getback/signal` (Signal) → Task 5 ✓
- `@getback/spatial` (grid, staticIndex) → Tasks 6–7 ✓
- npm-workspaces monorepo + Vitest + TS typecheck → Task 1 ✓
- Deferred to later plans (correct): `steering/*`, swept circle-segment intersection (collision, Plan 3), `motor`, `@getback/game`, apps/examples.

**Placeholder scan:** none — every step has runnable code and a concrete command with expected output.

**Type consistency:** `Vec2` is defined once in `vec2.ts` and imported by `geometry.ts`, `grid.ts`; `AABB` is defined in `staticIndex.ts` and re-exported. `Rng`, `Signal<T>`, `UniformGrid<T>`, `StaticIndex<T>` signatures are stable across their tests and barrels. `.js` extensions in imports are intentional (NodeNext/Bundler ESM resolution of `.ts` sources).

**Note on `robust-point-in-polygon` import:** it's a CommonJS default export; `esModuleInterop: true` (set in `tsconfig.base.json`) makes `import rpip from "robust-point-in-polygon"` type-check, and Vitest/esbuild handles the interop at runtime.

---

## Next plans (not part of this one)

- **Plan 2 — Motor: movement & steering:** `@getback/motor` skeleton, `Mobile`, `steering/primitives.ts`, behavior-tree nodes (`Blend`/`Selector`/`Conditional`/`Sequence`/`Dynamic` + `combine()`), `MovementSystem` (semi-implicit Euler), `World`/`Game`, `NeighborhoodSystem`, basic flocking leaves (separation/cohesion/follow).
- **Plan 3 — Motor: environment & collision:** grass field, drives, goal behaviors, swept circle-segment + closest-feature collision, one-way gate, pen generation/capture.
- **Plan 4 — Motor: dog, fun layer, respawn:** `intentFollow`, scare/bark, stamina, treats/Emitter/Pool/buffs, fill/respawn, ambient scares.
- **Plan 5 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*`.
