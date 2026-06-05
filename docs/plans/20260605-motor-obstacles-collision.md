# Motor: Point Obstacles & Collision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put solid **point obstacles** (trees, rocks) on the pasture: sheep can't walk through them (circle-circle collision resolution with sliding), and an `obstacleAvoid` steering leaf makes them gracefully veer around — verified headless.

**Architecture:** Extends `@getback/motor`. An `Obstacle` is a circle (`pos`, `radius`). A `CollisionSystem` runs **after** movement each frame and resolves any unit penetrating an obstacle: push out along the center→center axis, remove the inward velocity component (slide). Circle-circle resolution is **side-unambiguous and tunnel-free** for our clamped speeds (`maxSpeed·dtClampMax ≪ obstacle radius`), so no swept CCD is needed here. A soft `obstacleAvoid` steering leaf, blended into the sheep tree, makes avoidance look natural rather than relying on the hard push-out. `SteeringSystem` is refactored to take an `env` object so future world refs (pen, attractors) don't churn its signature.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–3 (merged to `master`).

**Plan 4** of the roadmap (3 grass · **4 obstacles/collision** · 5 pen+fence collision · 6 dog/fun/respawn · 7 game+apps). Depends on Plan 3. **Out of scope (later plans):** fence-segment collision + closest-feature + swept CCD + one-way gate (Plan 5, with the pen, where the polygon gives inside/outside truth); the `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes (first needed by the pen); StaticIndex broad-phase (deferred until the pen adds many fence segments — a handful of obstacles is iterated directly).

---

## File structure (created/modified)

```
packages/motor/src/
  entities/Obstacle.ts             # NEW: Obstacle (circle) + createObstacle
  entities/Obstacle.test.ts        # NEW
  systems/CollisionSystem.ts       # NEW: circle-circle push-out + slide
  systems/CollisionSystem.test.ts  # NEW
  ai/behaviors.ts                  # MODIFIED: add obstacleAvoid
  ai/behaviors.test.ts             # MODIFIED: add obstacleAvoid tests; add obstacles:[] to ctx literals
  ai/trees.ts                      # MODIFIED: buildSheepTree adds obstacleAvoid
  steering/types.ts                # MODIFIED: SteerContext gains `obstacles`
  steering/Behavior.test.ts        # MODIFIED: add obstacles:[] to ctx literals
  config.ts                        # MODIFIED: add obstacleAvoid tunables
  systems/SteeringSystem.ts        # MODIFIED: signature -> (sheep, env, dt); SteerEnv type
  systems/NeighborhoodSystem.test.ts # MODIFIED: update steeringSystem(...) call
  world/World.ts                   # MODIFIED: World gains `obstacles`; createWorld param
  world/Game.ts                    # MODIFIED: SteeringSystem env call; add CollisionSystem after movement
  world/Game.test.ts               # MODIFIED: add obstacle-collision integration test
  index.ts                         # MODIFIED: export Obstacle/createObstacle, collisionSystem, obstacleAvoid, SteerEnv
```

**Shared facts:** `.js` import extensions on `.ts` sources. `Vec2 = {x,y}` from `@getback/math`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `Obstacle` entity

**Files:**
- Create: `packages/motor/src/entities/Obstacle.ts`
- Create: `packages/motor/src/entities/Obstacle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/entities/Obstacle.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createObstacle } from "./Obstacle.js";

