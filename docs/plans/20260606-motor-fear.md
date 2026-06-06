# Motor: Fear Drive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sheep a `fear` drive that **spikes** when stress sources are near and **decays** when they're gone, and make **cohesion tighten with fear** so a barked flock bunches into a stampeding knot, then relaxes. Verified headless: a bark spikes every nearby sheep's fear, which then decays.

**Architecture:** Extends `@getback/motor`. `Sheep.drives` gains `fear`. A `FearSystem` sets each sheep's `fear` to the strongest in-range stress (intensity × proximity) or lets it decay toward 0, whichever is higher. `SteerContext` gains the self sheep's `fear`, and the `cohesion` behavior multiplies its force by `(1 + fear)` — scared sheep pull toward the flock harder. Pipeline: `FearSystem` runs after `ScareSystem` (fresh stress) and before `SteeringSystem` (so cohesion sees this frame's fear).

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–9 (merged to `master`).

**Plan 10** of the roadmap. Depends on Plan 9. **Out of scope (later slices):** ambient global scares; `GameSignals`; attractors/thirst; treats/buffs; respawn; the render layer.

---

## File structure (created/modified)

```
packages/motor/src/config.ts                     # MODIFIED: add fear tunable
packages/motor/src/entities/Sheep.ts             # MODIFIED: drives gains `fear`
packages/motor/src/systems/FearSystem.ts         # NEW: fear from stress (+ decay)
packages/motor/src/systems/FearSystem.test.ts    # NEW
packages/motor/src/steering/types.ts             # MODIFIED: SteerContext gains `fear`
packages/motor/src/systems/SteeringSystem.ts     # MODIFIED: ctx.fear = sheep.drives.fear
packages/motor/src/ai/behaviors.ts               # MODIFIED: cohesion scales by (1+fear)
packages/motor/src/ai/behaviors.test.ts          # MODIFIED: cohesion fear test; add fear:0 to ctx literals
packages/motor/src/steering/Behavior.test.ts     # MODIFIED: add fear:0 to ctx literals
packages/motor/src/world/Game.ts                 # MODIFIED: run FearSystem
packages/motor/src/world/Game.test.ts            # MODIFIED: fear spike/decay integration test
packages/motor/src/index.ts                      # MODIFIED: export fearSystem
```

**Shared facts:** `.js` import extensions. `Vec2` from `@getback/math`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `fear` drive + `FearSystem`

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/entities/Sheep.ts`
- Create: `packages/motor/src/systems/FearSystem.ts`
- Create: `packages/motor/src/systems/FearSystem.test.ts`

- [ ] **Step 1: Add config + the `fear` drive field**

In `packages/motor/src/config.ts`, add inside the `config` object (after `flee`):
```ts
  fear: { decay: 1.2 }, // fear units shed per second when no stress is near
```
In `packages/motor/src/entities/Sheep.ts`: change the `drives` field of the `Sheep` interface from `{ hunger: number }` to `{ hunger: number; fear: number }`, and in `createSheep` change `drives: { hunger: 0 },` to `drives: { hunger: 0, fear: 0 },`. Read the file first.

- [ ] **Step 2: Write the failing test**

Create `packages/motor/src/systems/FearSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fearSystem } from "./FearSystem.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { config } from "../config.js";
import type { StressSource } from "../scare/StressSource.js";

