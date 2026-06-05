# Motor: Fence Collision & One-Way Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pen physically contain the flock: sheep can't cross a solid fence segment (closest-feature push-out + motion-crossing detection so fast units can't tunnel), and the gate is **one-way** — sheep enter freely but cannot leave. Verified headless: a sheep pressed against the gate from inside stays in.

**Architecture:** Extends `@getback/motor`. A `segmentsIntersect` helper goes in `@getback/math`. A `FenceCollisionSystem` runs after movement: for each fence segment it (a) detects whether the unit's motion `prevPos→pos` *crossed* the segment and clamps it back to the origin side at radius distance (anti-tunnel, side-correct), and (b) otherwise does a static closest-feature push-out (resting contact + rounded corners). The **gate** (the one edge with no fence) is resolved only when the unit's motion crosses it *outward* (`move · inwardNormal < 0`) — inward crossings pass freely. `Mobile` gains a `prevPos` snapshot set by `MovementSystem`. No steering/`SteerContext` changes — this is pure positional physics.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–5 (merged to `master`).

**Plan 6** (3 grass · 4 obstacles · 5 pen-capture · **6 fence collision** · 7 dog/fun/respawn · 8 game+apps). Depends on Plan 5. **Out of scope (later):** penned interior-seeking *behavior* + `Selector`/`Conditional` nodes (cosmetic — physical containment here already keeps sheep in); `StaticIndex` broad-phase (a pen has ~5–9 segments; iterated directly); the dog.

---

## File structure (created/modified)

```
packages/math/src/geometry.ts          # MODIFIED: add segmentsIntersect
packages/math/src/geometry.test.ts     # MODIFIED: add segmentsIntersect tests
packages/math/src/index.ts             # MODIFIED: export segmentsIntersect
packages/motor/src/types.ts            # MODIFIED: Mobile gains `prevPos?: Vec2`
packages/motor/src/systems/MovementSystem.ts      # MODIFIED: snapshot prevPos before integrating
packages/motor/src/systems/MovementSystem.test.ts # MODIFIED: assert prevPos snapshot
packages/motor/src/entities/Sheep.ts   # MODIFIED: createSheep inits prevPos
packages/motor/src/systems/FenceCollisionSystem.ts      # NEW: fence + one-way gate
packages/motor/src/systems/FenceCollisionSystem.test.ts # NEW
packages/motor/src/world/Game.ts       # MODIFIED: run FenceCollisionSystem when pen present
packages/motor/src/world/Game.test.ts  # MODIFIED: one-way-gate containment integration test
packages/motor/src/index.ts            # MODIFIED: export fenceCollisionSystem
```

**Shared facts:** `.js` import extensions. `Vec2`, `closestPointOnSegment`, `segmentsIntersect` from `@getback/math`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `segmentsIntersect` in `@getback/math`

**Files:**
- Modify: `packages/math/src/geometry.ts`
- Modify: `packages/math/src/geometry.test.ts`
- Modify: `packages/math/src/index.ts`

- [ ] **Step 1: Add the failing test**

Append to `packages/math/src/geometry.test.ts` (add `segmentsIntersect` to the import from `./geometry.js`):
```ts
import { segmentsIntersect } from "./geometry.js";

describe("segmentsIntersect", () => {
  it("detects a proper crossing", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 })).toBe(true);
  });
  it("returns false for non-crossing segments", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 5 }, { x: 1, y: 5 })).toBe(false);
  });
  it("returns false for parallel segments", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
  });
  it("detects a T-junction (endpoint touching the other segment)", () => {
    expect(segmentsIntersect({ x: 2, y: -2 }, { x: 2, y: 2 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/math/src/geometry.test.ts`
Expected: FAIL — `segmentsIntersect` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `packages/math/src/geometry.ts`:
```ts
// Do segments p1p2 and p3p4 intersect? Standard parametric test. Parallel/
// collinear segments return false (we don't need collinear-overlap handling).
export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
```

