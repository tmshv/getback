# Motor: Dog & Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a controllable **dog** on the pasture: it follows an abstract `DogIntent` (8-way move + sprint), brakes tightly when there's no input, integrates through the same physics, and collides with obstacles. `Game.update` gains an `intent` argument. Verified headless: the dog drives toward the intent direction and stops at an obstacle.

**Architecture:** Extends `@getback/motor`. A `Dog` is a `Mobile` with the dog's (higher) speed/force tuning. A `DogControlSystem` implements `intentFollow`: convert `intent.moveDir` into a desired velocity (sprint-scaled), steer toward it (`desired - vel`), or actively brake when there's no input. `Game.update(dt, intent)` runs the dog control, integrates the dog alongside the sheep, and resolves dog-vs-obstacle collision. No `SteerContext` change — the dog's control is a dedicated system, not part of the sheep steering tree.

**Tech Stack:** TypeScript 5 (strict), Vitest 2; builds on Plans 1–6 (merged to `master`).

**Plan 7** of the roadmap. Depends on Plan 6. **Out of scope (later slices):** stamina + sprint-gating; bark + `ScareSystem` + stress sources + fear/flee; water/shade attractors + thirst; treats + `Emitter` + `Pool` + `BuffSystem`; pen-fill + respawn; ambient scares; `GameSignals`; dog-vs-fence/one-way-gate interaction (the dog passes through fences for now); penned interior-seek + `Selector`/`Conditional` nodes; the render layer.

---

## File structure (created/modified)

```
packages/motor/src/entities/Dog.ts        # NEW: Dog + createDog
packages/motor/src/entities/Dog.test.ts   # NEW
packages/motor/src/systems/DogControlSystem.ts      # NEW: intentFollow
packages/motor/src/systems/DogControlSystem.test.ts # NEW
packages/motor/src/config.ts              # MODIFIED: add dog tunables
packages/motor/src/world/World.ts         # MODIFIED: World gains `dog: Dog | null`; createWorld param
packages/motor/src/world/Game.ts          # MODIFIED: update(dt, intent) runs dog control + integrate + collision
packages/motor/src/world/Game.test.ts     # MODIFIED: dog control integration test
packages/motor/src/index.ts               # MODIFIED: export Dog/createDog, dogControlSystem
```

**Shared facts:** `.js` import extensions. `Vec2` from `@getback/math`; `DogIntent` is already defined in `motor/src/types.ts` (`{ moveDir: Vec2; sprint: boolean; bark: boolean }`). Single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. One-line imperative commits. Work from repo root on a feature branch.

---

### Task 1: `Dog` entity

**Files:**
- Modify: `packages/motor/src/config.ts`
- Create: `packages/motor/src/entities/Dog.ts`
- Create: `packages/motor/src/entities/Dog.test.ts`

- [ ] **Step 1: Add dog tunables**

In `packages/motor/src/config.ts`, add inside the `config` object (after `pen`):
```ts
  dog: { radius: 6, maxSpeed: 70, maxForce: 400, sprintMult: 1.6, stopGain: 12 },
```

- [ ] **Step 2: Write the failing test**

Create `packages/motor/src/entities/Dog.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createDog } from "./Dog.js";
import { config } from "../config.js";

describe("createDog", () => {
  it("builds a Mobile dog at the given position with dog tuning", () => {
    const d = createDog({ x: 30, y: 40 });
    expect(d.pos).toEqual({ x: 30, y: 40 });
    expect(d.vel).toEqual({ x: 0, y: 0 });
    expect(d.force).toEqual({ x: 0, y: 0 });
    expect(d.radius).toBe(config.dog.radius);
    expect(d.maxSpeed).toBe(config.dog.maxSpeed);
    expect(d.maxForce).toBe(config.dog.maxForce);
  });
  it("copies the position and seeds prevPos", () => {
    const pos = { x: 1, y: 2 };
    const d = createDog(pos);
    pos.x = 999;
    expect(d.pos.x).toBe(1);
    expect(d.prevPos).toEqual({ x: 1, y: 2 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/entities/Dog.test.ts`
Expected: FAIL — cannot resolve `./Dog.js`.

- [ ] **Step 4: Write the implementation**

Create `packages/motor/src/entities/Dog.ts`:
```ts
import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import { config } from "../config.js";

// The player's corgi. For now just a Mobile with dog tuning; stamina/buffs land
// in a later slice.
export interface Dog extends Mobile {}

export function createDog(pos: Vec2): Dog {
  return {
    pos: { x: pos.x, y: pos.y },
    prevPos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    radius: config.dog.radius,
    maxSpeed: config.dog.maxSpeed,
    maxForce: config.dog.maxForce,
    facing: "down",
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/entities/Dog.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/entities/Dog.ts packages/motor/src/entities/Dog.test.ts
git commit -m "Add motor Dog entity and tuning"
```

---

### Task 2: `DogControlSystem` — intentFollow

