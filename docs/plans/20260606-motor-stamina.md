# Motor: Stamina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dog a stamina budget: **sprinting** and **barking** drain it, it **regenerates** when not sprinting, and it **gates** both abilities (no sprint at 0, no bark below the bark cost). Verified headless: holding sprint+bark depletes stamina and the dog stops sprinting / can't bark until it recovers.

**Architecture:** Extends `@getback/motor`. `Dog` gains a `stamina` field. A `StaminaSystem` applies the sprint drain (when sprinting) and the regen (otherwise), clamped to `[0, max]`. The bark **cost + gate** lives in `ScareSystem` (it already decides when a bark fires); the sprint **gate** lives in `DogControlSystem` (it already applies the sprint multiplier). Pure stamina arithmetic; no `SteerContext` change.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–8 (merged to `master`).

**Plan 9** of the roadmap. Depends on Plan 8. **Out of scope (later slices):** the `fear` drive + fear×cohesion bunching; ambient global scares; `GameSignals`; attractors/thirst; treats/buffs; respawn; the render layer.

---

## File structure (created/modified)

```
packages/motor/src/config.ts                     # MODIFIED: add stamina tunables
packages/motor/src/entities/Dog.ts               # MODIFIED: add `stamina`
packages/motor/src/entities/Dog.test.ts          # MODIFIED: assert stamina init
packages/motor/src/systems/StaminaSystem.ts      # NEW: drain (sprint) + regen
packages/motor/src/systems/StaminaSystem.test.ts # NEW
packages/motor/src/systems/ScareSystem.ts        # MODIFIED: bark requires + spends stamina
packages/motor/src/systems/ScareSystem.test.ts   # MODIFIED: stamina-gate test
packages/motor/src/systems/DogControlSystem.ts   # MODIFIED: sprint requires stamina
packages/motor/src/systems/DogControlSystem.test.ts # MODIFIED: no-sprint-when-empty test
packages/motor/src/world/Game.ts                 # MODIFIED: run StaminaSystem
packages/motor/src/world/Game.test.ts            # MODIFIED: stamina depletion/recovery integration test
packages/motor/src/index.ts                      # MODIFIED: export staminaSystem
```

**Shared facts:** `.js` import extensions. `DogIntent` in `types.ts`. Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `stamina` field + `StaminaSystem`

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/entities/Dog.ts`
- Modify: `packages/motor/src/entities/Dog.test.ts`
- Create: `packages/motor/src/systems/StaminaSystem.ts`
- Create: `packages/motor/src/systems/StaminaSystem.test.ts`

- [ ] **Step 1: Add config + the `stamina` field**

In `packages/motor/src/config.ts`, add inside the `config` object (after `scare`):
```ts
  stamina: { max: 100, sprintDrain: 18, regen: 22, barkCost: 12 },