describe("createObstacle", () => {
  it("builds a circle obstacle of the given kind/pos/radius", () => {
    const o = createObstacle("rock", { x: 10, y: 20 }, 8);
    expect(o.kind).toBe("rock");
    expect(o.pos).toEqual({ x: 10, y: 20 });
    expect(o.radius).toBe(8);
  });
  it("copies the position (no shared reference)", () => {
    const pos = { x: 1, y: 2 };
    const o = createObstacle("tree", pos, 12);
    pos.x = 999;
    expect(o.pos.x).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/entities/Obstacle.test.ts`
Expected: FAIL — cannot resolve `./Obstacle.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/entities/Obstacle.ts`:
```ts
import type { Vec2 } from "@getback/math";

export type ObstacleKind = "tree" | "rock";

// A solid point obstacle, modelled as a circle.
export interface Obstacle {
  kind: ObstacleKind;
  pos: Vec2;
  radius: number;
}

export function createObstacle(kind: ObstacleKind, pos: Vec2, radius: number): Obstacle {
  return { kind, pos: { x: pos.x, y: pos.y }, radius };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/entities/Obstacle.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/entities/Obstacle.ts packages/motor/src/entities/Obstacle.test.ts
git commit -m "Add motor Obstacle circle entity"
```

---

### Task 2: `CollisionSystem` — circle-circle push-out + slide

**Files:**
- Create: `packages/motor/src/systems/CollisionSystem.ts`
- Create: `packages/motor/src/systems/CollisionSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/systems/CollisionSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { collisionSystem } from "./CollisionSystem.js";
import { createObstacle } from "../entities/Obstacle.js";
import type { Mobile } from "../types.js";

function unit(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("collisionSystem", () => {
  it("pushes a penetrating unit out to the obstacle surface", () => {
    const u = unit({ pos: { x: 3, y: 0 } }); // 3 from center, radius 5 + obstacle 5 = should be 10 apart
    const o = createObstacle("rock", { x: 0, y: 0 }, 5);
    collisionSystem([u], [o]);
    expect(Math.hypot(u.pos.x, u.pos.y)).toBeCloseTo(10); // pushed to surface distance (5+5)
    expect(u.pos.x).toBeGreaterThan(0); // pushed in +x, away from the obstacle
  });

  it("leaves a non-overlapping unit untouched", () => {
    const u = unit({ pos: { x: 100, y: 0 } });
    const o = createObstacle("rock", { x: 0, y: 0 }, 5);
    collisionSystem([u], [o]);
    expect(u.pos).toEqual({ x: 100, y: 0 });
  });

  it("removes the inward velocity component (slide), keeping tangential motion", () => {
    // unit just +x of the obstacle, moving straight into it (-x) plus along +y.
    const u = unit({ pos: { x: 6, y: 0 }, vel: { x: -8, y: 4 } });
    const o = createObstacle("rock", { x: 0, y: 0 }, 5);
    collisionSystem([u], [o]);
    // inward (-x) component removed; tangential (+y) preserved.
    expect(u.vel.x).toBeCloseTo(0);
    expect(u.vel.y).toBeCloseTo(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/CollisionSystem.test.ts`
Expected: FAIL — cannot resolve `./CollisionSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/systems/CollisionSystem.ts`:
```ts
import type { Mobile } from "../types.js";
import type { Obstacle } from "../entities/Obstacle.js";

// Resolve circle-circle penetration between each unit and the static obstacles.
// Push the unit out along the center->center axis, then remove the velocity
// component pointing INTO the obstacle so it slides along the surface instead of
// sticking. Runs after movement.
//
// Static (non-swept) resolution is sufficient here: per-frame displacement
// (maxSpeed * dtClampMax) is far smaller than any obstacle radius, so a unit
// cannot skip across an obstacle in one frame, and circle-circle push-out has no
// "which side" ambiguity (always push apart). Fence segments (which DO need swept
// CCD + side-truth) are a later plan.
export function collisionSystem(units: Mobile[], obstacles: Obstacle[]): void {
  for (const u of units) {
    for (const o of obstacles) {
      const dx = u.pos.x - o.pos.x;
      const dy = u.pos.y - o.pos.y;
      const min = u.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d === 0) {
        u.pos.y -= min; // concentric: push out in a stable arbitrary direction
        continue;
      }
      const nx = dx / d;
      const ny = dy / d;
      const push = min - d;
      u.pos.x += nx * push;
      u.pos.y += ny * push;
      const vn = u.vel.x * nx + u.vel.y * ny; // velocity along the outward normal
      if (vn < 0) {
        // moving inward: cancel that component (slide)
        u.vel.x -= vn * nx;
        u.vel.y -= vn * ny;
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/CollisionSystem.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/CollisionSystem.ts packages/motor/src/systems/CollisionSystem.test.ts
git commit -m "Add motor CollisionSystem circle-circle resolution"
```

---

### Task 3: `obstacleAvoid` steering leaf + `SteerContext.obstacles`

**Files:**
- Modify: `packages/motor/src/steering/types.ts`
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/ai/behaviors.ts`
- Modify: `packages/motor/src/ai/behaviors.test.ts`
- Modify: `packages/motor/src/steering/Behavior.test.ts`

- [ ] **Step 1: Grow `SteerContext` with `obstacles`**

In `packages/motor/src/steering/types.ts`, add `import type { Obstacle } from "../entities/Obstacle.js";` near the imports, and add an `obstacles` field so `SteerContext` becomes:
```ts
export interface SteerContext {
  neighbors: readonly Mobile[];
  grass: GrassField;
  obstacles: readonly Obstacle[];
  dt: number;
}
```

- [ ] **Step 2: Add config tunables**

In `packages/motor/src/config.ts`, add inside the `config` object (after `graze`):
```ts
  obstacleAvoid: { weight: 1.6, avoidRadius: 18 },
```

- [ ] **Step 3: Add the failing test**

In `packages/motor/src/ai/behaviors.test.ts`: add `obstacleAvoid` to the `./behaviors.js` import and `import { createObstacle } from "../entities/Obstacle.js";`. **Every existing context literal in this file now needs an `obstacles` field** (`SteerContext` requires it). Add `obstacles: [],` to each existing ctx literal (the separation/cohesion/follow/graze tests). Then append:
```ts
describe("obstacleAvoid", () => {
  it("steers away from a nearby obstacle", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const obs = createObstacle("rock", { x: 12, y: 0 }, 8); // within radius+avoidRadius
    const out = { x: 0, y: 0 };
    obstacleAvoid(18).run(self, { neighbors: [], grass: noGrass, obstacles: [obs], dt: 0 }, out);
    expect(out.x).toBeLessThan(0); // pushed in -x, away from the obstacle at +x
  });
  it("ignores obstacles outside the avoid range", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const obs = createObstacle("rock", { x: 500, y: 0 }, 8);
    const out = { x: 1, y: 1 };
    obstacleAvoid(18).run(self, { neighbors: [], grass: noGrass, obstacles: [obs], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
```
(`noGrass` is the shared inert field already defined near the top of this file from the previous plan.)

- [ ] **Step 4: Update `Behavior.test.ts` ctx literals**

In `packages/motor/src/steering/Behavior.test.ts`, the existing ctx literals (`{ neighbors: [], grass: ..., dt: 0 }`) now also need `obstacles: []`. Add `obstacles: [],` to each. (There is already a `noGrass` constant there from the previous plan; reuse it.)

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: FAIL — `obstacleAvoid` is not exported yet (and/or type errors until ctx literals include `obstacles`).

- [ ] **Step 6: Implement `obstacleAvoid`**

Append to `packages/motor/src/ai/behaviors.ts` (add the import at the top: `import type { Obstacle } from "../entities/Obstacle.js";`):
```ts
// Soft look-ahead repulsion: steer away from obstacles within (radius+avoidRadius),
// stronger the closer they are. Reynolds steer toward the away-direction.
export function obstacleAvoid(avoidRadius: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      let ax = 0;
      let ay = 0;
      for (const o of ctx.obstacles) {
        const dx = e.pos.x - o.pos.x;
        const dy = e.pos.y - o.pos.y;
        const d = Math.hypot(dx, dy);
        const range = o.radius + avoidRadius;
        if (d > 0 && d < range) {
          const strength = (range - d) / range; // 1 at the surface -> 0 at the edge
          ax += (dx / d) * strength;
          ay += (dy / d) * strength;
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
```

- [ ] **Step 7: Run the tests to verify they pass + typecheck**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts packages/motor/src/steering/Behavior.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0 (catches any ctx literal missing `obstacles`).

- [ ] **Step 8: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/config.ts packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts packages/motor/src/steering/Behavior.test.ts
git commit -m "Add motor obstacleAvoid behavior and obstacles in SteerContext"
```

---

### Task 4: Wire obstacles into the tree, systems, and world

**Files:**
- Modify: `packages/motor/src/systems/SteeringSystem.ts`
- Modify: `packages/motor/src/systems/NeighborhoodSystem.test.ts`
- Modify: `packages/motor/src/ai/trees.ts`
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Refactor `SteeringSystem` to take an `env` object**

Replace `packages/motor/src/systems/SteeringSystem.ts` with:
```ts
import type { Sheep } from "../entities/Sheep.js";
import type { GrassField } from "../grass/GrassField.js";
import type { Obstacle } from "../entities/Obstacle.js";
import type { SteerContext } from "../steering/types.js";

// World refs the steering trees read each frame (grows as more behaviors land).
export interface SteerEnv {
  grass: GrassField;
  obstacles: readonly Obstacle[];
}

export function steeringSystem(sheep: Sheep[], env: SteerEnv, dt: number): void {
  for (const s of sheep) {
    const ctx: SteerContext = { neighbors: s.neighbors, grass: env.grass, obstacles: env.obstacles, dt };
    s.root.run(s, ctx, s.force);
  }
}
```

- [ ] **Step 2: Fix the `NeighborhoodSystem.test.ts` steering call**

In `packages/motor/src/systems/NeighborhoodSystem.test.ts`, the `steeringSystem(sheep, grass, 1/60)` call must become an env object. Change it to:
```ts
    steeringSystem(sheep, { grass, obstacles: [] }, 1 / 60);
```
(The `grass` variable already exists in that test from the previous plan.)

- [ ] **Step 3: Add `obstacleAvoid` to the sheep tree**

In `packages/motor/src/ai/trees.ts`, import `obstacleAvoid` and `config`, and add it to the blend (high priority — avoidance should outrank the social/graze forces). The blend becomes:
```ts
import { separation, cohesion, follow, graze, obstacleAvoid } from "./behaviors.js";
// ...
  return blend([
    { node: obstacleAvoid(config.obstacleAvoid.avoidRadius), weight: config.obstacleAvoid.weight },
    { node: graze(), weight: config.graze.weight },
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
  ]);
```

- [ ] **Step 4: `World` gains `obstacles`**

In `packages/motor/src/world/World.ts`: import `Obstacle`, add `obstacles: Obstacle[];` to the `World` interface, and add an `obstacles` parameter to `createWorld`:
```ts
import type { Obstacle } from "../entities/Obstacle.js";
// ... in World interface, after grass:
  obstacles: Obstacle[];
// ... change the signature:
export function createWorld(
  sheep: Sheep[] = [],
  grass: GrassField = defaultGrass(),
  obstacles: Obstacle[] = [],
): World {
  return { sheep, bounds: { ...config.bounds }, grass, obstacles, grid: new UniformGrid<Sheep>(config.flock.perception) };
}
```

- [ ] **Step 5: `Game` pipeline — env steering + CollisionSystem after movement**

In `packages/motor/src/world/Game.ts`, import `collisionSystem`, destructure `obstacles`, pass an env to `steeringSystem`, and add the collision pass after movement:
```ts
import { collisionSystem } from "../systems/CollisionSystem.js";
// ... inside update():
    const { sheep, grass, obstacles, grid } = this.world;
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, step);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, { grass, obstacles }, step);
    movementSystem(sheep, step);
    collisionSystem(sheep, obstacles);
```

- [ ] **Step 6: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export type { Obstacle, ObstacleKind } from "./entities/Obstacle.js";
export { createObstacle } from "./entities/Obstacle.js";
export { collisionSystem } from "./systems/CollisionSystem.js";
export type { SteerEnv } from "./systems/SteeringSystem.js";
```
and add `obstacleAvoid` to the existing `./ai/behaviors.js` export.

- [ ] **Step 7: Full verification**

Run: `npm test`
Expected: PASS — every existing test (the Plan-2 flocking and Plan-3 grazing integration tests call `createWorld(sheep[, grass])` with no obstacles, so the new collision/avoidance is inert for them).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/motor/src/systems/SteeringSystem.ts packages/motor/src/systems/NeighborhoodSystem.test.ts packages/motor/src/ai/trees.ts packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts
git commit -m "Wire obstacles into the sheep tree, steering env, and collision pipeline"
```

---

### Task 5: Obstacle-collision integration test

**Files:**
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (add `import { createObstacle } from "../entities/Obstacle.js";` and, if not already imported, `createGrassField`/`setDensityAt` are already there):

```ts
import { createObstacle } from "../entities/Obstacle.js";

describe("obstacle collision integration", () => {
  it("a sheep driven toward an obstacle never ends up inside it", () => {
    // Strong eastward grass gradient drives the sheep east; a rock sits in its path.
    const cols = 30, rows = 18, cs = 16;
    const grass = createGrassField({ cols, rows, cellSize: cs, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < cols; cx++) {
      const d = 0.1 + 0.9 * (cx / (cols - 1));
      for (let cy = 0; cy < rows; cy++) setDensityAt(grass, cx * cs + 8, cy * cs + 8, d);
    }
    const sheep = [createSheep({ x: 120, y: 140 }, defaultSheepTraits())];
    const rock = createObstacle("rock", { x: 240, y: 140 }, 14); // directly east, in the path
    const game = new Game(createWorld(sheep, grass, [rock]));

    let minClearance = Infinity;
    for (let i = 0; i < 1800; i++) {
      game.update(1 / 60);
      const d = Math.hypot(sheep[0]!.pos.x - rock.pos.x, sheep[0]!.pos.y - rock.pos.y);
      minClearance = Math.min(minClearance, d);
      // INVARIANT every frame: never penetrate (allow a tiny epsilon for float push-out)
      expect(d).toBeGreaterThan(sheep[0]!.radius + rock.radius - 0.5);
    }
    // It actually reached the rock (otherwise the test proves nothing).
    expect(minClearance).toBeLessThan(sheep[0]!.radius + rock.radius + 6);
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run packages/motor/src/world/Game.test.ts`
Expected: PASS — flocking, grazing, and obstacle-collision tests all green.

If the per-frame penetration invariant fails, the collision push-out is wrong (it should keep `dist >= sheep.radius + rock.radius`). If `minClearance` is too large (sheep never reached the rock), raise the eastward gradient or check `obstacleAvoid` isn't deflecting it before contact (with `avoidRadius 18` the sheep should still be pushed close by the grass gradient and graze.weight). Do not weaken the penetration invariant. Report DONE_WITH_CONCERNS with observed numbers if needed.

- [ ] **Step 3: Full verification**

Run: `npm test`
Expected: PASS — every test across all packages.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/world/Game.test.ts
git commit -m "Add obstacle collision integration test"
```

---

## Self-review

**Spec coverage (§9.3 point obstacles, §10.2 circle resolution, §10.4 soft avoidance):**
- `Obstacle` circle entity (§9.3) → Task 1 ✓
- Circle-circle push-out + slide (§10.2) → Task 2 ✓
- `obstacleAvoid` soft look-ahead (§10.4) → Task 3 ✓
- Pipeline gains CollisionSystem after movement (§5.2 step 10) → Task 4 ✓
- Hard guarantee validated end-to-end (never penetrate) → Task 5 ✓
- **Deliberately deferred** (correct): fence-segment collision, closest-feature push-out, swept CCD, one-way gate (Plan 5 — need the pen polygon's inside/outside truth); Selector/Conditional/Sequence/Dynamic nodes; StaticIndex broad-phase (a handful of obstacles is iterated directly — broad-phase lands with the pen's many segments).

**Deviation from spec (documented):** §10 describes swept CCD for tunneling. For *circle* obstacles it is unnecessary — per-frame displacement (`maxSpeed·dtClampMax ≈ 1.3px`) is far below obstacle radii (≥8px) and circle-circle push-out has no side ambiguity, so static resolution is provably tunnel-free here. Swept CCD + side-truth genuinely matter for *thin fence lines*, which are Plan 5.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `SteerContext` gains `obstacles` (Task 3) and every ctx constructor is updated in the same plan (behaviors.test, Behavior.test, SteeringSystem). `steeringSystem(sheep, grass, dt)` → `steeringSystem(sheep, env, dt)` with `SteerEnv = { grass, obstacles }`, propagated to both call sites (Game, NeighborhoodSystem.test). `World` gains `obstacles` with a default `[]`, so existing `createWorld(sheep[, grass])` callers (Plan 2/3 integration tests) keep working and the new collision/avoid stays inert for them. Obstacles are iterated directly (no StaticIndex yet).

---

## Next plans

- **Plan 5 — Motor: pen + fence collision:** random simple-polygon `penGen`; one-geometry→two-models; fence segments + closest-feature push-out + swept CCD; the one-way gate (inward-normal from winding); capture via point-in-polygon; penned interior-seeking behavior; `Selector`/`Conditional`/`Sequence`/`Dynamic` nodes; `StaticIndex` broad-phase for the segments.
- **Plan 6 — Motor: dog, fun layer, respawn.**
- **Plan 7 — `@getback/game` + apps/examples.**
