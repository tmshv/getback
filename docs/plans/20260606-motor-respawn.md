# Motor: Respawn Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the endless loop: when the whole flock is penned, fire a `penFilled` signal, then replace the flock with a fresh scattered one and generate a new pen — so the game never ends. Verified headless: filling a pen emits `penFilled` once and produces a new flock + a new pen.

**Architecture:** Extends `@getback/motor`. `World` gains a seedable `rng` (`@getback/math`) and a `signals` bundle (`@getback/signal`). A `RespawnSystem` runs after capture: if a pen exists and every sheep is `penned` (`pen.contained.size === sheep.length`, flock non-empty), it emits `signals.penFilled`, generates a fresh random pen, and refills the `sheep` array with the same count of newly-scattered sheep placed outside the new pen.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–10 (merged to `master`). Uses `@getback/math` (`makeRng`, `generatePen`-deps) and `@getback/signal` (`Signal`).

**Plan 11** of the roadmap. Depends on Plan 10. **Out of scope (later slices):** ambient global scares; richer `GameSignals` (`barked`/`sheepPenned`/`ambientScare`); attractors/thirst; treats/Emitter/Pool/buffs; dog-vs-fence/gate; penned interior-seek + Selector/Conditional nodes; the render layer. (Penned sheep keep their normal behaviour; physical containment already holds them until the respawn fires.)

---

## File structure (created/modified)

```
packages/motor/src/world/signals.ts              # NEW: GameSignals + createSignals
packages/motor/src/world/World.ts                # MODIFIED: World gains `rng` + `signals`; createWorld param
packages/motor/src/world/World.test.ts           # NEW: createWorld defaults (rng + signals present)
packages/motor/src/systems/RespawnSystem.ts      # NEW: pen-fill -> new flock + new pen
packages/motor/src/systems/RespawnSystem.test.ts # NEW
packages/motor/src/world/Game.ts                 # MODIFIED: run RespawnSystem after capture
packages/motor/src/world/Game.test.ts            # MODIFIED: respawn integration test; fix one-way-gate test
packages/motor/src/index.ts                      # MODIFIED: exports
```

**Shared facts:** `.js` import extensions. `Vec2`, `Rng`, `makeRng` from `@getback/math`; `Signal` from `@getback/signal`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `GameSignals` + `World` gains `rng` and `signals`

**Files:**
- Create: `packages/motor/src/world/signals.ts`
- Modify: `packages/motor/src/world/World.ts`
- Create: `packages/motor/src/world/World.test.ts`

- [ ] **Step 1: Create the signals bundle**

Create `packages/motor/src/world/signals.ts`:
```ts
import { Signal } from "@getback/signal";

// Game-level events systems emit and the app (HUD/FX/audio) subscribes to.
// Grows as more events land (barked, sheepPenned, ...).
export interface GameSignals {
  penFilled: Signal<void>;
}

export function createSignals(): GameSignals {
  return { penFilled: new Signal<void>() };
}
```

- [ ] **Step 2: `World` gains `rng` + `signals`**

In `packages/motor/src/world/World.ts`, read it. Add imports:
```ts
import type { Rng } from "@getback/math";
import { makeRng } from "@getback/math";
import type { GameSignals } from "./signals.js";
import { createSignals } from "./signals.js";
```
Add to the `World` interface (after `grid`):
```ts
  rng: Rng;
  signals: GameSignals;
```
Add an `rng` parameter to `createWorld` (default `makeRng(1)`) and populate both fields. The full `createWorld` becomes:
```ts
export function createWorld(
  sheep: Sheep[] = [],
  grass: GrassField = defaultGrass(),
  obstacles: Obstacle[] = [],
  pen: Pen | null = null,
  dog: Dog | null = null,
  rng: Rng = makeRng(1),
): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grass,
    obstacles,
    pen,
    dog,
    stress: [],
    grid: new UniformGrid<Sheep>(config.flock.perception),
    rng,
    signals: createSignals(),
  };
}
```

- [ ] **Step 3: Write the test**

Create `packages/motor/src/world/World.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createWorld } from "./World.js";
import { makeRng } from "@getback/math";

describe("createWorld", () => {
  it("provides an rng and a signals bundle by default", () => {
    const w = createWorld();
    expect(typeof w.rng.float).toBe("function");
    expect(typeof w.signals.penFilled.add).toBe("function");
  });
  it("uses the provided rng", () => {
    const rng = makeRng(99);
    const w = createWorld([], undefined, [], null, null, rng);
    expect(w.rng).toBe(rng);
  });
  it("each world gets its own signals instance", () => {
    expect(createWorld().signals).not.toBe(createWorld().signals);
  });
});
```

- [ ] **Step 4: Run + verify**

