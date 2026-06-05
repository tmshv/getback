# Motor: Movement & Steering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless `@getback/motor` movement core — the `Mobile` kinematic model, steering primitives, the prioritized-blend behavior node, basic flocking leaves, semi-implicit Euler integration, and a `World`/`Game` loop — so a scattered flock of sheep cohesively pulls together (without overlapping) entirely in unit tests.

**Architecture:** A new package `@getback/motor` (deps: `@getback/math`, `@getback/signal`, `@getback/spatial`; **no Pixi**). Entities are plain data implementing `Mobile`. Steering is a composable behavior tree: leaf nodes write a steering force into an `out` vector; a `blend` node combines children with **prioritized truncation** to `maxForce`. The per-frame pipeline is `NeighborhoodSystem → SteeringSystem → MovementSystem`, integrated with **semi-implicit Euler**. Everything runs headless under Vitest.

**Tech Stack:** TypeScript 5 (strict), Vitest 2, the three foundation packages from Plan 1.

This is **Plan 2 of 5** (see `docs/specs/20260604-getback-corgi-herding.md` §2, §7, §8). It depends on Plan 1 (merged to `master`). Scope is deliberately limited to flocking movement: **no** drives/goals, collision, pen, dog, or fun-layer yet — and only the `blend` node (the `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes arrive in Plan 3, where decisions first appear — YAGNI).

---

## File structure created by this plan

```
packages/motor/
  package.json                     # @getback/motor; deps: @getback/{math,signal,spatial}
  src/
    types.ts                       # Direction, Mobile, DogIntent
    direction.ts                   # directionFromVelocity()
    config.ts                      # movement + flock tunables
    steering/
      primitives.ts                # seek / flee / arrive (write into out)
      types.ts                     # Status, SteerContext, BehaviorNode, Predicate
      Behavior.ts                  # WeightedChild + blend() (prioritized truncation = combine())
    ai/
      behaviors.ts                 # separation / cohesion (k-nearest) / follow leaf nodes
      trees.ts                     # buildFlockTree(traits)
    entities/
      Sheep.ts                     # SheepTraits, Sheep, createSheep()
    systems/
      NeighborhoodSystem.ts        # fill sheep.neighbors via the UniformGrid
      SteeringSystem.ts            # evaluate each sheep's behavior tree -> force
      MovementSystem.ts            # semi-implicit Euler integrate
    world/
      World.ts                     # World state + createWorld()
      Game.ts                      # update(dt): runs the pipeline
    index.ts                       # public barrel
  src/**/*.test.ts                 # co-located unit tests
```

**Shared facts for all tasks:** imports between source files use `.js` extensions on the `.ts` files (e.g. `import { seek } from "./primitives.js"`). `Vec2` is `{ x: number; y: number }` from `@getback/math`. Run a single test with `npx vitest run <path>`; the whole suite with `npm test`; typecheck with `npm run typecheck`. Commit messages are one line, imperative, no body/trailers. Work from repo root `/Users/tmshv/Workspace/Playground/getback` on a feature branch.

---

### Task 1: `@getback/motor` skeleton + core types + `directionFromVelocity`

**Files:**
- Create: `packages/motor/package.json`
- Create: `packages/motor/src/types.ts`
- Create: `packages/motor/src/direction.ts`
- Create: `packages/motor/src/direction.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/motor/package.json`:

```json
{
  "name": "@getback/motor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@getback/math": "*",
    "@getback/signal": "*",
    "@getback/spatial": "*"
  }
}
```

Run: `npm install`
Expected: links `@getback/motor` and its three workspace deps. (No `index.ts` exists yet, but npm only links; that's fine.)

- [ ] **Step 2: Create the core types**

Create `packages/motor/src/types.ts`:

```ts
import type { Vec2 } from "@getback/math";

export type Direction = "down" | "up" | "left" | "right";

// Kinematic core shared by every mobile entity (sheep, and later the dog).
// `force` is a per-frame steering accumulator, zeroed after integration.
export interface Mobile {
  pos: Vec2;
  vel: Vec2;
  force: Vec2;
  radius: number;
  maxSpeed: number;
  maxForce: number;
  facing: Direction;
}

