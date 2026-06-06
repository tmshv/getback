# Motor: Herding Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing herding loop *feel* finished: penned sheep settle and mill calmly inside instead of pressing the gate (introducing the deferred Selector/Conditional behavior-tree nodes), and the dog is physically blocked by the pen (fences AND gate) so it works the flock from outside and never disturbs penned sheep.

**Architecture:** Two independent polish slices on `@getback/motor`.
1. **Penned calm:** new `selector`/`conditional` behavior-tree combinators + a `penInterior` settle behavior + an `isPenned` predicate. The sheep root becomes `selector([ conditional(isPenned, pennedBlend), flockingBlend ])`. `SteerContext` grows two OPTIONAL fields (`penned`, `penCentroid`), populated per-sheep by `SteeringSystem` from the world's pen — optional so the 14 existing ctx literals don't ripple.
2. **Dog blocked by pen:** a `dogPenCollisionSystem` that reuses the existing `resolveFence` over the pen's **solid fences only** (NOT the gate mouth), wired into `Game.update`. Per spec §10.5 the dog is **exempt from the one-way gate** — it collides with solid fences but may pass freely through the gate opening (to push stragglers in and leave).

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–11 (merged to `master`). Uses `@getback/math` (`Vec2`, `arrive`), existing `Pen.centroid`, and `integrate`'s `prevPos` snapshot (already set for the dog).

**Plan 12** of the roadmap. **Out of scope (later slices):** attractors/thirst, treats/buffs (Emitter/Pool/BuffSystem), ambient scares, richer GameSignals, the render layer. Penned sheep deliberately ignore grass AND stress while penned (they are safe inside) — keeping "calm" simple.

---

## Key facts the engineer must know

- **`.js` import extensions** on `.ts` sources are correct (Bundler resolution). Ignore stale "cannot find module" LSP diagnostics.
- The **gate one-way physics** (a unit may enter but not leave) is already covered by unit tests in `FenceCollisionSystem.test.ts` (tests "lets a unit ENTER through the gate" / "BLOCKS a unit trying to leave through the gate"). This plan repurposes the *integration* test that previously asserted a penned sheep presses the gate — that AI pressure no longer exists once penned sheep settle, but the raw physics guarantee stays at the unit level.
- **Respawn interaction (Plan 11):** `respawnSystem` fires when `pen.contained.size === sheep.length` (whole flock penned). Any integration test that wants a *stable* penned flock must include at least one sheep OUTSIDE the pen so the pen never "fills" and triggers a respawn. The penned-settle tests below all add a far-outside sheep at `(5, 5)` for this reason.
- `SteeringSystem` runs BEFORE `penSystem` in `Game.update`, so a freshly-placed inside sheep runs the flocking branch on frame 1 (penned flips true at end of frame 1, the settle branch takes over from frame 2). This one-frame lead is negligible.
- Behaviors always write into `out` (overwrite) and return `"fired"` / `"skipped"`. `blend(...)` always returns `"fired"`.

## File structure (created/modified)

```
packages/motor/src/steering/combinators.ts            # NEW: selector, conditional
packages/motor/src/steering/combinators.test.ts       # NEW
packages/motor/src/steering/types.ts                  # MODIFIED: SteerContext gains optional penned + penCentroid
packages/motor/src/systems/SteeringSystem.ts          # MODIFIED: SteerEnv gains optional pen; populate penned/penCentroid
packages/motor/src/ai/behaviors.ts                    # MODIFIED: add penInterior + isPenned
packages/motor/src/ai/behaviors.test.ts               # MODIFIED: penInterior + isPenned tests
packages/motor/src/config.ts                          # MODIFIED: pen.settleRadius + pen.settleWeight
packages/motor/src/ai/trees.ts                        # MODIFIED: selector/conditional root with penned branch
packages/motor/src/systems/FenceCollisionSystem.ts    # MODIFIED: export dogPenCollisionSystem
packages/motor/src/systems/FenceCollisionSystem.test.ts # MODIFIED: dogPenCollisionSystem unit test
packages/motor/src/world/Game.ts                      # MODIFIED: wire dogPenCollisionSystem
packages/motor/src/world/Game.test.ts                 # MODIFIED: repurpose gate test -> penned settle; add dog-vs-pen tests
packages/motor/src/index.ts                           # MODIFIED: barrel exports
```

