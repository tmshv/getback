# Motor: Bark & Flee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dog herding pressure: its mere **presence** gently repels nearby sheep, and a **bark** (on `intent.bark`, with a cooldown) emits a strong, short scare that scatters the flock — both via a `flee` steering behavior reading a per-frame list of stress sources. Verified headless: a barking dog drives nearby sheep away.

**Architecture:** Extends `@getback/motor`. A `StressSource` is a circular scare field (`pos`, `radius`, `intensity`). A `ScareSystem` rebuilds the world's `stress[]` each frame: a low-intensity `presence` source at the dog every frame, plus a high-intensity `bark` source when `intent.bark` fires and the dog's bark cooldown is ready. A `flee` leaf (high priority in the sheep tree) reads `ctx.stress` and steers each sheep away from in-range sources, scaled by intensity and proximity. `SteerEnv`/`SteerContext` gain `stress`.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–7 (merged to `master`).

**Plan 8** of the roadmap. Depends on Plan 7. **Out of scope (later slices):** stamina + bark/sprint gating by stamina; the `fear` drive + fear×cohesion bunching; ambient (global) scares; `GameSignals` (`barked`/`ambientScare`); water/shade attractors; treats/buffs; respawn; the render layer. Bark here is gated only by a cooldown (not stamina yet).

---

## File structure (created/modified)

```
packages/motor/src/scare/StressSource.ts        # NEW: StressSource type
packages/motor/src/systems/ScareSystem.ts        # NEW: build stress[] (presence + bark)
packages/motor/src/systems/ScareSystem.test.ts   # NEW
packages/motor/src/entities/Dog.ts               # MODIFIED: add `barkCooldown`
packages/motor/src/config.ts                     # MODIFIED: add scare/flee tunables
packages/motor/src/ai/behaviors.ts               # MODIFIED: add `flee`
packages/motor/src/ai/behaviors.test.ts          # MODIFIED: flee tests; add stress:[] to ctx literals
packages/motor/src/steering/types.ts             # MODIFIED: SteerContext gains `stress`
packages/motor/src/steering/Behavior.test.ts     # MODIFIED: add stress:[] to ctx literals
packages/motor/src/systems/SteeringSystem.ts     # MODIFIED: SteerEnv gains `stress`
packages/motor/src/systems/NeighborhoodSystem.test.ts # MODIFIED: env literal gains stress
packages/motor/src/ai/trees.ts                   # MODIFIED: buildSheepTree adds flee (top priority)
packages/motor/src/world/World.ts                # MODIFIED: World gains `stress: StressSource[]`
packages/motor/src/world/Game.ts                 # MODIFIED: run ScareSystem; steering env gains stress
packages/motor/src/world/Game.test.ts            # MODIFIED: bark-scatter integration test
packages/motor/src/index.ts                      # MODIFIED: exports
```

**Shared facts:** `.js` import extensions. `Vec2` from `@getback/math`; `DogIntent` in `types.ts`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `StressSource` + `ScareSystem` + dog bark cooldown

**Files:**
- Create: `packages/motor/src/scare/StressSource.ts`
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/entities/Dog.ts`
- Create: `packages/motor/src/systems/ScareSystem.ts`
- Create: `packages/motor/src/systems/ScareSystem.test.ts`

- [ ] **Step 1: Create the `StressSource` type**

Create `packages/motor/src/scare/StressSource.ts`:
```ts
import type { Vec2 } from "@getback/math";

export type StressKind = "presence" | "bark";

// A circular scare field. `flee` repels sheep within `radius`, scaled by
// `intensity` and proximity.
export interface StressSource {
  kind: StressKind;
  pos: Vec2;
  radius: number;
  intensity: number; // [0..1]
}
```

- [ ] **Step 2: Add config tunables + dog bark cooldown**

In `packages/motor/src/config.ts`, add inside the `config` object (after `dog`):
```ts
  scare: { presenceRadius: 26, presenceIntensity: 0.25, barkRadius: 70, barkIntensity: 1, barkCooldown: 0.8 },
  flee: { weight: 2.5 },