describe("fearSystem", () => {
  it("spikes fear toward the strongest in-range stress (intensity x proximity)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    const src: StressSource = { kind: "bark", pos: { x: 0, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeCloseTo(1); // at the source center, full intensity
  });

  it("scales fear by proximity within the radius", () => {
    const s = createSheep({ x: 25, y: 0 }, defaultSheepTraits()); // halfway out of a radius-50 source
    const src: StressSource = { kind: "bark", pos: { x: 0, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeCloseTo(0.5); // (50-25)/50 * 1
  });

  it("decays fear toward 0 when no stress is in range", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.drives.fear = 1;
    fearSystem([s], [], 1); // dt=1, decay 1.2 => clamps at 0
    expect(s.drives.fear).toBe(0);
  });

  it("holds at the stress level even while a higher prior fear decays (max of the two)", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.drives.fear = 0.9;
    const src: StressSource = { kind: "presence", pos: { x: 0, y: 0 }, radius: 50, intensity: 0.25 };
    fearSystem([s], [src], 1 / 60); // decayed ~0.88 > target 0.25 => keeps the decayed value
    expect(s.drives.fear).toBeGreaterThan(0.85);
    expect(s.drives.fear).toBeLessThan(0.9);
  });

  it("ignores out-of-range stress", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.drives.fear = 0.4;
    const src: StressSource = { kind: "bark", pos: { x: 500, y: 0 }, radius: 50, intensity: 1 };
    fearSystem([s], [src], 1 / 60);
    expect(s.drives.fear).toBeLessThan(0.4); // only decay applies
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/FearSystem.test.ts`
Expected: FAIL — cannot resolve `./FearSystem.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/motor/src/systems/FearSystem.ts`:
```ts
import type { Sheep } from "../entities/Sheep.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";

// Each sheep's fear is the strongest in-range stress (intensity x proximity) or
// the previous fear shed by `decay` this frame, whichever is higher. So fear
// spikes on a bark and lingers/decays after the source is gone. Clamped >= 0.
export function fearSystem(sheep: Sheep[], stress: readonly StressSource[], dt: number): void {
  const decay = config.fear.decay;
  for (const s of sheep) {
    let target = 0;
    for (const src of stress) {
      const dx = s.pos.x - src.pos.x;
      const dy = s.pos.y - src.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < src.radius) {
        const f = (src.intensity * (src.radius - d)) / src.radius;
        if (f > target) target = f;
      }
    }
    let decayed = s.drives.fear - decay * dt;
    if (decayed < 0) decayed = 0;
    s.drives.fear = target > decayed ? target : decayed;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/FearSystem.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/entities/Sheep.ts packages/motor/src/systems/FearSystem.ts packages/motor/src/systems/FearSystem.test.ts
git commit -m "Add motor fear drive and FearSystem"
```

---

### Task 2: `fear` in `SteerContext` + cohesion bunching

**Files:**
- Modify: `packages/motor/src/steering/types.ts`
- Modify: `packages/motor/src/systems/SteeringSystem.ts`
- Modify: `packages/motor/src/ai/behaviors.ts`
- Modify: `packages/motor/src/ai/behaviors.test.ts`
- Modify: `packages/motor/src/steering/Behavior.test.ts`

- [ ] **Step 1: Grow `SteerContext` with the self sheep's `fear`**

In `packages/motor/src/steering/types.ts`, add a field to `SteerContext`:
```ts
  fear: number; // the steering sheep's own fear drive [0..1]
```
(so it becomes `{ neighbors; grass; obstacles; stress; fear; dt }`).

- [ ] **Step 2: Set `ctx.fear` in `SteeringSystem`**

In `packages/motor/src/systems/SteeringSystem.ts`, in the `ctx` object built per sheep, add `fear: s.drives.fear,`.

- [ ] **Step 3: Add the failing cohesion test + patch ctx literals**

In `packages/motor/src/ai/behaviors.test.ts`: **add `fear: 0,` to EVERY existing ctx literal** (the separation/cohesion/follow/graze/obstacleAvoid/fleeStress tests — find each `{ neighbors:` literal). Then append a fear-boost test:
```ts
describe("cohesion fear boost", () => {
  it("produces a stronger pull toward the flock when afraid", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const a = { pos: { x: 30, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const calm = { x: 0, y: 0 };
    const scared = { x: 0, y: 0 };
    cohesion(6).run(self, { neighbors: [a], grass: noGrass, obstacles: [], stress: [], fear: 0, dt: 0 }, calm);
    cohesion(6).run(self, { neighbors: [a], grass: noGrass, obstacles: [], stress: [], fear: 1, dt: 0 }, scared);
    expect(Math.hypot(scared.x, scared.y)).toBeGreaterThan(Math.hypot(calm.x, calm.y)); // fear=1 => stronger
  });
});
```

In `packages/motor/src/steering/Behavior.test.ts`: add `fear: 0,` to EVERY existing ctx literal.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: FAIL — type errors until ctx literals include `fear`, and the new cohesion test fails (no boost yet).

- [ ] **Step 5: Add the fear boost to `cohesion`**

In `packages/motor/src/ai/behaviors.ts`, find the `cohesion` factory. After it computes the steering force via `seek(e, { x: cx / count, y: cy / count }, out)`, scale the result by `(1 + ctx.fear)`:
```ts
      seek(e, { x: cx / count, y: cy / count }, out);
      const boost = 1 + ctx.fear; // scared sheep pull toward the flock harder (bunch)
      out.x *= boost;
      out.y *= boost;
      return "fired";
```
(Only add the `boost` lines before the existing `return "fired"` in cohesion's `run`. Leave the empty-neighbors early `return "fired"` branch unchanged — fear has nothing to scale there.)

- [ ] **Step 6: Run the tests to verify they pass + typecheck**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts packages/motor/src/steering/Behavior.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0 (catches any ctx literal missing `fear`).

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/systems/SteeringSystem.ts packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts packages/motor/src/steering/Behavior.test.ts
git commit -m "Add fear to SteerContext and fear-boosted cohesion bunching"
```

---

### Task 3: Wire `FearSystem` into the pipeline + integration test

**Files:**
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Run `FearSystem` in `Game.update`**

In `packages/motor/src/world/Game.ts`, read it. Add `import { fearSystem } from "../systems/FearSystem.js";`. The current order has `scareSystem(stress, dog, intent, step)` then `steeringSystem(...)`. Insert `fearSystem` BETWEEN them (so fear reflects this frame's stress before steering reads it):
```ts
    scareSystem(stress, dog, intent, step);
    fearSystem(sheep, stress, step);
    steeringSystem(sheep, { grass, obstacles, stress }, step);
```

- [ ] **Step 2: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export { fearSystem } from "./systems/FearSystem.js";
```

- [ ] **Step 3: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (`createDog`, `createSheep`, `defaultSheepTraits`, `config` already imported):
```ts
describe("fear integration", () => {
  it("a bark spikes nearby sheep fear, which then decays once the dog stops barking", () => {
    const dog = createDog({ x: 150, y: 150 });
    const sheep = [createSheep({ x: 175, y: 150 }, defaultSheepTraits())]; // within bark radius (70)
    const game = new Game(createWorld(sheep, undefined, [], null, dog));

    // a few frames of barking -> fear spikes
    for (let i = 0; i < 30; i++) game.update(1 / 60, { moveDir: { x: 0, y: 0 }, sprint: false, bark: true });
    const scared = sheep[0]!.drives.fear;
    expect(scared).toBeGreaterThan(0.3); // meaningfully afraid

    // dog gone (move it far away) and silent -> fear decays
    dog.pos.x = 1000;
    dog.pos.y = 1000;
    for (let i = 0; i < 120; i++) game.update(1 / 60, { moveDir: { x: 0, y: 0 }, sprint: false, bark: false });
    expect(sheep[0]!.drives.fear).toBeLessThan(scared * 0.5); // calmed down
  });
});
```

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: PASS — every test. (Existing integration tests: dog-less worlds have empty stress, so `fearSystem` leaves fear at 0 → cohesion boost is `×1` → flocking/grazing unchanged. The bark-scatter test now also raises fear but its assertion is about fleeing distance, which fear doesn't reduce.)

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Wire FearSystem into the pipeline and add fear integration test"
```

---

## Self-review

**Spec coverage (§8.1 fear drive, §7.3/§8.4 fear×cohesion bunching):**
- `fear` drive + `FearSystem` (spike from stress, decay) → Task 1 ✓
- `fear` in `SteerContext` + cohesion `×(1+fear)` bunching → Task 2 ✓
- Wired + validated (bark spikes fear, then it decays) → Task 3 ✓
- **Deliberately deferred:** ambient global scares, `GameSignals`, attractors/thirst, treats/buffs, respawn, render.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `Sheep.drives` gains `fear` (init 0 in `createSheep`); the Plan-3 `DriveSystem` only touches `hunger`, unaffected. `SteerContext` gains `fear: number`, set by `SteeringSystem` from `s.drives.fear`; every ctx literal (behaviors.test, Behavior.test) is updated. `NeighborhoodSystem.test` passes a `SteerEnv` (not a ctx) so it needs no change — `fear` is per-sheep, derived inside `SteeringSystem`, not part of `SteerEnv`. `fearSystem(sheep, stress, dt)` is decoupled (no World).

**Backward-compat:** dog-less worlds keep `stress` empty → `fearSystem` decays all fears to/stays 0 → cohesion boost is `×(1+0)=×1` → the flocking and grazing integration tests are unchanged. Verified by the full-suite step.

---

## Next plans

- **Plan 11 — Motor: ambient scares, attractors, treats, buffs, respawn, signals:** ambient global scares on a timer; `GameSignals`; water/shade attractors + thirst/rest; treats + `Emitter` + `Pool` + `BuffSystem`; pen-fill → respawn; dog-vs-fence/gate; penned interior-seek + `Selector`/`Conditional` nodes. (May split further.)
- **Plan 12 — `@getback/game` + apps/examples:** the playable browser game.