```
In `packages/motor/src/entities/Dog.ts`: add `stamina: number;` to the `Dog` interface (after `barkCooldown`), and `stamina: config.stamina.max,` to the object returned by `createDog`. Read the file first.

In `packages/motor/src/entities/Dog.test.ts`: in the first test (which asserts dog fields), add `expect(d.stamina).toBe(config.stamina.max);` (`config` is already imported there).

- [ ] **Step 2: Write the failing test**

Create `packages/motor/src/systems/StaminaSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { staminaSystem } from "./StaminaSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { DogIntent } from "../types.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("staminaSystem", () => {
  it("drains stamina while sprinting (moving + sprint held)", () => {
    const dog = createDog({ x: 0, y: 0 }); // stamina = max
    staminaSystem(dog, intent({ moveDir: { x: 1, y: 0 }, sprint: true }), 1);
    expect(dog.stamina).toBeCloseTo(config.stamina.max - config.stamina.sprintDrain);
  });
  it("regenerates when not sprinting", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 50;
    staminaSystem(dog, intent(), 1); // idle -> regen
    expect(dog.stamina).toBeCloseTo(50 + config.stamina.regen);
  });
  it("does not drain when sprint is held but there is no movement", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 50;
    staminaSystem(dog, intent({ moveDir: { x: 0, y: 0 }, sprint: true }), 1); // standing still -> regen, not drain
    expect(dog.stamina).toBeGreaterThan(50);
  });
  it("clamps to [0, max]", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 5;
    staminaSystem(dog, intent({ moveDir: { x: 1, y: 0 }, sprint: true }), 1); // would go negative
    expect(dog.stamina).toBe(0);
    dog.stamina = config.stamina.max - 1;
    staminaSystem(dog, intent(), 1); // would exceed max
    expect(dog.stamina).toBe(config.stamina.max);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/StaminaSystem.test.ts`
Expected: FAIL — cannot resolve `./StaminaSystem.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/motor/src/systems/StaminaSystem.ts`:
```ts
import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import { config } from "../config.js";

// Sprinting (moving + sprint held + has stamina) drains stamina; otherwise it
// regenerates. Clamped to [0, max]. Bark cost is handled in ScareSystem.
export function staminaSystem(dog: Dog, intent: DogIntent, dt: number): void {
  const moving = intent.moveDir.x !== 0 || intent.moveDir.y !== 0;
  const sprinting = intent.sprint && moving && dog.stamina > 0;
  if (sprinting) {
    dog.stamina -= config.stamina.sprintDrain * dt;
  } else {
    dog.stamina += config.stamina.regen * dt;
  }
  if (dog.stamina < 0) dog.stamina = 0;
  if (dog.stamina > config.stamina.max) dog.stamina = config.stamina.max;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/StaminaSystem.test.ts packages/motor/src/entities/Dog.test.ts`
Expected: PASS — the 4 StaminaSystem tests + the Dog tests (now asserting stamina init).

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/entities/Dog.ts packages/motor/src/entities/Dog.test.ts packages/motor/src/systems/StaminaSystem.ts packages/motor/src/systems/StaminaSystem.test.ts
git commit -m "Add motor dog stamina and StaminaSystem"
```

---

### Task 2: Gate bark (ScareSystem) and sprint (DogControlSystem) on stamina

**Files:**
- Modify: `packages/motor/src/systems/ScareSystem.ts`
- Modify: `packages/motor/src/systems/ScareSystem.test.ts`
- Modify: `packages/motor/src/systems/DogControlSystem.ts`
- Modify: `packages/motor/src/systems/DogControlSystem.test.ts`

- [ ] **Step 1: Gate + spend stamina on bark in `ScareSystem`**

In `packages/motor/src/systems/ScareSystem.ts`, read it. Add `stamina` to the bark condition and spend it. Change the bark block so the `if` requires enough stamina and deducts the cost:
```ts
  if (intent.bark && dog.barkCooldown <= 0 && dog.stamina >= config.stamina.barkCost) {
    stress.push({
      kind: "bark",
      pos: { x: dog.pos.x, y: dog.pos.y },
      radius: config.scare.barkRadius,
      intensity: config.scare.barkIntensity,
    });
    dog.barkCooldown = config.scare.barkCooldown;
    dog.stamina -= config.stamina.barkCost;
  }
```
(The presence push and cooldown decrement above it are unchanged.)

- [ ] **Step 2: Add the stamina-gate test to `ScareSystem.test.ts`**

Append to `packages/motor/src/systems/ScareSystem.test.ts`:
```ts
describe("scareSystem stamina gate", () => {
  it("spends stamina on a bark", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 0, y: 0 }); // full stamina
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    expect(dog.stamina).toBeCloseTo(config.stamina.max - config.stamina.barkCost);
  });
  it("will not bark when stamina is below the bark cost", () => {
    const stress: StressSource[] = [];
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = config.stamina.barkCost - 1; // too low
    scareSystem(stress, dog, intent({ bark: true }), 1 / 60);
    expect(stress.some((s) => s.kind === "bark")).toBe(false);
    expect(dog.stamina).toBe(config.stamina.barkCost - 1); // unchanged
  });
});
```

- [ ] **Step 3: Gate sprint on stamina in `DogControlSystem`**

In `packages/motor/src/systems/DogControlSystem.ts`, read it. Change the sprint condition so sprint only applies when there is stamina:
```ts
  const sprinting = intent.sprint && dog.stamina > 0;
  const speed = dog.maxSpeed * (sprinting ? config.dog.sprintMult : 1);
```
(Replace the existing `intent.sprint ? config.dog.sprintMult : 1` expression with the gated `sprinting` variable.)

- [ ] **Step 4: Add the no-sprint-when-empty test to `DogControlSystem.test.ts`**

Append to `packages/motor/src/systems/DogControlSystem.test.ts`:
```ts
it("does not sprint when stamina is empty", () => {
  const d = createDog({ x: 0, y: 0 });
  d.stamina = 0;
  dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 }, sprint: true }));
  expect(d.force.x).toBeCloseTo(config.dog.maxSpeed); // base speed, NOT sprint-scaled
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/motor/src/systems/ScareSystem.test.ts packages/motor/src/systems/DogControlSystem.test.ts`
Expected: PASS — existing tests (full-stamina dog still barks/sprints) + the new gate tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/systems/ScareSystem.ts packages/motor/src/systems/ScareSystem.test.ts packages/motor/src/systems/DogControlSystem.ts packages/motor/src/systems/DogControlSystem.test.ts
git commit -m "Gate bark and sprint on dog stamina"
```

---

### Task 3: Wire `StaminaSystem` into the pipeline + integration test

**Files:**
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: Run `StaminaSystem` in `Game.update`**

In `packages/motor/src/world/Game.ts`, read it. Add `import { staminaSystem } from "../systems/StaminaSystem.js";`. After the `if (dog) dogControlSystem(dog, intent);` line, add the stamina update:
```ts
    if (dog) staminaSystem(dog, intent, step);
```
(So within the dog branch: `dogControlSystem` reads current stamina for the sprint gate, then `staminaSystem` applies drain/regen. The bark cost was already spent in `scareSystem` earlier in the frame.)

- [ ] **Step 2: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export { staminaSystem } from "./systems/StaminaSystem.js";
```

- [ ] **Step 3: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts`:
```ts
describe("stamina integration", () => {
  it("holding sprint+bark depletes stamina, then it regenerates when idle", () => {
    const dog = createDog({ x: 150, y: 150 });
    const game = new Game(createWorld([], undefined, [], null, dog));
    const busy = { moveDir: { x: 1, y: 0 }, sprint: true, bark: true };

    for (let i = 0; i < 180; i++) game.update(1 / 60, busy); // 3s of sprint+bark
    const drained = dog.stamina;
    expect(drained).toBeLessThan(config.stamina.max * 0.5); // meaningfully depleted

    const idle = { moveDir: { x: 0, y: 0 }, sprint: false, bark: false };
    for (let i = 0; i < 180; i++) game.update(1 / 60, idle); // 3s rest
    expect(dog.stamina).toBeGreaterThan(drained); // recovered
    expect(dog.stamina).toBeLessThanOrEqual(config.stamina.max); // never exceeds max
  });

  it("a stamina-starved dog cannot bark", () => {
    const dog = createDog({ x: 150, y: 150 });
    dog.stamina = 0;
    const sheep = [createSheep({ x: 165, y: 150 }, defaultSheepTraits())];
    const world = createWorld(sheep, undefined, [], null, dog);
    const game = new Game(world);
    game.update(1 / 60, { moveDir: { x: 0, y: 0 }, sprint: false, bark: true });
    // no bark source emitted (only the presence source, if any)
    expect(world.stress.some((s) => s.kind === "bark")).toBe(false);
  });
});
```

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: PASS — every test. (Existing dog/bark integration tests start at full stamina, so a few barks/sprints still fire normally; the bark-scatter test barks at ~12 cost from 100 with 0.8s cooldown, so it never runs out over its short run.)

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Wire StaminaSystem into the pipeline and add stamina integration test"
```

---

## Self-review

**Spec coverage (§12.4 stamina):**
- `stamina` field + `StaminaSystem` (drain/regen/clamp) → Task 1 ✓
- Bark gated + costs stamina (ScareSystem); sprint gated (DogControlSystem) → Task 2 ✓
- Wired + validated (deplete → recover; starved dog can't bark) → Task 3 ✓
- **Deliberately deferred:** fear drive + fear×cohesion, ambient scares, GameSignals, attractors/thirst, treats/buffs, respawn, render.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `Dog` gains `stamina` (init `config.stamina.max`); existing `Dog.test` asserts fields individually so it stays green after adding the assertion. `staminaSystem(dog, intent, dt)` is decoupled (no World). Bark cost lives in `ScareSystem` (which owns the bark decision); sprint gate in `DogControlSystem` (which owns the speed); drain/regen in `StaminaSystem` — each system owns one slice, no double-spend. No `SteerContext` change → no ctx ripple.

**Backward-compat:** all existing dog tests start at full stamina, so bark/sprint behave as before for their short runs; dog-less worlds skip the stamina branch entirely. Verified by the full-suite step. The one subtlety: the bark-scatter integration test (Plan 8) barks once every 0.8s cooldown at 12 stamina each from 100 — over its 120-tick (2s) run that's ~3 barks ≈ 36 stamina, never hitting the floor, so it still scatters.

---

## Next plans

- **Plan 10 — Motor: fear, ambient & signals:** the `fear` drive (rises from stress, decays) + fear×cohesion bunching; ambient global scares on a timer; `GameSignals` (`barked`, `ambientScare`, `sheepPenned`, `penFilled`).
- **Plan 11 — Motor: attractors, treats, buffs, respawn:** water/shade attractors + thirst/rest; treats + `Emitter` + `Pool` + `BuffSystem`; pen-fill → respawn; dog-vs-fence/gate; penned interior-seek + `Selector`/`Conditional` nodes.
- **Plan 12 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*` — the playable browser game.