```
In `packages/motor/src/entities/Dog.ts`: add `barkCooldown: number;` to the `Dog` interface (so `Dog` is no longer an empty interface — it becomes `export interface Dog extends Mobile { barkCooldown: number; }`), and add `barkCooldown: 0,` to the object returned by `createDog`. Read the file first.

- [ ] **Step 3: Write the failing test**

Create `packages/motor/src/systems/ScareSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scareSystem } from "./ScareSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { StressSource } from "../scare/StressSource.js";
import type { DogIntent } from "../types.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("scareSystem", () => {
  it("emits a presence source at the dog every frame", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 50, y: 60 });
    scareSystem(stress, dog, intent(), 1 / 60);
    expect(stress.length).toBe(1);
    expect(stress[0]!.kind).toBe("presence");
    expect(stress[0]!.pos).toEqual({ x: 50, y: 60 });
    expect(stress[0]!.intensity).toBe(config.scare.presenceIntensity);
  });

  it("emits a bark source when intent.bark fires and the cooldown is ready", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 50, y: 60 });
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    const bark = stress.find((s) => s.kind === "bark");
    expect(bark).toBeDefined();
    expect(bark!.radius).toBe(config.scare.barkRadius);
    expect(dog.barkCooldown).toBeCloseTo(config.scare.barkCooldown); // cooldown set
  });

  it("does not bark again while on cooldown", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 50, y: 60 });
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60); // first bark
    const stress2: StressSource[] = [];
    scareSystem(stress2, dog, intent({ bark: true }), 1 / 60); // still on cooldown
    expect(stress2.some((s) => s.kind === "bark")).toBe(false);
  });

  it("clears the previous frame's sources and is a no-op with no dog", () => {
    const stress: StressSource[] = [{ kind: "bark", pos: { x: 0, y: 0 }, radius: 1, intensity: 1 }];
    scareSystem(stress, null, intent(), 1 / 60);
    expect(stress.length).toBe(0);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/ScareSystem.test.ts`
Expected: FAIL — cannot resolve `./ScareSystem.js`.

- [ ] **Step 5: Write the implementation**

Create `packages/motor/src/systems/ScareSystem.ts`:
```ts
import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";

// Rebuild the per-frame stress list: a low-intensity `presence` field at the dog
// (gentle constant herding pressure) plus a strong `bark` field when the player
// barks and the dog's cooldown is ready.
export function scareSystem(stress: StressSource[], dog: Dog | null, intent: DogIntent, dt: number): void {
  stress.length = 0;
  if (!dog) return;
  stress.push({
    kind: "presence",
    pos: { x: dog.pos.x, y: dog.pos.y },
    radius: config.scare.presenceRadius,
    intensity: config.scare.presenceIntensity,
  });
  if (dog.barkCooldown > 0) dog.barkCooldown -= dt;
  if (intent.bark && dog.barkCooldown <= 0) {
    stress.push({
      kind: "bark",
      pos: { x: dog.pos.x, y: dog.pos.y },
      radius: config.scare.barkRadius,
      intensity: config.scare.barkIntensity,
    });
    dog.barkCooldown = config.scare.barkCooldown;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/ScareSystem.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/scare/StressSource.ts packages/motor/src/config.ts packages/motor/src/entities/Dog.ts packages/motor/src/systems/ScareSystem.ts packages/motor/src/systems/ScareSystem.test.ts
git commit -m "Add motor StressSource, ScareSystem, and dog bark cooldown"
```

---

### Task 2: `flee` behavior + `stress` in `SteerContext`/`SteerEnv`

**Files:**
- Modify: `packages/motor/src/steering/types.ts`
- Modify: `packages/motor/src/systems/SteeringSystem.ts`
- Modify: `packages/motor/src/ai/behaviors.ts`
- Modify: `packages/motor/src/ai/behaviors.test.ts`
- Modify: `packages/motor/src/steering/Behavior.test.ts`
- Modify: `packages/motor/src/systems/NeighborhoodSystem.test.ts`
- Modify: `packages/motor/src/ai/trees.ts`

- [ ] **Step 1: Grow `SteerContext` and `SteerEnv` with `stress`**

In `packages/motor/src/steering/types.ts`: add `import type { StressSource } from "../scare/StressSource.js";` and a field to `SteerContext`:
```ts
  stress: readonly StressSource[];
```
(so it becomes `{ neighbors; grass; obstacles; stress; dt }`).

In `packages/motor/src/systems/SteeringSystem.ts`: add `import type { StressSource } from "../scare/StressSource.js";`, add `stress: readonly StressSource[];` to the `SteerEnv` interface, and include `stress: env.stress` in the `ctx` object built in `steeringSystem`.

- [ ] **Step 2: Add the failing `flee` test + patch ctx literals**

In `packages/motor/src/ai/behaviors.test.ts`: add `flee` to the `./behaviors.js` import and `import type { StressSource } from "../scare/StressSource.js";`. **Add `stress: [],` to EVERY existing context literal in the file** (they currently look like `{ neighbors: [...], grass: noGrass, obstacles: [], dt: 0 }`). Then append:
```ts
describe("fleeStress", () => {
  it("steers away from a nearby stress source", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const src: StressSource = { kind: "bark", pos: { x: 10, y: 0 }, radius: 70, intensity: 1 };
    const out = { x: 0, y: 0 };
    fleeStress().run(self, { neighbors: [], grass: noGrass, obstacles: [], stress: [src], dt: 0 }, out);
    expect(out.x).toBeLessThan(0); // away from the source at +x
  });
  it("ignores stress sources out of range", () => {
    const self = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 }, radius: 5, maxSpeed: 10, maxForce: 100, facing: "down" as const };
    const src: StressSource = { kind: "bark", pos: { x: 500, y: 0 }, radius: 70, intensity: 1 };
    const out = { x: 1, y: 1 };
    fleeStress().run(self, { neighbors: [], grass: noGrass, obstacles: [], stress: [src], dt: 0 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
```

In `packages/motor/src/steering/Behavior.test.ts`: add `stress: [],` to EVERY existing ctx literal.

In `packages/motor/src/systems/NeighborhoodSystem.test.ts`: the `steeringSystem(sheep, { grass, obstacles: [] }, ...)` env literal needs `stress: []` — change it to `{ grass, obstacles: [], stress: [] }`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts`
Expected: FAIL — `flee` not exported / type errors until ctx literals include `stress`.

- [ ] **Step 4: Implement `flee`**

Append to `packages/motor/src/ai/behaviors.ts` (add `import type { StressSource } from "../scare/StressSource.js";` — only if you reference the type; the body uses `ctx.stress` which is already typed, so no direct import is needed, do NOT add an unused import):
```ts
// Steer away from stress sources within range, weighted by intensity and
// proximity (closer + stronger => more push). Reynolds steer toward the away dir.
export function fleeStress(): BehaviorNode {
  return {
    run(e, ctx, out) {
      let ax = 0;
      let ay = 0;
      for (const s of ctx.stress) {
        const dx = e.pos.x - s.pos.x;
        const dy = e.pos.y - s.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < s.radius) {
          const strength = (s.intensity * (s.radius - d)) / s.radius;
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

- [ ] **Step 5: Add `flee` to the sheep tree (top priority)**

In `packages/motor/src/ai/trees.ts`: import `flee` and add it as the FIRST blend child (safety/scatter outranks everything):
```ts
import { separation, cohesion, follow, graze, obstacleAvoid, fleeStress } from "./behaviors.js";
// ...the blend's first element:
    { node: fleeStress(), weight: config.flee.weight },
```
(keep obstacleAvoid/graze/separation/cohesion/follow after it).

- [ ] **Step 6: Run the tests to verify they pass + typecheck**

Run: `npx vitest run packages/motor/src/ai/behaviors.test.ts packages/motor/src/steering/Behavior.test.ts packages/motor/src/systems/NeighborhoodSystem.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0 (catches any ctx/env literal missing `stress`).

- [ ] **Step 7: Commit**

```bash
git add packages/motor/src/steering/types.ts packages/motor/src/systems/SteeringSystem.ts packages/motor/src/ai/behaviors.ts packages/motor/src/ai/behaviors.test.ts packages/motor/src/steering/Behavior.test.ts packages/motor/src/systems/NeighborhoodSystem.test.ts packages/motor/src/ai/trees.ts
git commit -m "Add motor flee behavior and stress in the steering env"
```

---

### Task 3: Wire scare into the world + bark-scatter integration test

**Files:**
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: `World` gains `stress`**

In `packages/motor/src/world/World.ts`: add `import type { StressSource } from "../scare/StressSource.js";`, add `stress: StressSource[];` to the `World` interface (after `dog`), and add `stress: [],` to the object returned by `createWorld` (createWorld signature is unchanged — `stress` is always a fresh empty array).

- [ ] **Step 2: `Game.update` runs `ScareSystem` and threads `stress` into steering**

In `packages/motor/src/world/Game.ts`: add `import { scareSystem } from "../systems/ScareSystem.js";`. Destructure `stress` from `this.world`. Run `scareSystem` BEFORE `steeringSystem`, and pass `stress` in the steering env. The relevant lines become:
```ts
    const { sheep, grass, obstacles, pen, grid, dog, stress } = this.world;
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, step);
    neighborhoodSystem(sheep, grid);
    scareSystem(stress, dog, intent, step);
    steeringSystem(sheep, { grass, obstacles, stress }, step);
    if (dog) dogControlSystem(dog, intent);
    movementSystem(sheep, step);
    if (dog) integrate(dog, step);
    collisionSystem(sheep, obstacles);
    if (dog) collisionSystem([dog], obstacles);
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep);
    }
```

- [ ] **Step 3: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export type { StressSource, StressKind } from "./scare/StressSource.js";
export { scareSystem } from "./systems/ScareSystem.js";
```
and add `fleeStress` to the existing `./ai/behaviors.js` export line.

- [ ] **Step 4: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (`createDog` is already imported from a prior plan; add it if missing):
```ts
describe("bark & flee integration", () => {
  it("a barking dog drives a nearby sheep away from it", () => {
    const dog = createDog({ x: 150, y: 150 });
    const sheep = [createSheep({ x: 170, y: 150 }, defaultSheepTraits())]; // 20px east, within bark radius
    const game = new Game(createWorld(sheep, undefined, [], null, dog));
    const intent = { moveDir: { x: 0, y: 0 }, sprint: false, bark: true }; // bark every frame (cooldown gates repeats)

    const startDist = Math.hypot(sheep[0]!.pos.x - dog.pos.x, sheep[0]!.pos.y - dog.pos.y);
    for (let i = 0; i < 120; i++) game.update(1 / 60, intent);
    const endDist = Math.hypot(sheep[0]!.pos.x - dog.pos.x, sheep[0]!.pos.y - dog.pos.y);

    expect(endDist).toBeGreaterThan(startDist + 20); // fled meaningfully away from the dog
    expect(sheep[0]!.pos.x).toBeGreaterThan(170); // pushed further east (away from the dog at x=150)
    expect(Number.isFinite(sheep[0]!.pos.x)).toBe(true);
  });
});
```

- [ ] **Step 5: Full verification**

Run: `npm test`
Expected: PASS — every test. (Existing integration tests have no dog → `scareSystem` clears `stress` to empty → `flee` is inert; the grazing/flocking tests are unaffected because their worlds have no dog and thus no presence source.)

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Wire ScareSystem into the world and add bark-scatter integration test"
```

---

## Self-review

**Spec coverage (§12.2 presence, §12.3 bark, §7.3 flee, §6 StressSource):**
- `StressSource` + `ScareSystem` (presence + bark + cooldown) (§12.2–12.3) → Task 1 ✓
- `flee` steering away from stress (§7.3) → Task 2 ✓
- Wired into the pipeline + validated (bark scatters sheep) → Task 3 ✓
- **Deliberately deferred:** stamina/bark-gating-by-stamina, `fear` drive + fear×cohesion bunching, ambient (global) scares, `GameSignals`, attractors/thirst, treats/buffs, respawn, render. Bark is gated only by a cooldown here.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `SteerContext`/`SteerEnv` gain `stress` and every ctx/env literal is updated in the same plan (behaviors.test, Behavior.test, NeighborhoodSystem.test, SteeringSystem, Game). `Dog` gains `barkCooldown` (init 0 in `createDog`). `World` gains `stress: StressSource[]` (always `[]`), so `createWorld` callers are unaffected. `scareSystem(stress, dog, intent, dt)` is decoupled from the `World` type (takes the array + dog) so it's unit-testable.

**Backward-compat:** existing integration tests use dog-less worlds; `scareSystem` clears `stress` to `[]` when `dog` is null, so `flee` is inert and the flocking/grazing/collision tests stay green. The dog-control and obstacle tests gain a (now non-null) `stress` array but no dog-driven scare beyond presence, which only repels *sheep* (those tests have none). Verified by the full-suite step.

---

## Next plans

- **Plan 9 — Motor: stamina, fear, ambient & signals:** stamina (drain on sprint/bark, regen, gate bark/sprint); the `fear` drive (rises from stress, decays) + fear×cohesion bunching; ambient global scares on a timer; `GameSignals` (`barked`, `ambientScare`, `sheepPenned`, ...).
- **Plan 10 — Motor: attractors, treats, buffs, respawn:** water/shade attractors + thirst/rest; treats + `Emitter` + `Pool` + `BuffSystem`; pen-fill → respawn; dog-vs-fence/gate; penned interior-seek + `Selector`/`Conditional` nodes.
- **Plan 11 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*`.