**Files:**
- Create: `packages/motor/src/systems/DogControlSystem.ts`
- Create: `packages/motor/src/systems/DogControlSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/motor/src/systems/DogControlSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dogControlSystem } from "./DogControlSystem.js";
import { createDog } from "../entities/Dog.js";
import { config } from "../config.js";
import type { DogIntent } from "../types.js";

const intent = (over: Partial<DogIntent> = {}): DogIntent => ({ moveDir: { x: 0, y: 0 }, sprint: false, bark: false, ...over });

describe("dogControlSystem", () => {
  it("steers toward the move direction (from rest, force = desired velocity)", () => {
    const d = createDog({ x: 0, y: 0 }); // vel 0
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 } }));
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed); // desired (maxSpeed,0) - vel (0,0)
    expect(d.force.y).toBeCloseTo(0);
  });
  it("scales desired speed by sprintMult when sprinting", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 1, y: 0 }, sprint: true }));
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * config.dog.sprintMult);
  });
  it("normalizes a diagonal move direction", () => {
    const d = createDog({ x: 0, y: 0 });
    dogControlSystem(d, intent({ moveDir: { x: 3, y: 4 } })); // length 5 -> normalized (0.6,0.8)
    expect(d.force.x).toBeCloseTo(config.dog.maxSpeed * 0.6);
    expect(d.force.y).toBeCloseTo(config.dog.maxSpeed * 0.8);
  });
  it("actively brakes (force opposes velocity) when there is no input", () => {
    const d = createDog({ x: 0, y: 0 });
    d.vel = { x: 10, y: 0 };
    dogControlSystem(d, intent({ moveDir: { x: 0, y: 0 } }));
    expect(d.force.x).toBeCloseTo(-10 * config.dog.stopGain);
    expect(d.force.y).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/motor/src/systems/DogControlSystem.test.ts`
Expected: FAIL — cannot resolve `./DogControlSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/motor/src/systems/DogControlSystem.ts`:
```ts
import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import { config } from "../config.js";

// intentFollow: steer the dog toward the desired (sprint-scaled) velocity, or
// actively brake when there is no input so control feels tight. Writes dog.force,
// which MovementSystem then integrates (and clamps to maxForce/maxSpeed).
export function dogControlSystem(dog: Dog, intent: DogIntent): void {
  const dir = intent.moveDir;
  const mag = Math.hypot(dir.x, dir.y);
  if (mag < 1e-6) {
    dog.force.x = -dog.vel.x * config.dog.stopGain;
    dog.force.y = -dog.vel.y * config.dog.stopGain;
    return;
  }
  const speed = dog.maxSpeed * (intent.sprint ? config.dog.sprintMult : 1);
  dog.force.x = (dir.x / mag) * speed - dog.vel.x;
  dog.force.y = (dir.y / mag) * speed - dog.vel.y;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/motor/src/systems/DogControlSystem.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/DogControlSystem.ts packages/motor/src/systems/DogControlSystem.test.ts
git commit -m "Add motor DogControlSystem intentFollow"
```

---

### Task 3: Wire the dog into the world + control integration test

**Files:**
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/index.ts`
- Modify: `packages/motor/src/world/Game.test.ts`

- [ ] **Step 1: `World` gains an optional `dog`**

In `packages/motor/src/world/World.ts`: add `import type { Dog } from "../entities/Dog.js";`, add `dog: Dog | null;` to the `World` interface (after `pen`), and add a `dog` parameter to `createWorld` (default `null`):
```ts
export function createWorld(
  sheep: Sheep[] = [],
  grass: GrassField = defaultGrass(),
  obstacles: Obstacle[] = [],
  pen: Pen | null = null,
  dog: Dog | null = null,
): World {
  return {
    sheep,
    bounds: { ...config.bounds },
    grass,
    obstacles,
    pen,
    dog,
    grid: new UniformGrid<Sheep>(config.flock.perception),
  };
}
```

- [ ] **Step 2: `Game.update(dt, intent)` controls + integrates + collides the dog**

In `packages/motor/src/world/Game.ts`: add imports:
```ts
import type { DogIntent } from "../types.js";
import { dogControlSystem } from "../systems/DogControlSystem.js";
import { integrate } from "../systems/MovementSystem.js";
```
Add a module-level neutral intent (above the class):
```ts
const NEUTRAL_INTENT: DogIntent = { moveDir: { x: 0, y: 0 }, sprint: false, bark: false };
```
Change `update` to accept an optional intent and drive the dog. The new `update`:
```ts
  update(dt: number, intent: DogIntent = NEUTRAL_INTENT): void {
    const step = Math.min(dt, config.dtClampMax);
    const { sheep, grass, obstacles, pen, grid, dog } = this.world;
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, step);
    neighborhoodSystem(sheep, grid);
    steeringSystem(sheep, { grass, obstacles }, step);
    if (dog) dogControlSystem(dog, intent);
    movementSystem(sheep, step);
    if (dog) integrate(dog, step);
    collisionSystem(sheep, obstacles);
    if (dog) collisionSystem([dog], obstacles);
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep);
    }
  }