// Abstract player input the motor consumes (the app maps keys -> this). Unused
// until the dog arrives (Plan 4) but defined here as the motor's input contract.
export interface DogIntent {
  moveDir: Vec2; // normalized 8-way; {0,0} = stand
  sprint: boolean;
  bark: boolean;
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/motor/src/direction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { directionFromVelocity } from "./direction.js";

describe("directionFromVelocity", () => {
  it("picks the dominant axis (screen y points down)", () => {
    expect(directionFromVelocity({ x: 5, y: 0 }, "down")).toBe("right");
    expect(directionFromVelocity({ x: -5, y: 0 }, "down")).toBe("left");
    expect(directionFromVelocity({ x: 0, y: 5 }, "down")).toBe("down");
    expect(directionFromVelocity({ x: 0, y: -5 }, "down")).toBe("up");
  });
  it("keeps the previous facing when nearly stationary", () => {
    expect(directionFromVelocity({ x: 0, y: 0 }, "left")).toBe("left");
    expect(directionFromVelocity({ x: 0.00001, y: 0 }, "up")).toBe("up");
  });
  it("breaks ties toward the horizontal axis", () => {
    expect(directionFromVelocity({ x: 5, y: 5 }, "down")).toBe("down");
    expect(directionFromVelocity({ x: 6, y: 5 }, "down")).toBe("right");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/direction.test.ts`
Expected: FAIL — cannot resolve `./direction.js`.

- [ ] **Step 5: Write the implementation**

Create `packages/motor/src/direction.ts`:

```ts
import type { Vec2 } from "@getback/math";
import type { Direction } from "./types.js";

const EPS = 1e-4;

// Derive a 4-way facing from velocity. Near-zero velocity keeps the previous
// facing (no flicker when standing still). Vertical wins only when strictly
// greater, so exact diagonals resolve to the horizontal axis deterministically.
export function directionFromVelocity(vel: Vec2, prev: Direction): Direction {
  if (Math.abs(vel.x) < EPS && Math.abs(vel.y) < EPS) return prev;
  if (Math.abs(vel.y) > Math.abs(vel.x)) return vel.y > 0 ? "down" : "up";
  return vel.x > 0 ? "right" : "left";
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/direction.test.ts`
Expected: PASS — 3 tests green. (Note: the `{x:5,y:5}` tie returns "down" because `|y| > |x|` is false, so it falls through to horizontal... wait — recheck: for a tie the vertical branch is NOT taken, so it returns horizontal "right". The test expects "down" for `{5,5}`. Adjust the implementation tie-break to `>=`: see Step 7.)

- [ ] **Step 7: Fix the tie-break and re-run**

The test fixture expects an exact diagonal `{x:5,y:5}` to resolve to **vertical** ("down"), and `{x:6,y:5}` (horizontal-dominant) to "right". So vertical should win on ties. Update the comparison in `direction.ts` to:

```ts
  if (Math.abs(vel.y) >= Math.abs(vel.x)) return vel.y > 0 ? "down" : "up";
```

Run: `npx vitest run packages/motor/src/direction.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 8: Commit**

```bash
git add packages/motor/package.json packages/motor/src/types.ts packages/motor/src/direction.ts packages/motor/src/direction.test.ts package-lock.json
git commit -m "Scaffold @getback/motor with core types and directionFromVelocity"
```

---

### Task 2: Steering primitives (`seek` / `flee` / `arrive`)

**Files:**
- Create: `packages/motor/src/steering/primitives.ts`
- Create: `packages/motor/src/steering/primitives.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/steering/primitives.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seek, flee, arrive } from "./primitives.js";
import type { Mobile } from "../types.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: 5,
    maxSpeed: 10,
    maxForce: 100,
    facing: "down",
    ...over,
  };
}

describe("steering primitives", () => {
  it("seek steers toward the target at maxSpeed (from rest = desired velocity)", () => {
    const e = agent();
    const out = { x: 0, y: 0 };
    seek(e, { x: 100, y: 0 }, out);
    expect(out).toEqual({ x: 10, y: 0 }); // desired (10,0) - vel (0,0)
  });
  it("seek subtracts current velocity (steering, not teleport)", () => {
    const e = agent({ vel: { x: 4, y: 0 } });
    const out = { x: 0, y: 0 };
    seek(e, { x: 100, y: 0 }, out);
    expect(out).toEqual({ x: 6, y: 0 }); // 10 - 4
  });
  it("flee is the negation of seek's desired", () => {
    const e = agent();
    const out = { x: 0, y: 0 };
    flee(e, { x: 100, y: 0 }, out);
    expect(out).toEqual({ x: -10, y: 0 });
  });
  it("arrive ramps down speed inside the slow radius", () => {
    const e = agent();
    const out = { x: 0, y: 0 };
    // target 5 units away, slowRadius 10 => desired speed = maxSpeed * 5/10 = 5
    arrive(e, { x: 5, y: 0 }, 10, out);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(0);
  });
  it("seek at the target produces only braking", () => {
    const e = agent({ vel: { x: 3, y: 0 } });
    const out = { x: 0, y: 0 };
    seek(e, { x: 0, y: 0 }, out);
    expect(out).toEqual({ x: -3, y: 0 }); // desired 0, steer = -vel
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/steering/primitives.test.ts`
Expected: FAIL — cannot resolve `./primitives.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/steering/primitives.ts`:

```ts
import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";

// Reynolds steering. Each primitive WRITES the steering force into `out`
// (allocation-free): steer = desiredVelocity - currentVelocity.

export function seek(e: Mobile, target: Vec2, out: Vec2): void {
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const d = Math.hypot(dx, dy);
  const sx = d > 0 ? (dx / d) * e.maxSpeed : 0;
  const sy = d > 0 ? (dy / d) * e.maxSpeed : 0;
  out.x = sx - e.vel.x;
  out.y = sy - e.vel.y;
}

// Flee is the negation of seek's steering force.
export function flee(e: Mobile, target: Vec2, out: Vec2): void {
  seek(e, target, out);
  out.x = -out.x;
  out.y = -out.y;
}

// Arrive: like seek, but the desired speed ramps from maxSpeed down to 0 as the
// agent gets within `slowRadius` of the target, preventing overshoot.
export function arrive(e: Mobile, target: Vec2, slowRadius: number, out: Vec2): void {
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    out.x = -e.vel.x;
    out.y = -e.vel.y;
    return;
  }
  const speed = d < slowRadius ? e.maxSpeed * (d / slowRadius) : e.maxSpeed;
  out.x = (dx / d) * speed - e.vel.x;
  out.y = (dy / d) * speed - e.vel.y;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/steering/primitives.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/steering/primitives.ts packages/motor/src/steering/primitives.test.ts
git commit -m "Add motor steering primitives seek/flee/arrive"
```

---

### Task 3: Behavior node types + `blend` (prioritized truncation)

**Files:**
- Create: `packages/motor/src/steering/types.ts`
- Create: `packages/motor/src/steering/Behavior.ts`
- Create: `packages/motor/src/steering/Behavior.test.ts`

- [ ] **Step 1: Create the node types**

Create `packages/motor/src/steering/types.ts`:

```ts
import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";

export type Status = "fired" | "skipped";

// Read-only world refs a behavior may need. Grows in later plans (grass, pen, …).
export interface SteerContext {
  neighbors: readonly Mobile[];
  dt: number;
}

// A node WRITES its resulting steering force into `out` (overwrites, not adds)
// and returns whether it produced a force ("fired") or opted out ("skipped").
export interface BehaviorNode {
  run(e: Mobile, ctx: SteerContext, out: Vec2): Status;
}

export type Predicate = (e: Mobile, ctx: SteerContext) => boolean;
```

- [ ] **Step 2: Write the failing test**

Create `packages/motor/src/steering/Behavior.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Vec2 } from "@getback/math";
import { blend } from "./Behavior.js";
import type { BehaviorNode } from "./types.js";
import type { Mobile } from "../types.js";

// A leaf that always writes a constant force.
const constNode = (fx: number, fy: number): BehaviorNode => ({
  run(_e, _ctx, out: Vec2) {
    out.x = fx;
    out.y = fy;
    return "fired";
  },
});

const skipNode: BehaviorNode = {
  run(_e, _ctx, out: Vec2) {
    out.x = 0;
    out.y = 0;
    return "skipped";
  },
};

function agent(maxForce: number): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce, facing: "down",
  };
}

describe("blend", () => {
  it("sums weighted child forces", () => {
    const node = blend([
      { node: constNode(2, 0), weight: 1 },
      { node: constNode(0, 3), weight: 2 },
    ]);
    const out = { x: 0, y: 0 };
    node.run(agent(100), { neighbors: [], dt: 0 }, out);
    expect(out).toEqual({ x: 2, y: 6 });
  });

  it("truncates to maxForce in priority order, starving low-priority children", () => {
    // first child alone wants (100,0); maxForce 80 => clamps to (80,0), budget 0,
    // so the second child (0,50) gets no budget and is dropped.
    const node = blend([
      { node: constNode(100, 0), weight: 1 },
      { node: constNode(0, 50), weight: 1 },
    ]);
    const out = { x: 0, y: 0 };
    node.run(agent(80), { neighbors: [], dt: 0 }, out);
    expect(out.x).toBeCloseTo(80);
    expect(out.y).toBeCloseTo(0); // starved
  });

  it("ignores skipped children", () => {
    const node = blend([
      { node: skipNode, weight: 1 },
      { node: constNode(5, 0), weight: 1 },
    ]);
    const out = { x: 0, y: 0 };
    node.run(agent(100), { neighbors: [], dt: 0 }, out);
    expect(out).toEqual({ x: 5, y: 0 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/steering/Behavior.test.ts`
Expected: FAIL — cannot resolve `./Behavior.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/motor/src/steering/Behavior.ts`:

```ts
import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import type { BehaviorNode, SteerContext, Status } from "./types.js";

export interface WeightedChild {
  node: BehaviorNode;
  weight: number;
}

// The `combine()` of the design: walk children in priority order, add
// `childForce * weight` while tracking the remaining maxForce budget, and stop
// once it is spent — so high-priority children are never starved by low ones.
// Writes the combined force into `out`. Always "fired".
export function blend(children: WeightedChild[]): BehaviorNode {
  const scratch: Vec2 = { x: 0, y: 0 };
  return {
    run(e: Mobile, ctx: SteerContext, out: Vec2): Status {
      out.x = 0;
      out.y = 0;
      let budget = e.maxForce;
      for (const child of children) {
        if (budget <= 0) break;
        if (child.node.run(e, ctx, scratch) === "skipped") continue;
        let fx = scratch.x * child.weight;
        let fy = scratch.y * child.weight;
        let mag = Math.hypot(fx, fy);
        if (mag === 0) continue;
        if (mag > budget) {
          const s = budget / mag;
          fx *= s;
          fy *= s;
          mag = budget;
        }
        out.x += fx;
        out.y += fy;
        budget -= mag;
      }
      return "fired";
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/steering/Behavior.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/steering/Behavior.ts packages/motor/src/steering/Behavior.test.ts
git commit -m "Add motor behavior node types and prioritized blend"
```

---

### Task 4: Flocking leaf behaviors (`separation` / `cohesion` / `follow`)

**Files:**
- Create: `packages/motor/src/ai/behaviors.ts`
- Create: `packages/motor/src/ai/behaviors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/ai/behaviors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { separation, cohesion, follow } from "./behaviors.js";
import type { Mobile } from "../types.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("separation", () => {
  it("steers away from a close neighbor", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const near = agent({ pos: { x: 4, y: 0 } }); // within personalSpace 12
    const out = { x: 0, y: 0 };
    separation(12).run(self, { neighbors: [near], dt: 0 }, out);
    expect(out.x).toBeLessThan(0); // pushed in -x (away from neighbor at +x)
  });
  it("ignores neighbors beyond personalSpace", () => {
    const self = agent();
    const far = agent({ pos: { x: 50, y: 0 } });
    const out = { x: 1, y: 1 };
    separation(12).run(self, { neighbors: [far], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("cohesion", () => {
  it("steers toward the centroid of the k nearest neighbors", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const a = agent({ pos: { x: 10, y: 0 } });
    const b = agent({ pos: { x: 20, y: 0 } });
    const out = { x: 0, y: 0 };
    cohesion(6).run(self, { neighbors: [a, b], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0); // centroid is to the +x side
  });
});

describe("follow", () => {
  it("aligns toward the heading of moving neighbors", () => {
    const self = agent({ vel: { x: 0, y: 0 } });
    const mover = agent({ vel: { x: 8, y: 0 } }); // moving in +x
    const out = { x: 0, y: 0 };
    follow(2).run(self, { neighbors: [mover], dt: 0 }, out);
    expect(out.x).toBeGreaterThan(0);
  });
  it("ignores stationary neighbors", () => {
    const self = agent();
    const still = agent({ vel: { x: 0, y: 0 } });
    const out = { x: 1, y: 1 };
    follow(2).run(self, { neighbors: [still], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: FAIL — cannot resolve `./behaviors.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/ai/behaviors.ts`:

```ts
import type { Mobile } from "../types.js";
import type { BehaviorNode } from "../steering/types.js";
import { seek } from "../steering/primitives.js";

// All three return a Reynolds steering force (desiredVelocity - velocity) so
// their magnitudes are comparable for the weighted blend. Each writes into `out`
// and returns "fired" (a zero force is a valid, neutral contribution).

// Steer away from neighbours closer than `personalSpace`, weighted by 1/distance.
export function separation(personalSpace: number): BehaviorNode {
  return {
    run(e: Mobile, ctx, out) {
      let ax = 0;
      let ay = 0;
      for (const n of ctx.neighbors) {
        if (n === e) continue;
        const dx = e.pos.x - n.pos.x;
        const dy = e.pos.y - n.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < personalSpace) {
          ax += dx / d / d;
          ay += dy / d / d;
        }
      }
      const m = Math.hypot(ax, ay);
      if (m === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      out.x = (ax / m) * e.maxSpeed - e.vel.x;
      out.y = (ay / m) * e.maxSpeed - e.vel.y;
      return "fired";
    },
  };
}

// Steer toward the centroid of the `k` nearest neighbours (Strömbom rule).
export function cohesion(k: number): BehaviorNode {
  const scratch: { n: Mobile; d2: number }[] = [];
  return {
    run(e: Mobile, ctx, out) {
      scratch.length = 0;
      for (const n of ctx.neighbors) {
        if (n === e) continue;
        const dx = n.pos.x - e.pos.x;
        const dy = n.pos.y - e.pos.y;
        scratch.push({ n, d2: dx * dx + dy * dy });
      }
      if (scratch.length === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      scratch.sort((a, b) => a.d2 - b.d2);
      const count = Math.min(k, scratch.length);
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < count; i++) {
        cx += scratch[i]!.n.pos.x;
        cy += scratch[i]!.n.pos.y;
      }
      seek(e, { x: cx / count, y: cy / count }, out);
      return "fired";
    },
  };
}

// Align toward the average heading of neighbours that are actually moving
// (speed above `moveThreshold`). Contagious motion; stationary grazers ignored.
export function follow(moveThreshold: number): BehaviorNode {
  const t2 = moveThreshold * moveThreshold;
  return {
    run(e: Mobile, ctx, out) {
      let vx = 0;
      let vy = 0;
      for (const n of ctx.neighbors) {
        if (n === e) continue;
        if (n.vel.x * n.vel.x + n.vel.y * n.vel.y >= t2) {
          vx += n.vel.x;
          vy += n.vel.y;
        }
      }
      const m = Math.hypot(vx, vy);
      if (m === 0) {
        out.x = 0;
        out.y = 0;
        return "fired";
      }
      out.x = (vx / m) * e.maxSpeed - e.vel.x;
      out.y = (vy / m) * e.maxSpeed - e.vel.y;
      return "fired";
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts
git commit -m "Add motor flocking leaf behaviors separation/cohesion/follow"
```

---

### Task 5: `MovementSystem` (semi-implicit Euler)

**Files:**
- Create: `packages/motor/src/config.ts`
- Create: `packages/motor/src/systems/MovementSystem.ts`
- Create: `packages/motor/src/systems/MovementSystem.test.ts`

- [ ] **Step 1: Create the config**

Create `packages/motor/src/config.ts`:

```ts
// All movement/flock tunables in one place. Grows in later plans.
export const config = {
  dtClampMax: 1 / 30, // clamp dt to avoid integration blow-ups / tunneling on hitches
  damping: 0.1, // velocity fraction RETAINED per second when no force (coast to stop)
  flock: {
    radius: 5,
    maxSpeed: 38,
    maxForce: 80,
    personalSpace: 12,
    perception: 40,
    cohesionK: 6,
    moveThreshold: 2, // px/s: a neighbour faster than this counts as "moving" for follow
    weights: { separation: 1.6, cohesion: 0.9, follow: 0.5 },
  },
  bounds: { x: 0, y: 0, w: 480, h: 270 },
} as const;
```

- [ ] **Step 2: Write the failing test**

Create `packages/motor/src/systems/MovementSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { integrate, movementSystem } from "./MovementSystem.js";
import type { Mobile } from "../types.js";

function agent(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("integrate (semi-implicit Euler)", () => {
  it("updates velocity first, then moves position with the NEW velocity", () => {
    const e = agent({ force: { x: 100, y: 0 } });
    integrate(e, 0.1); // force truncated to maxForce 100; vel += 100*0.1 = 10
    expect(e.vel.x).toBeCloseTo(10);
    expect(e.pos.x).toBeCloseTo(1); // pos += newVel(10) * 0.1
  });
  it("clamps speed to maxSpeed", () => {
    const e = agent({ force: { x: 1000, y: 0 }, maxForce: 1000 });
    integrate(e, 1); // vel would be 1000, clamped to maxSpeed 10
    expect(Math.hypot(e.vel.x, e.vel.y)).toBeCloseTo(10);
  });
  it("zeroes the force accumulator after integrating", () => {
    const e = agent({ force: { x: 5, y: 5 } });
    integrate(e, 0.1);
    expect(e.force).toEqual({ x: 0, y: 0 });
  });
  it("applies damping (coast toward stop) when there is no force", () => {
    const e = agent({ vel: { x: 10, y: 0 }, force: { x: 0, y: 0 } });
    integrate(e, 1); // damping 0.1/s => vel *= 0.1
    expect(e.vel.x).toBeCloseTo(1);
  });
  it("updates facing from the new velocity", () => {
    const e = agent({ force: { x: 0, y: 50 }, facing: "up" });
    integrate(e, 0.1);
    expect(e.facing).toBe("down");
  });
  it("clamps dt at the system level", () => {
    const e = agent({ force: { x: 10, y: 0 } });
    movementSystem([e], 1000); // dt clamped to dtClampMax (1/30)
    expect(e.vel.x).toBeCloseTo(10 * (1 / 30));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/MovementSystem.test.ts`
Expected: FAIL — cannot resolve `./MovementSystem.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/motor/src/systems/MovementSystem.ts`:

```ts
import type { Mobile } from "../types.js";
import { directionFromVelocity } from "../direction.js";
import { config } from "../config.js";

// Semi-implicit (symplectic) Euler: update velocity first, then advance position
// with the NEW velocity. `force` is assumed already accumulated by SteeringSystem.
export function integrate(e: Mobile, dt: number): void {
  // truncate force to maxForce
  const fl = Math.hypot(e.force.x, e.force.y);
  if (fl > e.maxForce && fl > 0) {
    const s = e.maxForce / fl;
    e.force.x *= s;
    e.force.y *= s;
  }
  // velocity first (mass = 1)
  e.vel.x += e.force.x * dt;
  e.vel.y += e.force.y * dt;
  // clamp to maxSpeed
  const sl = Math.hypot(e.vel.x, e.vel.y);
  if (sl > e.maxSpeed && sl > 0) {
    const s = e.maxSpeed / sl;
    e.vel.x *= s;
    e.vel.y *= s;
  }
  // position uses the NEW velocity
  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  // coast to a graceful stop when nothing is pushing
  if (fl < 1e-6) {
    const damp = Math.pow(config.damping, dt);
    e.vel.x *= damp;
    e.vel.y *= damp;
  }
  e.facing = directionFromVelocity(e.vel, e.facing);
  e.force.x = 0;
  e.force.y = 0;
}

export function movementSystem(entities: Mobile[], dt: number): void {
  const clamped = Math.min(dt, config.dtClampMax);
  for (const e of entities) integrate(e, clamped);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/MovementSystem.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/systems/MovementSystem.ts packages/motor/src/systems/MovementSystem.test.ts
git commit -m "Add motor config and semi-implicit Euler MovementSystem"
```

---

### Task 6: Sheep entity + flock tree

**Files:**
- Create: `packages/motor/src/entities/Sheep.ts`
- Create: `packages/motor/src/ai/trees.ts`
- Create: `packages/motor/src/entities/Sheep.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/entities/Sheep.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSheep, defaultSheepTraits } from "./Sheep.js";

describe("createSheep", () => {
  it("builds a Mobile sheep at the given position with a behavior tree", () => {
    const s = createSheep({ x: 50, y: 60 }, defaultSheepTraits());
    expect(s.pos).toEqual({ x: 50, y: 60 });
    expect(s.vel).toEqual({ x: 0, y: 0 });
    expect(s.force).toEqual({ x: 0, y: 0 });
    expect(s.neighbors).toEqual([]);
    expect(typeof s.root.run).toBe("function");
    expect(s.maxSpeed).toBe(s.traits.maxSpeed);
  });
  it("copies the position (no shared reference)", () => {
    const pos = { x: 1, y: 2 };
    const s = createSheep(pos, defaultSheepTraits());
    pos.x = 999;
    expect(s.pos.x).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/entities/Sheep.test.ts`
Expected: FAIL — cannot resolve `./Sheep.js`.

- [ ] **Step 3: Write the flock tree builder**

Create `packages/motor/src/ai/trees.ts`:

```ts
import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { separation, cohesion, follow } from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root behavior tree: a prioritized blend of the social forces.
// Built per-sheep so each animal's traits (personalSpace, sociability) bake in.
export function buildFlockTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  return blend([
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
  ]);
}
```

- [ ] **Step 4: Write the Sheep entity**

Create `packages/motor/src/entities/Sheep.ts`:

```ts
import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import type { BehaviorNode } from "../steering/types.js";
import { config } from "../config.js";
import { buildFlockTree } from "../ai/trees.js";

export interface SheepTraits {
  maxSpeed: number;
  maxForce: number;
  personalSpace: number;
  perception: number;
  sociability: number; // [0..1] scales cohesion + follow
}

export interface Sheep extends Mobile {
  traits: SheepTraits;
  neighbors: Sheep[]; // refilled each frame by NeighborhoodSystem
  root: BehaviorNode;
}

export function defaultSheepTraits(): SheepTraits {
  return {
    maxSpeed: config.flock.maxSpeed,
    maxForce: config.flock.maxForce,
    personalSpace: config.flock.personalSpace,
    perception: config.flock.perception,
    sociability: 1,
  };
}

export function createSheep(pos: Vec2, traits: SheepTraits): Sheep {
  return {
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: config.flock.radius,
    maxSpeed: traits.maxSpeed,
    maxForce: traits.maxForce,
    facing: "down",
    traits,
    neighbors: [],
    root: buildFlockTree(traits),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/entities/Sheep.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/entities/Sheep.ts packages/motor/src/ai/trees.ts packages/motor/src/entities/Sheep.test.ts
git commit -m "Add motor Sheep entity and flock behavior tree"
```

---

### Task 7: `NeighborhoodSystem` + `SteeringSystem`

**Files:**
- Create: `packages/motor/src/systems/NeighborhoodSystem.ts`
- Create: `packages/motor/src/systems/SteeringSystem.ts`
- Create: `packages/motor/src/systems/NeighborhoodSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/systems/NeighborhoodSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { UniformGrid } from "@getback/spatial";
import { neighborhoodSystem } from "./NeighborhoodSystem.js";
import { steeringSystem } from "./SteeringSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";

describe("neighborhoodSystem", () => {
  it("fills each sheep's neighbors within its perception radius, excluding itself", () => {
    const t = defaultSheepTraits(); // perception 40
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 20, y: 0 }, t); // within 40
    const c = createSheep({ x: 200, y: 0 }, t); // outside 40
    const sheep = [a, b, c];
    const grid = new UniformGrid<Sheep>(40);

    neighborhoodSystem(sheep, grid);

    expect(a.neighbors).toContain(b);
    expect(a.neighbors).not.toContain(c);
    expect(a.neighbors).not.toContain(a);
  });

  it("is recomputed cleanly each call (no stale neighbors)", () => {
    const t = defaultSheepTraits();
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 20, y: 0 }, t);
    const sheep = [a, b];
    const grid = new UniformGrid<Sheep>(40);
    neighborhoodSystem(sheep, grid);
    expect(a.neighbors.length).toBe(1);
    b.pos.x = 500; // move b far away
    neighborhoodSystem(sheep, grid);
    expect(a.neighbors.length).toBe(0);
  });
});

describe("steeringSystem", () => {
  it("writes a non-zero force into a sheep being pulled toward a neighbor", () => {
    const t = defaultSheepTraits();
    const a = createSheep({ x: 0, y: 0 }, t);
    const b = createSheep({ x: 30, y: 0 }, t); // within perception, beyond personalSpace
    const sheep = [a, b];
    const grid = new UniformGrid<Sheep>(40);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, 1 / 60);
    expect(Math.hypot(a.force.x, a.force.y)).toBeGreaterThan(0);
    expect(a.force.x).toBeGreaterThan(0); // cohesion pulls toward b at +x
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/NeighborhoodSystem.test.ts`
Expected: FAIL — cannot resolve `./NeighborhoodSystem.js`.

- [ ] **Step 3: Write `NeighborhoodSystem`**

Create `packages/motor/src/systems/NeighborhoodSystem.ts`:

```ts
import type { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";

// Rebuild the grid from current positions, then fill each sheep's neighbors with
// the others inside its perception radius (precise check after the broad-phase).
export function neighborhoodSystem(sheep: Sheep[], grid: UniformGrid<Sheep>): void {
  grid.clear();
  for (const s of sheep) grid.insert(s);
  const candidates: Sheep[] = [];
  for (const s of sheep) {
    s.neighbors.length = 0;
    const r = s.traits.perception;
    grid.queryRadius(s.pos, r, candidates);
    const r2 = r * r;
    for (const c of candidates) {
      if (c === s) continue;
      const dx = c.pos.x - s.pos.x;
      const dy = c.pos.y - s.pos.y;
      if (dx * dx + dy * dy <= r2) s.neighbors.push(c);
    }
  }
}
```

- [ ] **Step 4: Write `SteeringSystem`**

Create `packages/motor/src/systems/SteeringSystem.ts`:

```ts
import type { Sheep } from "../entities/Sheep.js";
import type { SteerContext } from "../steering/types.js";

// Evaluate each sheep's behavior tree, writing the resulting steering force into
// `sheep.force` for MovementSystem to integrate.
export function steeringSystem(sheep: Sheep[], dt: number): void {
  for (const s of sheep) {
    const ctx: SteerContext = { neighbors: s.neighbors, dt };
    s.root.run(s, ctx, s.force);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/NeighborhoodSystem.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/systems/NeighborhoodSystem.ts packages/motor/src/systems/SteeringSystem.ts packages/motor/src/systems/NeighborhoodSystem.test.ts
git commit -m "Add motor Neighborhood and Steering systems"
```

---

### Task 8: `World` + `Game` + barrel + flocking integration test

**Files:**
- Create: `packages/motor/src/world/World.ts`
- Create: `packages/motor/src/world/Game.ts`
- Create: `packages/motor/src/index.ts`
- Create: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Write the World**

Create `packages/motor/src/world/World.ts`:

```ts
import { UniformGrid } from "@getback/spatial";
import type { Sheep } from "../entities/Sheep.js";
import { config } from "../config.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface World {
  sheep: Sheep[];
  bounds: Rect;
  grid: UniformGrid<Sheep>;
}

export function createWorld(sheep: Sheep[] = []): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grid: new UniformGrid<Sheep>(config.flock.perception),
  };
}
```

- [ ] **Step 2: Write the Game loop**

Create `packages/motor/src/world/Game.ts`:

```ts
import type { World } from "./World.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem } from "../systems/MovementSystem.js";

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {}

  update(dt: number): void {
    neighborhoodSystem(this.world.sheep, this.world.grid);
    steeringSystem(this.world.sheep, dt);
    movementSystem(this.world.sheep, dt);
  }
}
```

- [ ] **Step 3: Write the public barrel**

Create `packages/motor/src/index.ts`:

```ts
export type { Direction, Mobile, DogIntent } from "./types.js";
export { directionFromVelocity } from "./direction.js";
export { config } from "./config.js";
export { seek, flee, arrive } from "./steering/primitives.js";
export type { Status, SteerContext, BehaviorNode, Predicate } from "./steering/types.js";
export { blend } from "./steering/Behavior.js";
export type { WeightedChild } from "./steering/Behavior.js";
export { separation, cohesion, follow } from "./ai/behaviors.js";
export { buildFlockTree } from "./ai/trees.js";
export type { Sheep, SheepTraits } from "./entities/Sheep.js";
export { createSheep, defaultSheepTraits } from "./entities/Sheep.js";
export { neighborhoodSystem } from "./systems/NeighborhoodSystem.js";
export { steeringSystem } from "./systems/SteeringSystem.js";
export { movementSystem, integrate } from "./systems/MovementSystem.js";
export type { World, Rect } from "./world/World.js";
export { createWorld } from "./world/World.js";
export { Game } from "./world/Game.js";
```

- [ ] **Step 4: Write the integration test**

Create `packages/motor/src/world/Game.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Game } from "./Game.js";
import { createWorld } from "./World.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";

function centroid(sheep: Sheep[]) {
  const c = { x: 0, y: 0 };
  for (const s of sheep) {
    c.x += s.pos.x;
    c.y += s.pos.y;
  }
  c.x /= sheep.length;
  c.y /= sheep.length;
  return c;
}

// Average distance of the flock from its centroid — a measure of "spread".
function spread(sheep: Sheep[]) {
  const c = centroid(sheep);
  let s = 0;
  for (const sh of sheep) s += Math.hypot(sh.pos.x - c.x, sh.pos.y - c.y);
  return s / sheep.length;
}

function minPairwise(sheep: Sheep[]) {
  let m = Infinity;
  for (let a = 0; a < sheep.length; a++) {
    for (let b = a + 1; b < sheep.length; b++) {
      m = Math.min(m, Math.hypot(sheep[a]!.pos.x - sheep[b]!.pos.x, sheep[a]!.pos.y - sheep[b]!.pos.y));
    }
  }
  return m;
}

describe("flocking integration", () => {
  it("a scattered flock cohesively pulls together without collapsing onto itself", () => {
    // Start spread out but inside perception (40), so cohesion dominates first.
    const t = () => ({ ...defaultSheepTraits(), perception: 80 });
    const sheep = [
      createSheep({ x: 100, y: 120 }, t()),
      createSheep({ x: 160, y: 120 }, t()),
      createSheep({ x: 130, y: 170 }, t()),
      createSheep({ x: 130, y: 90 }, t()),
    ];
    const game = new Game(createWorld(sheep));

    const spread0 = spread(sheep);
    for (let i = 0; i < 1200; i++) game.update(1 / 60); // 20 simulated seconds

    const spread1 = spread(sheep);

    // Cohesion brought them meaningfully closer together.
    expect(spread1).toBeLessThan(spread0 * 0.7);
    // Separation prevented them from collapsing into the same point.
    expect(minPairwise(sheep)).toBeGreaterThan(4);
    // Simulation stayed numerically sane.
    for (const s of sheep) {
      expect(Number.isFinite(s.pos.x)).toBe(true);
      expect(Number.isFinite(s.pos.y)).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the integration test**

Run: `npx vitest run packages/motor/src/world/Game.test.ts`
Expected: PASS. If `spread1 < spread0 * 0.7` fails (flock didn't converge) or `minPairwise > 4` fails (collapsed), the flock weights in `config.ts` need tuning — adjust `weights.cohesion` up / `weights.separation` relative to it and document the change. Do NOT weaken the assertions to force a pass; the behavior (converge but don't collapse) is the actual requirement. If you cannot get stable convergence after reasonable tuning, report DONE_WITH_CONCERNS with what you observed.

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: PASS — every motor test plus the Plan 1 packages (on the order of 23 + ~25 motor tests).

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Add motor World, Game loop, and flocking integration test"
```

---

## Self-review

**Spec coverage (against §6, §7, §8):**
- `Mobile` kinematic core (§6) → Task 1 ✓
- Steering primitives `seek/flee/arrive` (§7.1) → Task 2 ✓
- `BehaviorNode` + `combine()` prioritized truncation (§2.2, §7.2b) → Task 3 (`blend`) ✓
- Flocking leaves: separation, k-nearest cohesion, contagious follow (§7.3, §8.4) → Task 4 ✓
- Semi-implicit Euler integration, damping, facing, dt clamp (§7.2) → Task 5 ✓
- Sheep traits + per-sheep flock tree (§8.5) → Task 6 ✓
- Neighborhood precompute via uniform grid (§2.2) + SteeringSystem (§5.2 step 7) → Task 7 ✓
- World + Game pipeline `Neighborhood → Steering → Movement` (§5.2) → Task 8 ✓
- **Deliberately deferred** (correct, per scope): `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes, drives/goals, grass, collision, pen, dog/`intentFollow`, scare, stamina, treats, respawn, signals wiring → Plans 3–4. The `DogIntent` type is defined now but unused (it's the motor's input contract); `Game.update(dt)` gains an `intent` arg in Plan 4.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `Mobile`, `Vec2`, `Direction`, `SheepTraits`, `Sheep`, `BehaviorNode`, `SteerContext`, `Status`, `WeightedChild` are each defined once and imported consistently. Behaviors take `(e: Mobile, ctx, out)` everywhere; `blend` children are `WeightedChild`. `SteerContext` has exactly `{ neighbors, dt }` in this plan (grows later). The barrel re-exports only symbols that exist. `.js` import extensions throughout (verified pattern from Plan 1).

**Known tuning risk:** the integration test (Task 8) asserts emergent behavior; the starting `config.flock.weights` are reasonable but the executor may need to nudge cohesion/separation balance. This is anticipated and the task tells them to tune config (not the assertions).

---

## Next plans (not part of this one)

- **Plan 3 — Motor: environment & collision:** `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes; grass field + gradient grazing; drives (hunger/thirst/fear) + DriveSystem; goal behaviors (gradientFollow/arrive water/shade); swept circle-segment + closest-feature collision; one-way gate; pen generation + capture.
- **Plan 4 — Motor: dog, fun layer, respawn:** `intentFollow` leaf + dog entity; ScareSystem/bark; StaminaSystem; treats + Emitter + Pool + BuffSystem; pen fill + respawn; ambient scares; `GameSignals` wiring; `Game.update(dt, intent)`.
- **Plan 5 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*`.