- [ ] **Step 4: Export it**

In `packages/math/src/index.ts`, add `segmentsIntersect` to the existing `./geometry.js` export line (alongside `closestPointOnSegment`, `signedArea`, `isCCW`, `pointInPolygon`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/math/src/geometry.test.ts`
Expected: PASS — all geometry tests including the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add packages/math/src/geometry.ts packages/math/src/geometry.test.ts packages/math/src/index.ts
git commit -m "Add segmentsIntersect to @getback/math"
```

---

### Task 2: `Mobile.prevPos` snapshot

**Files:**
- Modify: `packages/motor/src/types.ts`
- Modify: `packages/motor/src/systems/MovementSystem.ts`
- Modify: `packages/motor/src/systems/MovementSystem.test.ts`
- Modify: `packages/motor/src/entities/Sheep.ts`

- [ ] **Step 1: Add `prevPos` to `Mobile`**

In `packages/motor/src/types.ts`, add an optional field to `Mobile` (after `facing`):
```ts
  prevPos?: Vec2; // position at the START of the current frame; set by MovementSystem, read by FenceCollisionSystem
```

- [ ] **Step 2: Add the failing test**

Append to `packages/motor/src/systems/MovementSystem.test.ts`:
```ts
describe("prevPos snapshot", () => {
  it("records the position from before the move", () => {
    const e = agent({ pos: { x: 10, y: 20 }, force: { x: 100, y: 0 } });
    integrate(e, 0.1);
    expect(e.prevPos).toEqual({ x: 10, y: 20 }); // where it was before this step
    expect(e.pos.x).toBeGreaterThan(10); // and it actually moved
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/MovementSystem.test.ts`
Expected: FAIL — `e.prevPos` is `undefined` (not yet snapshotted).

- [ ] **Step 4: Snapshot `prevPos` in `integrate`**

In `packages/motor/src/systems/MovementSystem.ts`, at the **very start** of `integrate` (before the force truncation), snapshot the current position into `prevPos` (allocation-light: reuse the object if present):
```ts
export function integrate(e: Mobile, dt: number): void {
  if (e.prevPos) {
    e.prevPos.x = e.pos.x;
    e.prevPos.y = e.pos.y;
  } else {
    e.prevPos = { x: e.pos.x, y: e.pos.y };
  }
  // ... existing body (force truncate, integrate, clamp, etc.) unchanged ...
```

- [ ] **Step 5: Init `prevPos` in `createSheep`**

In `packages/motor/src/entities/Sheep.ts`, add `prevPos: { x: pos.x, y: pos.y },` to the object returned by `createSheep` (next to `pos`). Read the file first.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/MovementSystem.test.ts`
Expected: PASS — all MovementSystem tests including the new `prevPos` one.

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/types.ts packages/motor/src/systems/MovementSystem.ts packages/motor/src/systems/MovementSystem.test.ts packages/motor/src/entities/Sheep.ts
git commit -m "Add Mobile.prevPos snapshot in MovementSystem"
```

---

### Task 3: `FenceCollisionSystem` — fence push-out, crossing CCD, one-way gate

**Files:**
- Create: `packages/motor/src/systems/FenceCollisionSystem.ts`
- Create: `packages/motor/src/systems/FenceCollisionSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/systems/FenceCollisionSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fenceCollisionSystem } from "./FenceCollisionSystem.js";
import { buildPen, penContains } from "../world/Pen.js";
import type { Mobile } from "../types.js";

// CCW square 0..40; gate = edge index 3 = (0,40)->(0,0) = the LEFT edge.
// Its inward normal points +x (into the square).
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

function unit(over: Partial<Mobile> = {}): Mobile {
  return {
    pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 3, maxSpeed: 10, maxForce: 100, facing: "down", ...over,
  };
}

describe("fenceCollisionSystem", () => {
  it("blocks a unit that crossed a solid fence, clamping it back to the origin side", () => {
    const pen = buildPen(square, 3); // gate is the left edge
    // moving DOWN across the bottom fence (0,0)->(40,0): prev above (inside, y>0), pos below (y<0).
    const u = unit({ prevPos: { x: 20, y: 5 }, pos: { x: 20, y: -3 }, vel: { x: 0, y: -8 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.y).toBeGreaterThan(0); // pushed back to the inside (origin) side of the fence
    expect(Math.abs(u.pos.y)).toBeCloseTo(u.radius); // at radius distance from the fence line
    expect(u.vel.y).toBeGreaterThanOrEqual(0); // inward (downward) velocity component removed
  });

  it("does a static push-out when resting against a fence (no crossing)", () => {
    const pen = buildPen(square, 3);
    // sitting just below the bottom fence line, within radius, no motion.
    const u = unit({ prevPos: { x: 20, y: 1 }, pos: { x: 20, y: 1 }, vel: { x: 0, y: 0 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.y).toBeCloseTo(3); // pushed to radius distance above the line
  });

  it("lets a unit ENTER through the gate (inward crossing allowed)", () => {
    const pen = buildPen(square, 3); // gate = left edge, inward = +x
    // crossing the left edge moving RIGHT (inward): prev outside (x<0), pos inside (x>0).
    const u = unit({ prevPos: { x: -3, y: 20 }, pos: { x: 5, y: 20 }, vel: { x: 8, y: 0 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.x).toBeCloseTo(5); // unchanged — passed through the open gate
    expect(u.vel.x).toBeCloseTo(8);
  });

  it("BLOCKS a unit trying to leave through the gate (outward crossing)", () => {
    const pen = buildPen(square, 3); // gate = left edge, inward = +x
    // crossing the left edge moving LEFT (outward): prev inside (x>0), pos outside (x<0).
    const u = unit({ prevPos: { x: 3, y: 20 }, pos: { x: -5, y: 20 }, vel: { x: -8, y: 0 } });
    fenceCollisionSystem(pen, [u]);
    expect(u.pos.x).toBeGreaterThan(0); // clamped back inside
    expect(u.pos.x).toBeCloseTo(u.radius); // radius inside the gate line (x=0)
    expect(u.vel.x).toBeGreaterThanOrEqual(0); // outward (leftward) velocity removed
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/FenceCollisionSystem.test.ts`
Expected: FAIL — cannot resolve `./FenceCollisionSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/systems/FenceCollisionSystem.ts`:
```ts
import type { Vec2 } from "@getback/math";
import { closestPointOnSegment, segmentsIntersect } from "@getback/math";
import type { Mobile } from "../types.js";
import type { Pen, Segment } from "../world/Pen.js";

// Place the unit at `radius` distance from the segment, on the side `toward` points
// to, at the closest point to the unit's (post-move) position; then remove the
// velocity component pointing across (so it slides). `nx,ny` is the unit normal
// already oriented toward the keep-side.
function clampToSide(u: Mobile, seg: Segment, nx: number, ny: number): void {
  const cp = closestPointOnSegment(u.pos, seg.a, seg.b);
  u.pos.x = cp.point.x + nx * u.radius;
  u.pos.y = cp.point.y + ny * u.radius;
  const vn = u.vel.x * nx + u.vel.y * ny;
  if (vn < 0) {
    u.vel.x -= vn * nx;
    u.vel.y -= vn * ny;
  }
}

function resolveFence(u: Mobile, seg: Segment): void {
  const prev = u.prevPos ?? u.pos;
  // unit normal of the segment
  let nx = -(seg.b.y - seg.a.y);
  let ny = seg.b.x - seg.a.x;
  const len = Math.hypot(nx, ny);
  if (len === 0) return;
  nx /= len;
  ny /= len;
  // orient the normal toward prev's side (the side the unit must stay on)
  if ((prev.x - seg.a.x) * nx + (prev.y - seg.a.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  // (1) crossing this frame -> clamp back to prev's side (anti-tunnel, side-correct)
  if (segmentsIntersect(prev, u.pos, seg.a, seg.b)) {
    clampToSide(u, seg, nx, ny);
    return;
  }
  // (2) resting contact -> static closest-feature push-out (also handles corners)
  const cp = closestPointOnSegment(u.pos, seg.a, seg.b);
  const dx = u.pos.x - cp.point.x;
  const dy = u.pos.y - cp.point.y;
  const d = Math.hypot(dx, dy);
  if (d > 0 && d < u.radius) {
    const ox = dx / d;
    const oy = dy / d;
    const push = u.radius - d;
    u.pos.x += ox * push;
    u.pos.y += oy * push;
    const vn = u.vel.x * ox + u.vel.y * oy;
    if (vn < 0) {
      u.vel.x -= vn * ox;
      u.vel.y -= vn * oy;
    }
  }
}

// The gate (an edge with NO fence) is one-way: a unit may cross it INWARD freely,
// but a unit crossing OUTWARD this frame is clamped back inside.
function resolveGate(u: Mobile, mouth: Segment, inwardNormal: Vec2): void {
  const prev = u.prevPos ?? u.pos;
  if (!segmentsIntersect(prev, u.pos, mouth.a, mouth.b)) return;
  const moveDotInward = (u.pos.x - prev.x) * inwardNormal.x + (u.pos.y - prev.y) * inwardNormal.y;
  if (moveDotInward >= 0) return; // moving inward -> allowed
  clampToSide(u, mouth, inwardNormal.x, inwardNormal.y); // moving outward -> block (keep inside)
}

// Keep units on the correct side of every solid fence, and one-way at the gate.
// Runs after movement. A pen has only a handful of segments, so iterate directly.
export function fenceCollisionSystem(pen: Pen, units: Mobile[]): void {
  for (const u of units) {
    for (const seg of pen.fences) resolveFence(u, seg);
    resolveGate(u, pen.gate.mouth, pen.gate.inwardNormal);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/FenceCollisionSystem.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/FenceCollisionSystem.ts packages/motor/src/systems/FenceCollisionSystem.test.ts
git commit -m "Add motor FenceCollisionSystem with crossing CCD and one-way gate"
```

---

### Task 4: Wire fence collision into the pipeline

**Files:**
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Run `FenceCollisionSystem` in `Game.update`**

In `packages/motor/src/world/Game.ts`, add `import { fenceCollisionSystem } from "../systems/FenceCollisionSystem.js";`. In `update`, after the existing `collisionSystem(sheep, obstacles)` (obstacle) line and the `if (pen) penSystem(...)` line, change the pen block so the fence resolves **before** capture:
```ts
    movementSystem(sheep, step);
    collisionSystem(sheep, obstacles);
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep);
    }
```
(Read the file; ensure there is exactly one `if (pen) penSystem(...)` — replace it with the block above. The fence runs after obstacle collision so capture sees final positions.)

- [ ] **Step 2: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export { fenceCollisionSystem } from "./systems/FenceCollisionSystem.js";
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS — every existing test (the pen-capture integration test still passes: a sheep placed at the centroid never reaches the fence, so fence collision is a no-op for it; other integration tests use a null pen).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/world/Game.ts packages/motor/src/index.ts
git commit -m "Wire FenceCollisionSystem into the Game pipeline"
```

---

### Task 5: One-way-gate containment integration test

**Files:**
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (reuse the existing imports; add `import { buildPen, penContains } from "../world/Pen.js";` if `penContains` isn't already imported, and `createGrassField`/`setDensityAt` are already there):
```ts
describe("one-way gate containment integration", () => {
  it("a penned sheep pulled toward the gate cannot escape", () => {
    // Axis-aligned square pen 100..200; gate = edge index 3 (left edge), inward = +x.
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    // Grass is lush to the WEST (outside the gate) so `graze` pulls the sheep west,
    // straight at the gate it would otherwise exit through.
    const grass = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < 30; cx++) {
      const d = 1 - 0.9 * (cx / 29); // 1.0 (west) -> 0.1 (east): gradient points WEST
      for (let cy = 0; cy < 18; cy++) setDensityAt(grass, cx * 16 + 8, cy * 16 + 8, d);
    }
    const sheep = [createSheep({ x: 150, y: 150 }, defaultSheepTraits())]; // inside, center
    const game = new Game(createWorld(sheep, grass, [], pen));

    let minX = Infinity;
    for (let i = 0; i < 1800; i++) {
      game.update(1 / 60);
      minX = Math.min(minX, sheep[0]!.pos.x);
      // INVARIANT: never escapes the pen.
      expect(penContains(pen, sheep[0]!.pos)).toBe(true);
      expect(sheep[0]!.penned).toBe(true);
    }
    // It genuinely pressed against the gate (got near the left wall x=100), so the
    // invariant isn't vacuous.
    expect(minX).toBeLessThan(115);
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run packages/motor/src/world/Game.test.ts`
Expected: PASS — all integration tests including this one.

If `penContains` ever returns false (sheep escaped), the one-way gate or fence resolution is leaking — investigate `FenceCollisionSystem` (do NOT weaken the invariant). If `minX` never gets below 115 (sheep never approached the gate), the westward grass gradient isn't pulling it — check the gradient sign. Report DONE_WITH_CONCERNS with observed `minX` if needed.

- [ ] **Step 3: Full verification**

Run: `npm test`
Expected: PASS — every test across all packages.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/world/Game.test.ts
git commit -m "Add one-way-gate containment integration test"
```

---

## Self-review

**Spec coverage (§10.3 fence closest-feature, §10.4–10.5 CCD + one-way gate, §11.4 containment):**
- `segmentsIntersect` geometry primitive → Task 1 ✓
- `prevPos` swept-motion snapshot → Task 2 ✓
- Fence closest-feature push-out + crossing CCD + one-way gate (§10.3–10.5) → Task 3 ✓
- Wired after movement, before capture (§5.2) → Task 4 ✓
- Physical containment validated end-to-end (penned sheep can't escape the gate) → Task 5 ✓
- **Deliberately deferred:** penned interior-seeking *behavior* + `Selector`/`Conditional` nodes (physical containment already keeps sheep in — the behavior is cosmetic calm-milling, a later polish); `StaticIndex` broad-phase (a pen has ≤9 segments); the dog.

**Anti-tunnel correctness:** crossing detection via `segmentsIntersect(prevPos→pos, fence)` catches a unit that stepped across a thin segment regardless of speed and clamps it to the *origin* side (using the normal oriented toward `prevPos`), which is the side-correct behavior static push-out alone cannot guarantee for a thin line. The static branch handles resting contact and rounded corners (closest-feature → vertex radial push).

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `Mobile.prevPos` is OPTIONAL, so existing `Mobile` literals in tests don't break; `MovementSystem.integrate` lazily initializes it and `createSheep` sets it. `FenceCollisionSystem(pen, units: Mobile[])` takes `Mobile[]` (so the dog can use it later); `Game` passes `Sheep[]` (assignable). No `SteerContext` change — fence collision is positional, not steering, so there is **no ctx-literal ripple** this plan. `segmentsIntersect` added to `@getback/math` and exported.

**Backward-compat:** existing integration tests either pass a `null` pen (fence collision skipped) or place the sheep at the centroid (never reaches a fence), so all stay green. Verified by the full-suite step.

---

## Next plans

- **Plan 7 — Motor: dog, fun layer, respawn:** `intentFollow` + dog entity; water/shade attractors + thirst; fear/flee + ScareSystem/bark + stress sources; StaminaSystem; treats + Emitter + Pool + BuffSystem; pen fill + respawn; ambient scares; `GameSignals`; `Game.update(dt, intent)`; (and the penned interior-seek + Selector/Conditional nodes can land here where drive-gated selection is built).
- **Plan 8 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*`.