---

### Task 1: Selector / Conditional combinators

**Files:**
- Create: `packages/motor/src/steering/combinators.ts`
- Create: `packages/motor/src/steering/combinators.test.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/steering/combinators.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selector, conditional } from "./combinators.js";
import type { BehaviorNode, SteerContext } from "./types.js";
import type { Mobile } from "../types.js";

const ctx = {} as SteerContext; // nodes under test do not read ctx fields
const e = {} as Mobile;

// a stub node that writes a fixed x-force and reports a fixed status
function fixed(x: number, status: "fired" | "skipped"): BehaviorNode {
  return { run(_e, _ctx, out) { out.x = x; out.y = 0; return status; } };
}

describe("conditional", () => {
  it("runs the child when the predicate holds", () => {
    const node = conditional(() => true, fixed(5, "fired"));
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("fired");
    expect(out.x).toBe(5);
  });
  it("skips with zero force when the predicate fails", () => {
    const node = conditional(() => false, fixed(5, "fired"));
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("selector", () => {
  it("returns the first child that fires and keeps its force", () => {
    const node = selector([fixed(0, "skipped"), fixed(7, "fired"), fixed(9, "fired")]);
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("fired");
    expect(out.x).toBe(7); // second child won; third never ran
  });
  it("reports skipped with zero force when every child skips", () => {
    const node = selector([fixed(1, "skipped"), fixed(2, "skipped")]);
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
```
Run `npx vitest run packages/motor/src/steering/combinators.test.ts` → FAIL (cannot resolve `./combinators.js`).

- [ ] **Step 2: Implement the combinators**

Create `packages/motor/src/steering/combinators.ts`:
```ts
import type { BehaviorNode, Predicate } from "./types.js";

// Run `child` only when `pred` holds; otherwise opt out ("skipped") with zero
// force. Lets a sub-tree be gated on a condition (e.g. only-when-penned).
export function conditional(pred: Predicate, child: BehaviorNode): BehaviorNode {
  return {
    run(e, ctx, out) {
      if (!pred(e, ctx)) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      return child.run(e, ctx, out);
    },
  };
}

// Try children in priority order; the FIRST that fires wins (its force stays in
// `out`) and later children are skipped. If every child skips, write zero and
// report "skipped".
export function selector(children: BehaviorNode[]): BehaviorNode {
  return {
    run(e, ctx, out) {
      for (const c of children) {
        if (c.run(e, ctx, out) === "fired") return "fired";
      }
      out.x = 0;
      out.y = 0;
      return "skipped";
    },
  };
}
```

- [ ] **Step 3: Run the test → PASS**

Run `npx vitest run packages/motor/src/steering/combinators.test.ts` → expect 4 passing.

- [ ] **Step 4: Export from the barrel**