Run: `npx vitest run packages/motor/src/world/World.test.ts`
Expected: PASS — 3 tests. (`createWorld` already existed; you only added fields, so the file compiles.)

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/signals.ts packages/motor/src/world/World.ts packages/motor/src/world/World.test.ts
git commit -m "Add GameSignals and rng to the motor World"
```

---

### Task 2: `RespawnSystem`

**Files:**
- Create: `packages/motor/src/systems/RespawnSystem.ts`
- Create: `packages/motor/src/systems/RespawnSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/systems/RespawnSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@getback/math";
import { respawnSystem } from "./RespawnSystem.js";
import { createWorld } from "../world/World.js";
import { buildPen, penContains } from "../world/Pen.js";
import { penSystem } from "./PenSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";

// CCW square 0..40, gate edge 3.
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

describe("respawnSystem", () => {
  it("does nothing when not all sheep are penned", () => {
    const pen = buildPen(square, 3);
    const inside = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    const outside = createSheep({ x: 200, y: 200 }, defaultSheepTraits());
    const world = createWorld([inside, outside], undefined, [], pen, null, makeRng(1));
    penSystem(pen, world.sheep); // capture: only `inside` penned
    respawnSystem(world);
    expect(world.sheep).toContain(inside); // unchanged
    expect(world.pen).toBe(pen);
  });

  it("emits penFilled and replaces the flock + pen when the pen is full", () => {
    const pen = buildPen(square, 3);
    const a = createSheep({ x: 18, y: 18 }, defaultSheepTraits());
    const b = createSheep({ x: 24, y: 24 }, defaultSheepTraits());
    const world = createWorld([a, b], undefined, [], pen, null, makeRng(2));
    let filled = 0;
    world.signals.penFilled.add(() => filled++);

    penSystem(pen, world.sheep); // both inside -> both penned -> pen full
    respawnSystem(world);

    expect(filled).toBe(1); // signal fired once
    expect(world.pen).not.toBe(pen); // a new pen
    expect(world.sheep.length).toBe(2); // same count, fresh flock
    expect(world.sheep).not.toContain(a); // old sheep gone
    expect(world.sheep).not.toContain(b);
    // the fresh sheep are scattered OUTSIDE the new pen (not instantly re-penned)
    for (const s of world.sheep) expect(penContains(world.pen!, s.pos)).toBe(false);
  });

  it("is a no-op with no pen or an empty flock", () => {
    const world = createWorld([], undefined, [], null, null, makeRng(1));
    expect(() => respawnSystem(world)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/RespawnSystem.test.ts`
Expected: FAIL — cannot resolve `./RespawnSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/systems/RespawnSystem.ts`:
```ts
import { generatePen } from "../world/penGen.js";
import { buildPen, penContains } from "../world/Pen.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { config } from "../config.js";
import type { World } from "../world/World.js";

// When every sheep is penned, the flock has been herded home: fire penFilled,
// then drop in a fresh scattered flock (same count) and a newly generated pen.
export function respawnSystem(world: World): void {
  const pen = world.pen;
  const flock = world.sheep;
  if (!pen || flock.length === 0) return;
  if (pen.contained.size < flock.length) return; // not all penned yet

  world.signals.penFilled.emit();

  const count = flock.length;
  const rng = world.rng;
  const b = world.bounds;

  // a new pen at a random centre that fits inside the pasture
  const m = config.pen.rMax;
  const center = { x: rng.range(b.x + m, b.x + b.w - m), y: rng.range(b.y + m, b.y + b.h - m) };
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

  // refill the flock, scattered outside the new pen
  flock.length = 0;
  const margin = 20;
  for (let i = 0; i < count; i++) {
    let x = b.x + b.w / 2;
    let y = b.y + b.h / 2;
    for (let tries = 0; tries < 20; tries++) {
      x = rng.range(b.x + margin, b.x + b.w - margin);
      y = rng.range(b.y + margin, b.y + b.h - margin);
      if (!penContains(newPen, { x, y })) break;
    }
    flock.push(createSheep({ x, y }, defaultSheepTraits()));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/RespawnSystem.test.ts`
Expected: PASS — 3 tests green. (If the "scattered outside" assertion is flaky for a given seed because the bounds are small relative to the pen, the 20-try rejection loop plus a 480×270 pasture vs ~60px pen makes a free spot almost certain; seeds 1/2 are fixed so this is deterministic.)

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/RespawnSystem.ts packages/motor/src/systems/RespawnSystem.test.ts
git commit -m "Add motor RespawnSystem: pen-fill -> fresh flock + new pen"
```

---

### Task 3: Wire `RespawnSystem` into the pipeline + fix the gate test + integration test

**Files:**
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Run `RespawnSystem` after capture**

In `packages/motor/src/world/Game.ts`, read it. Add `import { respawnSystem } from "../systems/RespawnSystem.js";`. The pen block currently is:
```ts
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep);
    }
```
Add the respawn call after capture (it reads `this.world`, so call it outside the destructured `pen` — but only meaningful when a pen exists; `respawnSystem` guards internally):
```ts
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep);
    }
    respawnSystem(this.world);
```

- [ ] **Step 2: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export type { GameSignals } from "./world/signals.js";
export { createSignals } from "./world/signals.js";
export { respawnSystem } from "./systems/RespawnSystem.js";
```

- [ ] **Step 3: Fix the one-way-gate containment test (respawn now triggers it)**

The Plan-6 test `"a penned sheep pulled toward the gate cannot escape"` places exactly **one** sheep inside the pen. With `RespawnSystem` live, that sheep is penned → pen is full → it respawns immediately, breaking the test's premise. Fix it by adding a **second sheep far outside the pen** so the pen is never full (no respawn), and keep the containment assertions on the inside sheep.

In `packages/motor/src/world/Game.test.ts`, find that test. Change the sheep setup from a single inside sheep to two:
```ts
    const sheep = [
      createSheep({ x: 150, y: 150 }, defaultSheepTraits()), // inside, the one we track
      createSheep({ x: 5, y: 5 }, defaultSheepTraits()), // far outside -> pen never full -> no respawn
    ];
```
The loop already tracks `sheep[0]` (the inside one) for `minX` / `penContains` / `penned`; those assertions stay valid because `sheep[0]` is never respawned away (the pen is never full). Leave the rest of the test unchanged.

- [ ] **Step 4: Add the respawn integration test**

Append to `packages/motor/src/world/Game.test.ts` (add `import { makeRng } from "@getback/math";`, `import { buildPen } from "../world/Pen.js";` if not already imported):
```ts
describe("respawn integration", () => {
  it("herding the whole flock into the pen spawns a fresh flock + new pen", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const pen = buildPen(square, 3);
    // place the whole (tiny) flock inside the pen so it fills on the first step
    const sheep = [
      createSheep({ x: 140, y: 140 }, defaultSheepTraits()),
      createSheep({ x: 160, y: 160 }, defaultSheepTraits()),
    ];
    const world = createWorld(sheep, undefined, [], pen, null, makeRng(3));
    let filled = 0;
    world.signals.penFilled.add(() => filled++);
    const game = new Game(world);

    game.update(1 / 60);

    expect(filled).toBe(1); // the flock was herded home
    expect(world.pen).not.toBe(pen); // a brand-new pen
    expect(world.sheep.length).toBe(2); // a fresh flock of the same size
    expect(world.sheep[0]).not.toBe(sheep[0]); // genuinely new sheep
  });
});
```

- [ ] **Step 5: Full verification**

Run: `npm test`
Expected: PASS — every test, including the fixed one-way-gate test and the new respawn tests. (Other integration tests either have no pen, or a pen that never fully fills — the pen-capture test has one sheep outside — so respawn stays dormant for them.)

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Wire RespawnSystem into the pipeline and add respawn integration test"
```

---

## Self-review

**Spec coverage (§11.5 fill & respawn, §2.3 GameSignals):**
- `GameSignals` (`penFilled`) + `World.rng`/`signals` (§2.3) → Task 1 ✓
- `RespawnSystem`: detect full → emit → new flock + new pen (§11.5) → Task 2 ✓
- Wired after capture + validated end-to-end → Task 3 ✓
- **Deliberately deferred:** ambient scares, the rest of `GameSignals`, attractors/thirst, treats/Emitter/Pool/buffs, dog-vs-fence/gate, penned interior-seek + Selector/Conditional nodes, render.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `World` gains `rng: Rng` + `signals: GameSignals`; `createWorld` defaults them (so all existing `createWorld(...)` callers compile unchanged, with `makeRng(1)` + a fresh `createSignals()`). `respawnSystem(world)` mutates `world.sheep` (in place, `length = 0` + push) and reassigns `world.pen`. Uses existing `generatePen`/`buildPen`/`penContains`/`createSheep`/`defaultSheepTraits`/`config.pen`. The `Signal` comes from `@getback/signal` (already a motor dep).

**Backward-compat (carefully checked):** Most integration tests have `pen: null` → `respawnSystem` early-returns. The pen-capture test has one sheep outside → never full → dormant. The **one-way-gate test had exactly one inside sheep → would now respawn**; Task 3 fixes it by adding a far-outside sheep so the pen never fills, preserving the containment assertions on the tracked inside sheep. The flocking/grazing/obstacle/dog/bark/stamina/fear tests have no pen. Verified by the full-suite step.

---

## Next plans

- **Plan 12 — Motor: remaining flavor (optional for MVP):** ambient global scares; attractors (water/shade) + thirst/rest; treats + Emitter + Pool + BuffSystem; dog-vs-fence/gate; penned interior-seek + Selector/Conditional nodes; richer GameSignals.
- **Plan 13 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*` — the playable browser game.
```