```
(`integrate` is the single-entity integrator from MovementSystem — already exported. The dog collides with obstacles but not fences yet, per scope.)

- [ ] **Step 3: Update the barrel**

In `packages/motor/src/index.ts`, add:
```ts
export type { Dog } from "./entities/Dog.js";
export { createDog } from "./entities/Dog.js";
export { dogControlSystem } from "./systems/DogControlSystem.js";
```

- [ ] **Step 4: Add the integration test**

Append to `packages/motor/src/world/Game.test.ts` (add `import { createDog } from "../entities/Dog.js";` and `import { createObstacle } from "../entities/Obstacle.js";` if not already present; `config` is already imported):
```ts
describe("dog control integration", () => {
  it("the dog drives toward the intent direction", () => {
    const dog = createDog({ x: 100, y: 100 });
    const game = new Game(createWorld([], undefined, [], null, dog));
    const intent = { moveDir: { x: 1, y: 0 }, sprint: false, bark: false };
    for (let i = 0; i < 60; i++) game.update(1 / 60, intent);
    expect(dog.pos.x).toBeGreaterThan(110); // moved clearly east
    expect(Math.abs(dog.pos.y - 100)).toBeLessThan(2); // stayed on the y line
    expect(dog.facing).toBe("right");
  });

  it("the dog cannot drive through an obstacle", () => {
    const dog = createDog({ x: 100, y: 100 });
    const rock = createObstacle("rock", { x: 160, y: 100 }, 14);
    const game = new Game(createWorld([], undefined, [rock], null, dog));
    const intent = { moveDir: { x: 1, y: 0 }, sprint: true, bark: false }; // sprint straight at it
    for (let i = 0; i < 300; i++) {
      game.update(1 / 60, intent);
      const d = Math.hypot(dog.pos.x - rock.pos.x, dog.pos.y - rock.pos.y);
      expect(d).toBeGreaterThan(dog.radius + rock.radius - 0.5); // never penetrates
    }
    expect(dog.pos.x).toBeLessThan(rock.pos.x); // stayed on the near (west) side
  });

  it("update() still works without an intent argument (neutral)", () => {
    const game = new Game(createWorld()); // no dog
    expect(() => game.update(1 / 60)).not.toThrow();
  });
});
```

- [ ] **Step 5: Full verification**

Run: `npm test`
Expected: PASS — every test (existing integration tests call `update(1/60)` with no intent → neutral; their worlds have no dog, so the dog branches are skipped).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/motor/src/world/World.ts packages/motor/src/world/Game.ts packages/motor/src/index.ts packages/motor/src/world/Game.test.ts
git commit -m "Wire dog into the world, intent-driven Game.update, dog-obstacle collision"
```

---

## Self-review

**Spec coverage (§7.4 intentFollow, §12.1 controls, §6 Dog):**
- `Dog` entity (§6/§12) → Task 1 ✓
- `intentFollow` (move + sprint + brake) (§7.4) → Task 2 ✓
- `Game.update(dt, intent)` + dog integrated + dog-obstacle collision (§5.2, §10.2) → Task 3 ✓
- Validated end-to-end (drives by intent; can't cross an obstacle) → Task 3 ✓
- **Deliberately deferred:** stamina/sprint-gating, bark/scare/fear/flee, attractors/thirst, treats/Emitter/Pool/buffs, pen-fill/respawn, ambient scares, GameSignals, dog-vs-fence/one-way-gate, Selector/Conditional nodes, render layer.

**Placeholder scan:** none — every step has runnable code + a command with expected output.

**Type consistency:** `Dog extends Mobile` (with `prevPos` seeded so fence/CCD works once added); `DogIntent` reused from `types.ts`. `World` gains `dog: Dog | null` (default `null`) → existing `createWorld(...)` callers unaffected and dog branches skipped. `Game.update` gains an optional `intent` with a `NEUTRAL_INTENT` default → existing `update(dt)` callers keep working. The dog reuses `integrate` (single-entity) and `collisionSystem` (`Mobile[]`, so `[dog]` is valid). No `SteerContext` change → no ctx-literal ripple.

**Backward-compat:** every existing integration test uses a dog-less world and `update(1/60)` (no intent); all dog code is gated behind `if (dog)` / the neutral default, so the full suite stays green — verified by the full-suite step.

---

## Next plans

- **Plan 8 — Motor: stamina, bark, scare & fear:** stamina + sprint/bark gating; bark emits a stress source; `ScareSystem` (presence + bark + ambient); fear drive + flee behavior; `GameSignals` (`barked`, `ambientScare`).
- **Plan 9 — Motor: attractors, treats, buffs, respawn:** water/shade attractors + thirst + rest; treats + `Emitter` + `Pool` + `BuffSystem`; pen-fill detection → respawn flow; dog-vs-fence/gate; penned interior-seek + `Selector`/`Conditional` nodes.
- **Plan 10 — `@getback/game` + apps/examples:** atlas slicer/generator, render, HUD, input, Runner/mount, `apps/getback`, `examples/*`.