READ `packages/motor/src/index.ts`, then add (near the existing steering exports, matching the file's style):
```ts
export { selector, conditional } from "./steering/combinators.js";
```

- [ ] **Step 5: Typecheck + commit**

Run `npm run typecheck` → exit 0.
```bash
git add packages/motor/src/steering/combinators.ts packages/motor/src/steering/combinators.test.ts packages/motor/src/index.ts
git commit -m "Add selector and conditional behavior-tree combinators"
```

---

### Task 2: Grow SteerContext + SteerEnv (the penned plumbing)

**Files:**
- Modify: `packages/motor/src/steering/types.ts`
- Modify: `packages/motor/src/systems/SteeringSystem.ts`

These fields are **optional** so the 14 existing `SteerContext` literals and the `SteerEnv` literal in `NeighborhoodSystem.test.ts` keep compiling unchanged. No behavior reads them yet (Task 3 adds the readers), so the full suite stays green.

- [ ] **Step 1: Add optional fields to `SteerContext`**

In `packages/motor/src/steering/types.ts`, add a `Vec2` import if not present (it already imports `Vec2`). Add two fields to the `SteerContext` interface after `fear`:
```ts
  penned?: boolean; // true while this sheep is inside the pen (settle, don't graze out)
  penCentroid?: Vec2 | null; // the pen's centre to settle toward (absent/null if no pen)
```

- [ ] **Step 2: `SteerEnv` gains an optional pen; `SteeringSystem` populates the fields**

READ `packages/motor/src/systems/SteeringSystem.ts`. Add a `Pen` type import:
```ts
import type { Pen } from "../world/Pen.js";
```
Add `pen` to the `SteerEnv` interface (optional):
```ts
export interface SteerEnv {
  grass: GrassField;
  obstacles: readonly Obstacle[];
  stress: readonly StressSource[];
  pen?: Pen | null;
}
```
And populate the two new ctx fields in the per-sheep loop. The ctx line becomes:
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
    };
```

- [ ] **Step 3: Verify (no behaviour change yet)**

Run `npm run typecheck` → exit 0.
Run `npm test` → ALL pass (optional fields, no reader yet, so behaviour is unchanged). Report the total.

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/systems/SteeringSystem.ts
git commit -m "Thread penned state and pen centroid into SteerContext"
```

---

### Task 3: `penInterior` behavior + `isPenned` predicate + config

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/ai/behaviors.ts`
- Modify: `packages/motor/src/ai/behaviors.test.ts`

- [ ] **Step 1: Add settle tuning to config**

In `packages/motor/src/config.ts`, the pen line currently reads:
```ts
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24 },
```
Replace it with (add `settleRadius` + `settleWeight`):
```ts
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24, settleRadius: 30, settleWeight: 0.6 },
```
(Leave the `respawn: { ... }` line below it unchanged. Note: the pen-capture test spreads `...config.pen` into `generatePen` opts — extra props arriving via spread are NOT excess-property-checked and are ignored by `generatePen`, so this is safe.)

- [ ] **Step 2: Write the failing tests**

In `packages/motor/src/ai/behaviors.test.ts`, update the import on line 2 to add the two new symbols:
```ts
import { separation, cohesion, follow, graze, obstacleAvoid, fleeStress, penInterior, isPenned } from "./behaviors.js";
```
Append these two describe blocks at the END of the file:
```ts
describe("penInterior", () => {
  it("steers toward the pen centroid when one is provided", () => {
    const self = agent({ pos: { x: 0, y: 0 } });
    const out = { x: 0, y: 0 };
    const status = penInterior(20).run(
      self,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0, penCentroid: { x: 100, y: 0 } },
      out,
    );
    expect(status).toBe("fired");
    expect(out.x).toBeGreaterThan(0); // pulled toward the +x centroid
  });
  it("skips with zero force when there is no pen centroid", () => {
    const self = agent();
    const out = { x: 1, y: 1 };
    const status = penInterior(20).run(
      self,
      { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 },
      out,
    );
    expect(status).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("isPenned", () => {
  it("is true only when ctx.penned is set true", () => {
    const self = agent();
    const base = { neighbors: [], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 };
    expect(isPenned(self, { ...base, penned: true })).toBe(true);
    expect(isPenned(self, { ...base })).toBe(false);
    expect(isPenned(self, { ...base, penned: false })).toBe(false);
  });
});
```
Run `npx vitest run packages/motor/src/ai/behaviors.test.ts` → FAIL (`penInterior`/`isPenned` not exported).

- [ ] **Step 3: Implement `penInterior` + `isPenned`**

In `packages/motor/src/ai/behaviors.ts`:
- Update the primitives import (line 3) to add `arrive`:
```ts
import { seek, arrive } from "../steering/primitives.js";
```
- Add a `Predicate` type import to the existing types import (line 2 currently imports `BehaviorNode`):
```ts
import type { BehaviorNode, Predicate } from "../steering/types.js";
```
- Append at the END of the file:
```ts
// Calmly converge on the pen centre once penned: arrive (speed ramps to 0 near
// the centroid) so penned sheep mill near the middle instead of pressing the
// gate. Skips (zero force) when there is no pen centroid to seek.
export function penInterior(slowRadius: number): BehaviorNode {
  return {
    run(e, ctx, out) {
      const c = ctx.penCentroid;
      if (!c) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      arrive(e, c, slowRadius, out);
      return "fired";
    },
  };
}

// True while the steering sheep is inside the pen.
export const isPenned: Predicate = (_e, ctx) => ctx.penned === true;
```

- [ ] **Step 4: Run the tests → PASS**

Run `npx vitest run packages/motor/src/ai/behaviors.test.ts` → all pass (existing + 3 new).
Run `npm run typecheck` → exit 0.

- [ ] **Step 5: Export from the barrel + commit**

In `packages/motor/src/index.ts`, add to the existing `ai/behaviors` export the two new symbols (`penInterior`, `isPenned`). (Match the existing export line for behaviors; if behaviors aren't re-exported individually, add `export { penInterior, isPenned } from "./ai/behaviors.js";`.)
```bash
git add packages/motor/src/config.ts packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts packages/motor/src/index.ts
git commit -m "Add penInterior settle behavior and isPenned predicate"
```

---

### Task 4: Rewire the sheep tree + repurpose the gate integration test

**Files:**
- Modify: `packages/motor/src/ai/trees.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Rebuild `buildSheepTree` with a penned branch**

Replace the body of `packages/motor/src/ai/trees.ts` with:
```ts
import type { BehaviorNode } from "../steering/types.js";
import type { SheepTraits } from "../entities/Sheep.js";
import { blend } from "../steering/Behavior.js";
import { selector, conditional } from "../steering/combinators.js";
import { separation, cohesion, follow, graze, obstacleAvoid, fleeStress, penInterior, isPenned } from "./behaviors.js";
import { config } from "../config.js";

// The sheep's root: a Selector. When penned, the gated `pennedBlend` fires (calm
// settle toward the pen centre, keeping personal space) and the flocking blend is
// skipped. Otherwise the Conditional skips and the full flocking blend runs. Built
// per-sheep so traits bake in.
export function buildSheepTree(traits: SheepTraits): BehaviorNode {
  const w = config.flock.weights;
  const flocking = blend([
    { node: fleeStress(), weight: config.flee.weight },
    { node: obstacleAvoid(config.obstacleAvoid.avoidRadius), weight: config.obstacleAvoid.weight },
    { node: graze(), weight: config.graze.weight },
    { node: separation(traits.personalSpace), weight: w.separation },
    { node: cohesion(config.flock.cohesionK), weight: w.cohesion * traits.sociability },
    { node: follow(config.flock.moveThreshold), weight: w.follow * traits.sociability },
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

- [ ] **Step 2: Run the existing suite to find what shifted**

Run `npm test`. Expect ONE failure: the `one-way gate containment integration` test in `Game.test.ts` (it asserted the penned sheep presses the gate via grazing — `minX < 115` — which the new settle behavior prevents). Everything else stays green. Confirm only that test fails before editing it.

- [ ] **Step 3: Repurpose that integration test**

In `packages/motor/src/world/Game.test.ts`, find the whole `describe("one-way gate containment integration", ...)` block (the one with the `square` 100..200, lush-west grass, the two-sheep setup, and the `1800`-frame loop asserting `minX < 115`). REPLACE the entire describe block with:
```ts
describe("penned settling integration", () => {
  it("a penned sheep settles inside and ignores grass outside the gate", () => {
    // Axis-aligned square pen 100..200; gate = edge index 3 (left edge), inward = +x.
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    // Grass is lush to the WEST (outside the gate): a non-penned sheep WOULD graze
    // straight at the gate. A penned sheep must ignore it and stay put.
    const grass = createGrassField({ cols: 30, rows: 18, cellSize: 16, regrowRate: 0, depleteRate: 0, initial: 0 });
    for (let cx = 0; cx < 30; cx++) {
      const d = 1 - 0.9 * (cx / 29); // 1.0 (west) -> 0.1 (east): gradient points WEST
      for (let cy = 0; cy < 18; cy++) setDensityAt(grass, cx * 16 + 8, cy * 16 + 8, d);
    }
    const sheep = [
      createSheep({ x: 150, y: 150 }, defaultSheepTraits()), // inside, the one we track
      createSheep({ x: 5, y: 5 }, defaultSheepTraits()), // far outside -> pen never full -> no respawn
    ];
    const game = new Game(createWorld(sheep, grass, [], pen));

    let minX = Infinity;
    for (let i = 0; i < 1800; i++) {
      game.update(1 / 60);
      minX = Math.min(minX, sheep[0]!.pos.x);
      expect(penContains(pen, sheep[0]!.pos)).toBe(true); // INVARIANT: stays contained
      expect(sheep[0]!.penned).toBe(true);
    }
    expect(minX).toBeGreaterThan(130); // settled near centre — did NOT press the gate (calm)
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });

  it("a penned flock settles without collapsing onto itself", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    const sheep = [
      createSheep({ x: 140, y: 140 }, defaultSheepTraits()),
      createSheep({ x: 160, y: 140 }, defaultSheepTraits()),
      createSheep({ x: 150, y: 165 }, defaultSheepTraits()),
      createSheep({ x: 5, y: 5 }, defaultSheepTraits()), // outside -> pen never full -> no respawn
    ];
    const inside = [sheep[0]!, sheep[1]!, sheep[2]!];
    const game = new Game(createWorld(sheep, undefined, [], pen));

    for (let i = 0; i < 600; i++) game.update(1 / 60);

    for (const s of inside) {
      expect(penContains(pen, s.pos)).toBe(true);
      expect(s.penned).toBe(true);
    }
    expect(minPairwise(inside)).toBeGreaterThan(4); // separation kept them apart (no collapse)
  });
});
```
(The file already imports `createGrassField`, `setDensityAt`, `buildPen`, `penContains`, `createSheep`, `defaultSheepTraits`, `createWorld`, `Game`, and defines the `minPairwise` helper — verify and do not duplicate imports.)

- [ ] **Step 4: Run the full suite → PASS**

Run `npm test` → ALL pass (the repurposed + new penned tests green, everything else unchanged).
Run `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/ai/trees.ts packages/motor/src/world/Game.test.ts
git commit -m "Penned sheep settle calmly via selector/conditional tree branch"
```

---

### Task 5: Dog blocked by the pen (fences + gate)

**Files:**
- Modify: `packages/motor/src/systems/FenceCollisionSystem.ts`
- Modify: `packages/motor/src/systems/FenceCollisionSystem.test.ts`
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/world/Game.test.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Write the failing unit test**

In `packages/motor/src/systems/FenceCollisionSystem.test.ts`, update the import on line 2:
```ts
import { fenceCollisionSystem, dogPenCollisionSystem } from "./FenceCollisionSystem.js";
```
Append this describe block at the END of the file:
```ts
describe("dogPenCollisionSystem", () => {
  it("lets the dog pass FREELY through the gate (exempt from the one-way gate)", () => {
    const pen = buildPen(square, 3); // gate = left edge (x=0)
    // an inward crossing of the gate: the sheep one-way logic would allow this,
    // and for the dog there is no gate test at all, so it passes straight through.
    const dog = unit({ prevPos: { x: -3, y: 20 }, pos: { x: 5, y: 20 }, vel: { x: 8, y: 0 } });
    dogPenCollisionSystem(pen, dog);
    expect(dog.pos.x).toBeCloseTo(5); // unmoved — the gate is an opening for the dog
    expect(penContains(pen, dog.pos)).toBe(true); // it entered

    // ...and OUTWARD through the gate is also free for the dog (unlike sheep).
    const out = unit({ prevPos: { x: 3, y: 20 }, pos: { x: -5, y: 20 }, vel: { x: -8, y: 0 } });
    dogPenCollisionSystem(pen, out);
    expect(out.pos.x).toBeCloseTo(-5); // it left freely
  });

  it("blocks a dog crossing a solid fence, like a sheep", () => {
    const pen = buildPen(square, 3);
    const dog = unit({ prevPos: { x: 20, y: 5 }, pos: { x: 20, y: -3 }, vel: { x: 0, y: -8 } });
    dogPenCollisionSystem(pen, dog);
    expect(dog.pos.y).toBeGreaterThan(0);
    expect(Math.abs(dog.pos.y)).toBeCloseTo(dog.radius);
  });
});
```
Run `npx vitest run packages/motor/src/systems/FenceCollisionSystem.test.ts` → FAIL (`dogPenCollisionSystem` not exported).

- [ ] **Step 2: Implement `dogPenCollisionSystem`**

In `packages/motor/src/systems/FenceCollisionSystem.ts`, append a new exported function at the END (it reuses the file-local `resolveFence`, which is a two-way solid push-out + motion-crossing CCD):
```ts
// The dog collides with the pen's SOLID FENCES but is EXEMPT from the one-way
// gate (spec §10.5): the gate mouth is not tested, so the dog passes through the
// opening freely — in to push stragglers, out again — while solid walls still
// stop it. Runs after the dog integrates (prevPos is its pre-move position).
export function dogPenCollisionSystem(pen: Pen, dog: Mobile): void {
  for (const seg of pen.fences) resolveFence(dog, seg);
}
```

- [ ] **Step 3: Run the unit test → PASS**

Run `npx vitest run packages/motor/src/systems/FenceCollisionSystem.test.ts` → all pass (existing + 2 new).

- [ ] **Step 4: Wire into `Game.update`**

In `packages/motor/src/world/Game.ts`:
- Update the FenceCollisionSystem import to add the new function:
```ts
import { fenceCollisionSystem, dogPenCollisionSystem } from "../systems/FenceCollisionSystem.js";
```
- In the pen block, add the dog collision between the sheep fence pass and `penSystem`:
```ts
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      if (dog) dogPenCollisionSystem(pen, dog);
      penSystem(pen, sheep);
    }
```

- [ ] **Step 5: Add dog-vs-pen integration tests**

Append to `packages/motor/src/world/Game.test.ts`:
```ts
describe("dog vs pen integration", () => {
  const square = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ];

  it("the dog can pass through the gate (exempt from the one-way gate)", () => {
    const pen = buildPen(square, 3); // gate = left edge (x=100)
    const dog = createDog({ x: 50, y: 150 }); // west, straight in front of the gate
    const game = new Game(createWorld([], undefined, [], pen, dog));
    const intent = { moveDir: { x: 1, y: 0 }, sprint: true, bark: false }; // drive at the gate
    for (let i = 0; i < 120; i++) game.update(1 / 60, intent);
    expect(penContains(pen, dog.pos)).toBe(true); // it walked in through the gate
    expect(dog.pos.x).toBeGreaterThan(100);
  });

  it("the dog cannot push through a solid pen fence", () => {
    const pen = buildPen(square, 3);
    const dog = createDog({ x: 150, y: 50 }); // north of the top fence (y=100)
    const game = new Game(createWorld([], undefined, [], pen, dog));
    const intent = { moveDir: { x: 0, y: 1 }, sprint: true, bark: false };
    for (let i = 0; i < 300; i++) {
      game.update(1 / 60, intent);
      expect(penContains(pen, dog.pos)).toBe(false);
    }
    expect(dog.pos.y).toBeLessThan(100); // stopped at the fence
  });
});
```
(`createDog` is already imported in `Game.test.ts`. Verify; do not duplicate.)

- [ ] **Step 6: Barrel export + full verification**

In `packages/motor/src/index.ts`, add `dogPenCollisionSystem` to the existing FenceCollisionSystem export (or `export { dogPenCollisionSystem } from "./systems/FenceCollisionSystem.js";`).
Run `npm test` → ALL pass. Report the total.
Run `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/systems/FenceCollisionSystem.ts packages/motor/src/systems/FenceCollisionSystem.test.ts packages/motor/src/world/Game.ts packages/motor/src/world/Game.test.ts packages/motor/src/index.ts
git commit -m "Block the dog at the pen fences and gate"
```

---

## Self-review

**Spec coverage (penned interior-seek + Selector/Conditional; dog-vs-fence/gate):**
- Selector/Conditional combinators (deferred from earlier) → Task 1 ✓
- penned state + pen centroid in the steering context → Task 2 ✓
- `penInterior` settle behavior + `isPenned` predicate + tuning → Task 3 ✓
- sheep root rewired so penned sheep settle calmly (no gate-pressing) → Task 4 ✓
- dog physically blocked by solid fences, exempt from the one-way gate (passes through the opening) per §10.5 → Task 5 ✓
- **Deferred (unchanged):** attractors/thirst, treats/buffs, ambient scares, render.

**Placeholder scan:** none — every code step shows full code and a command with expected output.

**Type consistency:**
- `SteerContext.penned?: boolean`, `SteerContext.penCentroid?: Vec2 | null` (OPTIONAL — no ripple to the 14 existing ctx literals). `SteerEnv.pen?: Pen | null` (OPTIONAL — `NeighborhoodSystem.test.ts`'s env literal still compiles).
- `selector(children: BehaviorNode[])`, `conditional(pred: Predicate, child: BehaviorNode)` return `BehaviorNode`; `Predicate = (e, ctx) => boolean`.
- `penInterior(slowRadius: number): BehaviorNode` uses `arrive` (imported into behaviors.ts). `isPenned: Predicate`.
- `config.pen.settleRadius`/`config.pen.settleWeight` consumed only in `trees.ts`.
- `dogPenCollisionSystem(pen: Pen, dog: Mobile): void` reuses the existing file-local `resolveFence`; wired in `Game.update` inside the `if (pen)` block, guarded by `if (dog)`, AFTER the dog integrates (so `dog.prevPos` is the pre-move position) and after dog-obstacle collision.

**Behavioural reasoning checked:**
- Penned branch is `[separation, penInterior]` — it ignores graze AND stress, so penned sheep stop pressing the gate (Task 4 repurposed test asserts `minX > 130`, the inverse of the old `< 115`) while separation prevents collapse (the no-collapse test asserts `minPairwise > 4`).
- The gate one-way *physics* guarantee (for sheep) remains covered by the unchanged `FenceCollisionSystem.test.ts` enter/leave unit tests; the dog's fences-only / gate-exempt behaviour gets its own unit tests (passes through the gate both ways, blocked by fences).
- Respawn interaction handled: every stable-penned integration test includes a far-outside sheep at `(5, 5)` so the pen never fills and triggers a respawn.

---

## Next plans

- **Plan 13 — Motor flavor (optional):** attractors (water/shade) + thirst/rest; treats + Emitter + Pool + BuffSystem; ambient global scares; richer GameSignals.
- **Plan 14 — `@getback/game` + apps/examples:** atlas slicer from `asset0.png`, Pixi render, HUD, input, Runner/mount, `apps/getback`, `examples/*` — the playable browser game.
```
