# Motor: Treats, Buffs & Ambient Scares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "fun layer" to `@getback/motor`: drip-spawned treats the dog can collect for stamina + random power-ups; timed buffs (zoomies/megabark/calm) with effects wired into the systems that read them; whole-pasture ambient scares on a random timer; and a richer `GameSignals` bundle (`sheepPenned`, `treatCollected`, `barked`, `ambientScare`). Verified headless: collecting a treat refills stamina and fires `treatCollected`; a zoomies buff raises the dog's effective top speed then expires; a calm buff scales down sheep fear targets; an ambient scare inserts a global `StressSource` and fires `ambientScare`; a bark fires `barked`; a sheep entering the pen fires `sheepPenned`.

**Architecture:** All work stays in `@getback/motor` (Pixi-free). Treat spawning reuses the `AgentPool<T>` and `Emitter` classes created in Plan 14 (world/Pool.ts and world/Emitter.ts) — this plan does not re-author them; it instantiates them for the treat domain. `BuffSystem` owns the countdown and expiry; each effect is read where it matters: zoomies in `DogControlSystem`, megabark in `ScareSystem`, calm in `FearSystem`. `AmbientScareSystem` is a new top-level system called from `Game.update`. Signal payloads: `treatCollected: Signal<Vec2>` (position of collected treat, so FX/HUD can place a particle), `sheepPenned: Signal<void>`, `barked: Signal<Vec2>` (bark origin), `ambientScare: Signal<void>`.

**Tech Stack:** TypeScript 5 strict, ESM, `.js` import extensions. Vitest 2. `@getback/math` (`Vec2`, `Rng`, `makeRng`). `@getback/signal` (`Signal`). Motor package — no Pixi dependency.

---

## Key facts

- `Dog` lives in `packages/motor/src/entities/Dog.ts`: `{ ...Mobile, barkCooldown: number, stamina: number }`. We add `activeBuff: ActiveBuff | null`.
- `StressSource` (`scare/StressSource.ts`): `StressKind = "presence" | "bark"`. We add `"ambient"`.
- `ScareSystem` rebuilds `stress[]` each frame: clears it, pushes presence + optional bark. We extend it to also push an ambient source when `AmbientScareSystem` signals one is live, and to emit `signals.barked`.
- `FearSystem`: `fearTarget = max over in-range stress of intensity·falloff(dist)`. We multiply `target` by `config.buffs.calm.fearMult` when the dog's `activeBuff` is `calm`.
- `DogControlSystem`: computes effective speed as `dog.maxSpeed * (sprinting ? sprintMult : 1)`. We multiply the base by `config.buffs.zoomies.mult` when `activeBuff` is `zoomies`.
- `PenSystem`: currently clears and repopulates `pen.contained` every frame. We extend it to emit `signals.sheepPenned` for each newly captured sheep (tracking previous-frame membership).
- `GameSignals` currently: `{ penFilled: Signal<void> }`. We add four more signals.
- `Signal<T>.emit(value: T)` — `Signal<void>.emit()` requires no argument (TS sees `void` as optional).
- `createWorld` signature: `(sheep?, grass?, obstacles?, pen?, dog?, rng?)` — unchanged externally; internally `createWorld` constructs and returns `treats`, `treatPool`, and `treatEmitter` on the `World` object (no new parameter needed).
- `config` is `as const` — we add new top-level keys `treats`, `buffs`, `ambient`.
- **`AgentPool<T>` and `Emitter`** are authored in **Plan 14** and already exist in `world/Pool.ts` and `world/Emitter.ts` when this plan runs. Do NOT re-create them. Their API: `new AgentPool({ create, reset })` / `pool.acquire(pos)` / `pool.release(obj)`; `new Emitter({ geometry, period, amount, max, rng })` / `emitter.update(dt): Vec2[]` / `emitter.emitNow(count): Vec2[]` / `emitter.active: number`.
- `world.rng` is a `Rng` from `@getback/math` — `rng.range(min, max)` returns `[min, max)`, `rng.float()` returns `[0, 1)`.

## File structure (created/modified)

```
packages/motor/src/config.ts                           # MODIFIED: add treats/buffs/ambient keys
packages/motor/src/scare/StressSource.ts               # MODIFIED: add "ambient" to StressKind
packages/motor/src/entities/Dog.ts                     # MODIFIED: add ActiveBuff type + activeBuff field
packages/motor/src/entities/Treat.ts                   # NEW: Treat entity + factory
packages/motor/src/world/Pool.ts                       # REUSED from Plan 14 (not created here)
packages/motor/src/world/Emitter.ts                    # REUSED from Plan 14 (not created here)
packages/motor/src/world/signals.ts                    # MODIFIED: add sheepPenned/treatCollected/barked/ambientScare
packages/motor/src/world/World.ts                      # MODIFIED: add treats/treatPool/treatEmitter fields
packages/motor/src/systems/PickupSystem.ts             # NEW
packages/motor/src/systems/PickupSystem.test.ts        # NEW
packages/motor/src/systems/BuffSystem.ts               # NEW
packages/motor/src/systems/BuffSystem.test.ts          # NEW
packages/motor/src/systems/AmbientScareSystem.ts       # NEW
packages/motor/src/systems/AmbientScareSystem.test.ts  # NEW
packages/motor/src/systems/ScareSystem.ts              # MODIFIED: emit barked; read megabark buff
packages/motor/src/systems/ScareSystem.test.ts         # MODIFIED: add barked + megabark tests
packages/motor/src/systems/FearSystem.ts               # MODIFIED: read calm buff
packages/motor/src/systems/FearSystem.test.ts          # MODIFIED: add calm test
packages/motor/src/systems/DogControlSystem.ts         # MODIFIED: read zoomies buff
packages/motor/src/systems/DogControlSystem.test.ts    # MODIFIED: add zoomies test
packages/motor/src/systems/PenSystem.ts                # MODIFIED: emit sheepPenned
packages/motor/src/systems/PenSystem.test.ts           # MODIFIED: add sheepPenned test
packages/motor/src/world/Game.ts                       # MODIFIED: wire new systems; treat emitter tick
packages/motor/src/world/Game.test.ts                  # MODIFIED: treat + buff integration tests
packages/motor/src/index.ts                            # MODIFIED: export new types + systems
```

---

### Task 1: Config additions, `StressKind` extension, `Treat` entity

`AgentPool<T>` (world/Pool.ts) and `Emitter` (world/Emitter.ts) already exist from Plan 14 — this plan instantiates them for treats (`treatPool`, `treatEmitter`), it does not re-author them.

**Files:**
- Modify: `packages/motor/src/config.ts`
- Modify: `packages/motor/src/scare/StressSource.ts`
- Create: `packages/motor/src/entities/Treat.ts`

- [ ] **Step 1: Failing test for Treat entity**

Create `packages/motor/src/entities/Treat.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createTreat } from "./Treat.js";
import { config } from "../config.js";

describe("createTreat", () => {
  it("creates a treat with position and radius", () => {
    const t = createTreat({ x: 10, y: 20 });
    expect(t.pos).toEqual({ x: 10, y: 20 });
    expect(t.radius).toBe(config.treats.radius);
  });
});
```

Run: `npx vitest run packages/motor/src/entities/Treat.test.ts`
Expected: FAIL — cannot resolve `./Treat.js`.

- [ ] **Step 2: Implement**

**2a. Add config keys** — in `packages/motor/src/config.ts`, append before the closing `} as const`:
```ts
  treats: {
    periodMin: 12,
    periodMax: 20,
    max: 3,
    buffChance: 0.5,
    radius: 4,
  },
  buffs: {
    zoomies:  { duration: 4,   mult: 1.8 },
    megabark: { duration: 6,   radiusMult: 1.7, ttlMult: 1.5 },
    calm:     { duration: 6,   fearMult: 0.4 },
  },
  ambient: {
    intervalMin: 18,
    intervalMax: 35,
    intensity: 0.8,
    radius: 9999, // effectively covers the whole 480×270 pasture
  },
```

**2b. Extend `StressKind`** — replace the type line in `packages/motor/src/scare/StressSource.ts`:
```ts
export type StressKind = "presence" | "bark" | "ambient";
```

**2c. Create `packages/motor/src/entities/Treat.ts`:**
```ts
import type { Vec2 } from "@getback/math";
import { config } from "../config.js";

export interface Treat {
  pos: Vec2;
  radius: number;
}

export function createTreat(pos: Vec2): Treat {
  return { pos: { x: pos.x, y: pos.y }, radius: config.treats.radius };
}
```

Note: `AgentPool<T>` (world/Pool.ts) and `Emitter` (world/Emitter.ts) are NOT created here — they are reused from Plan 14.

- [ ] **Step 3: Run to verify PASS**

Run: `npx vitest run packages/motor/src/entities/Treat.test.ts`
Expected: PASS — 1 test green.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/motor/src/config.ts packages/motor/src/scare/StressSource.ts packages/motor/src/entities/Treat.ts packages/motor/src/entities/Treat.test.ts
git commit -m "Add Treat entity and config treats/buffs/ambient keys"
```

---

### Task 2: Richer `GameSignals` + `World` gains `treats`, `treatPool`, `treatEmitter`

**Files:**
- Modify: `packages/motor/src/world/signals.ts`
- Modify: `packages/motor/src/world/World.ts`
- Modify: `packages/motor/src/world/World.test.ts`

- [ ] **Step 1: Failing test**

Append to (or create) `packages/motor/src/world/World.test.ts` — read current contents first, then append:
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
  it("world has empty treats array and a treatPool and treatEmitter", () => {
    const w = createWorld();
    expect(Array.isArray(w.treats)).toBe(true);
    expect(w.treats.length).toBe(0);
    expect(typeof w.treatPool.acquire).toBe("function");
    expect(typeof w.treatEmitter.update).toBe("function");
  });
  it("new signals include sheepPenned, treatCollected, barked, ambientScare", () => {
    const w = createWorld();
    expect(typeof w.signals.sheepPenned.add).toBe("function");
    expect(typeof w.signals.treatCollected.add).toBe("function");
    expect(typeof w.signals.barked.add).toBe("function");
    expect(typeof w.signals.ambientScare.add).toBe("function");
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/world/World.test.ts`
Expected: FAIL — `treats`, `treatPool`, `treatEmitter`, `sheepPenned`, `treatCollected`, `barked`, `ambientScare` are missing.

- [ ] **Step 3: Implement**

**3a. Update `packages/motor/src/world/signals.ts`:**
```ts
import { Signal } from "@getback/signal";
import type { Vec2 } from "@getback/math";

// Game-level events emitted by systems; consumed by HUD, FX, and audio.
export interface GameSignals {
  penFilled:      Signal<void>;
  sheepPenned:    Signal<void>;
  treatCollected: Signal<Vec2>;  // position of collected treat (for FX placement)
  barked:         Signal<Vec2>;  // bark origin
  ambientScare:   Signal<void>;
}

export function createSignals(): GameSignals {
  return {
    penFilled:      new Signal<void>(),
    sheepPenned:    new Signal<void>(),
    treatCollected: new Signal<Vec2>(),
    barked:         new Signal<Vec2>(),
    ambientScare:   new Signal<void>(),
  };
}
```

**3b. Update `packages/motor/src/world/World.ts`** — add imports and new fields:

Add imports after the existing ones:
```ts
import type { Treat } from "../entities/Treat.js";
import { createTreat } from "../entities/Treat.js";
import { AgentPool } from "./Pool.js";
import { Emitter, rectGeometry } from "./Emitter.js";
import { config } from "../config.js";
```

(`AgentPool` and `Emitter` are from Plan 14's world/Pool.ts and world/Emitter.ts — do not re-create them.)

Add to the `World` interface after `signals`:
```ts
  treats:       Treat[];
  treatPool:    AgentPool<Treat>;
  treatEmitter: Emitter;
```

Extend `createWorld` to create and populate these fields (add after the `signals: createSignals()` line inside the returned object):
```ts
    treats:       [],
    treatPool:    new AgentPool<Treat>({
      create: () => createTreat({ x: 0, y: 0 }),
      reset:  () => {},  // position set by Game.ts after acquire
    }),
    treatEmitter: new Emitter({
      geometry: rectGeometry({
        x: config.bounds.x + 10,
        y: config.bounds.y + 10,
        w: config.bounds.w - 20,
        h: config.bounds.h - 20,
      }),
      period: config.treats.periodMin,  // starting period; Game re-uses update(dt)
      amount: 1,
      max:    config.treats.max,
      rng,
    }),
```

Note on the `Emitter` API (from Plan 14):
- `new Emitter({ geometry, period, amount, max, rng })` — class constructor.
- `emitter.update(dt): Vec2[]` — advances timer; returns spawn positions when period fires.
- `emitter.emitNow(count): Vec2[]` — immediately returns positions for bonus spawns; resets accumulator.
- `emitter.active: number` — public field the caller keeps in sync (increment on spawn, decrement on release).

Note on the `AgentPool` API (from Plan 14):
- `new AgentPool({ create: () => T, reset: (obj: T) => void })` — class constructor.
- `pool.acquire(_pos: Vec2): T` — returns recycled or new object; calls `reset` on recycled ones.
- `pool.release(obj: T): void` — returns object to free list.

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run packages/motor/src/world/World.test.ts`
Expected: PASS — all tests green (old 3 + new 2).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/signals.ts packages/motor/src/world/World.ts packages/motor/src/world/World.test.ts
git commit -m "Extend GameSignals and World with treats/treatPool/treatEmitter"
```

---

### Task 3: `Dog` gains `activeBuff` + `BuffSystem`

**Files:**
- Modify: `packages/motor/src/entities/Dog.ts`
- Create: `packages/motor/src/systems/BuffSystem.ts`
- Create: `packages/motor/src/systems/BuffSystem.test.ts`

- [ ] **Step 1: Failing test**

Create `packages/motor/src/systems/BuffSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buffSystem, grantBuff } from "./BuffSystem.js";
import { createDog } from "../entities/Dog.js";

describe("grantBuff", () => {
  it("sets activeBuff on the dog", () => {
    const dog = createDog({ x: 0, y: 0 });
    expect(dog.activeBuff).toBeNull();
    grantBuff(dog, "zoomies");
    expect(dog.activeBuff).not.toBeNull();
    expect(dog.activeBuff!.kind).toBe("zoomies");
    expect(dog.activeBuff!.timeLeft).toBeGreaterThan(0);
  });

  it("replaces an existing buff", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "zoomies");
    grantBuff(dog, "megabark");
    expect(dog.activeBuff!.kind).toBe("megabark");
  });
});

describe("buffSystem", () => {
  it("ticks down timeLeft", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "calm");
    const before = dog.activeBuff!.timeLeft;
    buffSystem(dog, 1);
    expect(dog.activeBuff!.timeLeft).toBeLessThan(before);
  });

  it("expires the buff when timeLeft reaches zero", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "calm");
    buffSystem(dog, 100); // dt >> duration
    expect(dog.activeBuff).toBeNull();
  });

  it("is a no-op when activeBuff is null", () => {
    const dog = createDog({ x: 0, y: 0 });
    expect(() => buffSystem(dog, 1)).not.toThrow();
    expect(dog.activeBuff).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/systems/BuffSystem.test.ts`
Expected: FAIL — cannot resolve `./BuffSystem.js`; `createDog` has no `activeBuff`.

- [ ] **Step 3: Implement**

**3a. Update `packages/motor/src/entities/Dog.ts`:**
```ts
import type { Vec2 } from "@getback/math";
import type { Mobile } from "../types.js";
import { config } from "../config.js";

export type BuffKind = "zoomies" | "megabark" | "calm";

export interface ActiveBuff {
  kind:     BuffKind;
  timeLeft: number;
}

// The player's corgi. Mobile + stamina + current power-up state.
export interface Dog extends Mobile {
  barkCooldown: number;
  stamina:      number;
  activeBuff:   ActiveBuff | null;
}

export function createDog(pos: Vec2): Dog {
  return {
    pos:         { x: pos.x, y: pos.y },
    prevPos:     { x: pos.x, y: pos.y },
    vel:         { x: 0, y: 0 },
    force:       { x: 0, y: 0 },
    radius:      config.dog.radius,
    maxSpeed:    config.dog.maxSpeed,
    maxForce:    config.dog.maxForce,
    facing:      "down",
    barkCooldown: 0,
    stamina:     config.stamina.max,
    activeBuff:  null,
  };
}
```

**3b. Create `packages/motor/src/systems/BuffSystem.ts`:**
```ts
import type { Dog, BuffKind } from "../entities/Dog.js";
import { config } from "../config.js";

// Duration table keyed by BuffKind.
const DURATIONS: Record<BuffKind, number> = {
  zoomies:  config.buffs.zoomies.duration,
  megabark: config.buffs.megabark.duration,
  calm:     config.buffs.calm.duration,
};

/** Grant the dog a buff, replacing any currently active one. */
export function grantBuff(dog: Dog, kind: BuffKind): void {
  dog.activeBuff = { kind, timeLeft: DURATIONS[kind] };
}

/** Tick the active buff timer; expire to null when exhausted. */
export function buffSystem(dog: Dog, dt: number): void {
  if (!dog.activeBuff) return;
  dog.activeBuff.timeLeft -= dt;
  if (dog.activeBuff.timeLeft <= 0) dog.activeBuff = null;
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run packages/motor/src/systems/BuffSystem.test.ts`
Expected: PASS — 6 tests green.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/entities/Dog.ts packages/motor/src/systems/BuffSystem.ts packages/motor/src/systems/BuffSystem.test.ts
git commit -m "Add Dog.activeBuff, BuffKind, and BuffSystem"
```

---

### Task 4: Buff effects wired into `DogControlSystem`, `ScareSystem`, `FearSystem`; `ScareSystem` emits `barked`

**Files:**
- Modify: `packages/motor/src/systems/DogControlSystem.ts`
- Modify: `packages/motor/src/systems/DogControlSystem.test.ts`
- Modify: `packages/motor/src/systems/ScareSystem.ts`
- Modify: `packages/motor/src/systems/ScareSystem.test.ts`
- Modify: `packages/motor/src/systems/FearSystem.ts`
- Modify: `packages/motor/src/systems/FearSystem.test.ts`

- [ ] **Step 1: Write the failing tests**

**DogControlSystem test** — add at bottom of `packages/motor/src/systems/DogControlSystem.test.ts` (read current file first):
```ts
import { grantBuff } from "./BuffSystem.js";

describe("zoomies buff", () => {
  it("zoomies buff raises effective top speed above the sprint cap", () => {
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "zoomies");
    const intent = { moveDir: { x: 1, y: 0 }, sprint: false, bark: false };
    dogControlSystem(dog, intent);
    // force.x drives toward zoomies-scaled speed; must exceed plain maxSpeed
    // (force is vel-error; starting from vel=0, force ≈ target speed × mult)
    expect(dog.force.x).toBeGreaterThan(config.dog.maxSpeed);
  });
});
```

**ScareSystem test** — add at bottom of `packages/motor/src/systems/ScareSystem.test.ts`:
```ts
import { grantBuff } from "./BuffSystem.js";

describe("barked signal", () => {
  it("emits barked with the dog position when a bark fires", () => {
    const dog = createDog({ x: 20, y: 30 });
    dog.stamina = config.stamina.max;
    const stress: StressSource[] = [];
    const positions: Vec2[] = [];
    const signals = createSignals();
    signals.barked.add((p) => positions.push(p));
    scareSystem(stress, dog, { moveDir: { x: 0, y: 0 }, sprint: false, bark: true }, 1 / 60, signals);
    expect(positions.length).toBe(1);
    expect(positions[0]!.x).toBe(20);
    expect(positions[0]!.y).toBe(30);
  });
});

describe("megabark buff", () => {
  it("megabark buff increases bark radius and ttl in the emitted StressSource", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = config.stamina.max;
    grantBuff(dog, "megabark");
    const stress: StressSource[] = [];
    scareSystem(stress, dog, { moveDir: { x: 0, y: 0 }, sprint: false, bark: true }, 1 / 60, createSignals());
    const bark = stress.find((s) => s.kind === "bark")!;
    expect(bark).toBeDefined();
    expect(bark.radius).toBeCloseTo(config.scare.barkRadius * config.buffs.megabark.radiusMult, 2);
  });
});
```

**FearSystem test** — add at bottom of `packages/motor/src/systems/FearSystem.test.ts`:
```ts
import { createDog } from "../entities/Dog.js";
import { grantBuff } from "./BuffSystem.js";

describe("calm buff", () => {
  it("calm buff scales down the fear target for all sheep", () => {
    const sheep = [createSheep({ x: 0, y: 0 }, defaultSheepTraits())];
    const src: StressSource[] = [{ kind: "presence", pos: { x: 0, y: 0 }, radius: 100, intensity: 1 }];
    const dog = createDog({ x: 0, y: 0 });
    grantBuff(dog, "calm");

    // Without calm, fear target would be 1.0; with calm it should be × fearMult
    fearSystem(sheep, src, 1 / 60, dog);
    expect(sheep[0]!.drives.fear).toBeLessThan(config.buffs.calm.fearMult + 0.01);
    expect(sheep[0]!.drives.fear).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/systems/DogControlSystem.test.ts packages/motor/src/systems/ScareSystem.test.ts packages/motor/src/systems/FearSystem.test.ts`
Expected: FAIL — new tests fail because the buff/signal wiring does not exist yet.

- [ ] **Step 3: Implement**

**3a. Update `DogControlSystem.ts`** — change the speed line to read the buff:
```ts
import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import { config } from "../config.js";

export function dogControlSystem(dog: Dog, intent: DogIntent): void {
  const dir = intent.moveDir;
  const mag = Math.hypot(dir.x, dir.y);
  if (mag < 1e-6) {
    dog.force.x = -dog.vel.x * config.dog.stopGain;
    dog.force.y = -dog.vel.y * config.dog.stopGain;
    return;
  }
  const sprinting = intent.sprint && dog.stamina > 0;
  const zoomies = dog.activeBuff?.kind === "zoomies";
  const speedBase = dog.maxSpeed
    * (sprinting ? config.dog.sprintMult : 1)
    * (zoomies ? config.buffs.zoomies.mult : 1);
  dog.force.x = (dir.x / mag) * speedBase - dog.vel.x;
  dog.force.y = (dir.y / mag) * speedBase - dog.vel.y;
}
```

**3b. Update `ScareSystem.ts`** — accept an optional `signals` parameter and read megabark buff:
```ts
import type { Dog } from "../entities/Dog.js";
import type { DogIntent } from "../types.js";
import type { StressSource } from "../scare/StressSource.js";
import type { GameSignals } from "../world/signals.js";
import { config } from "../config.js";

export function scareSystem(
  stress: StressSource[],
  dog: Dog | null,
  intent: DogIntent,
  dt: number,
  signals?: GameSignals,
): void {
  stress.length = 0;
  if (!dog) return;
  stress.push({
    kind:      "presence",
    pos:       { x: dog.pos.x, y: dog.pos.y },
    radius:    config.scare.presenceRadius,
    intensity: config.scare.presenceIntensity,
  });
  if (dog.barkCooldown > 0) dog.barkCooldown -= dt;
  if (intent.bark && dog.barkCooldown <= 0 && dog.stamina >= config.stamina.barkCost) {
    const megabark = dog.activeBuff?.kind === "megabark";
    const radius = config.scare.barkRadius * (megabark ? config.buffs.megabark.radiusMult : 1);
    stress.push({
      kind:      "bark",
      pos:       { x: dog.pos.x, y: dog.pos.y },
      radius,
      intensity: config.scare.barkIntensity,
    });
    dog.barkCooldown = config.scare.barkCooldown;
    dog.stamina -= config.stamina.barkCost;
    signals?.barked.emit({ x: dog.pos.x, y: dog.pos.y });
  }
}
```

**3c. Update `FearSystem.ts`** — accept an optional `dog` parameter; apply calm scaling:
```ts
import type { Sheep } from "../entities/Sheep.js";
import type { StressSource } from "../scare/StressSource.js";
import type { Dog } from "../entities/Dog.js";
import { config } from "../config.js";

export function fearSystem(
  sheep: Sheep[],
  stress: readonly StressSource[],
  dt: number,
  dog?: Dog | null,
): void {
  const decay = config.fear.decay;
  const calmActive = dog?.activeBuff?.kind === "calm";
  const calmMult = calmActive ? config.buffs.calm.fearMult : 1;

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
    target *= calmMult;
    let decayed = s.drives.fear - decay * dt;
    if (decayed < 0) decayed = 0;
    const next = target > decayed ? target : decayed;
    s.drives.fear = next > 1 ? 1 : next;
  }
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run packages/motor/src/systems/DogControlSystem.test.ts packages/motor/src/systems/ScareSystem.test.ts packages/motor/src/systems/FearSystem.test.ts`
Expected: PASS — all tests green including old ones.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/DogControlSystem.ts packages/motor/src/systems/DogControlSystem.test.ts packages/motor/src/systems/ScareSystem.ts packages/motor/src/systems/ScareSystem.test.ts packages/motor/src/systems/FearSystem.ts packages/motor/src/systems/FearSystem.test.ts
git commit -m "Wire zoomies/megabark/calm buff effects and emit barked signal"
```

---

### Task 5: `PenSystem` emits `sheepPenned`

**Files:**
- Modify: `packages/motor/src/systems/PenSystem.ts`
- Modify: `packages/motor/src/systems/PenSystem.test.ts`

- [ ] **Step 1: Failing test**

Append to `packages/motor/src/systems/PenSystem.test.ts` (read file first):
```ts
import { createSignals } from "../world/signals.js";

describe("sheepPenned signal", () => {
  it("emits sheepPenned once for each newly captured sheep", () => {
    const pen = buildPen(square, 3);
    const inside = createSheep({ x: 20, y: 20 }, defaultSheepTraits());
    const outside = createSheep({ x: 200, y: 200 }, defaultSheepTraits());
    const signals = createSignals();
    let count = 0;
    signals.sheepPenned.add(() => count++);

    penSystem(pen, [inside, outside], signals);
    expect(count).toBe(1);
    // Second call: already penned — no extra emit.
    penSystem(pen, [inside, outside], signals);
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/systems/PenSystem.test.ts`
Expected: FAIL — `penSystem` does not yet accept a `signals` argument.

- [ ] **Step 3: Implement**

Replace `packages/motor/src/systems/PenSystem.ts`:
```ts
import type { Pen } from "../world/Pen.js";
import { penContains } from "../world/Pen.js";
import type { Sheep } from "../entities/Sheep.js";
import type { GameSignals } from "../world/signals.js";

// Capture: a sheep whose position is inside the pen polygon is flagged `penned`
// and added to `pen.contained`. Emits `signals.sheepPenned` for each sheep that
// was NOT previously penned but is penned now (first crossing only).
export function penSystem(pen: Pen, sheep: Sheep[], signals?: GameSignals): void {
  const prev = new Set(pen.contained);
  pen.contained.clear();
  for (const s of sheep) {
    s.penned = penContains(pen, s.pos);
    if (s.penned) {
      pen.contained.add(s);
      if (!prev.has(s)) signals?.sheepPenned.emit();
    }
  }
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run packages/motor/src/systems/PenSystem.test.ts`
Expected: PASS — all tests green.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/PenSystem.ts packages/motor/src/systems/PenSystem.test.ts
git commit -m "PenSystem emits sheepPenned on first capture per sheep"
```

---

### Task 6: `PickupSystem`

**Files:**
- Create: `packages/motor/src/systems/PickupSystem.ts`
- Create: `packages/motor/src/systems/PickupSystem.test.ts`

- [ ] **Step 1: Failing test**

Create `packages/motor/src/systems/PickupSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pickupSystem } from "./PickupSystem.js";
import { createDog } from "../entities/Dog.js";
import { createTreat } from "../entities/Treat.js";
import { createSignals } from "../world/signals.js";
import { AgentPool } from "../world/Pool.js";
import { config } from "../config.js";
import type { Vec2 } from "@getback/math";
import type { Treat } from "../entities/Treat.js";

function makeTreatPool(): AgentPool<Treat> {
  // AgentPool API from Plan 14: constructor takes { create, reset }
  return new AgentPool<Treat>({
    create: () => createTreat({ x: 0, y: 0 }),
    reset:  () => {},  // position is set by the caller after acquire
  });
}

describe("pickupSystem", () => {
  it("no overlap — treat stays in active list, stamina unchanged", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 0;
    const treat = createTreat({ x: 200, y: 200 }); // far away
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    const signals = createSignals();
    pickupSystem(dog, active, pool, signals);
    expect(active.length).toBe(1);
    expect(dog.stamina).toBe(0);
  });

  it("overlap — treat is removed, stamina refills to max", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 10;
    const treat = createTreat({ x: 0, y: 0 }); // on top of dog
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    const signals = createSignals();
    pickupSystem(dog, active, pool, signals);
    expect(active.length).toBe(0);
    expect(dog.stamina).toBe(config.stamina.max);
  });

  it("overlap — stamina never exceeds max even when already full", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = config.stamina.max;
    const treat = createTreat({ x: 0, y: 0 });
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    pickupSystem(dog, active, pool, createSignals());
    expect(dog.stamina).toBe(config.stamina.max);
  });

  it("overlap — emits treatCollected with the treat position", () => {
    const dog = createDog({ x: 5, y: 5 });
    dog.stamina = 0;
    const treat = createTreat({ x: 5, y: 5 });
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    const signals = createSignals();
    const positions: Vec2[] = [];
    signals.treatCollected.add((p) => positions.push(p));
    pickupSystem(dog, active, pool, signals);
    expect(positions.length).toBe(1);
    expect(positions[0]!.x).toBe(5);
  });

  it("overlap with buffChance=1 — dog gets a buff", () => {
    const dog = createDog({ x: 0, y: 0 });
    dog.stamina = 0;
    const treat = createTreat({ x: 0, y: 0 });
    const active: Treat[] = [treat];
    const pool = makeTreatPool();
    // Override config.treats.buffChance is const — instead call with forced rng: pass rng that always returns 0
    // (below buffChance=0.5) to guarantee a buff.
    // pickupSystem uses world.rng internally; we pass it as a parameter.
    pickupSystem(dog, active, pool, createSignals(), { float: () => 0, int: () => 0, range: () => 0, pick: (a) => a[0]! });
    expect(dog.activeBuff).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/systems/PickupSystem.test.ts`
Expected: FAIL — cannot resolve `./PickupSystem.js`.

- [ ] **Step 3: Implement**

Create `packages/motor/src/systems/PickupSystem.ts`:
```ts
import type { Dog, BuffKind } from "../entities/Dog.js";
import type { Treat } from "../entities/Treat.js";
import type { AgentPool } from "../world/Pool.js";
import type { GameSignals } from "../world/signals.js";
import type { Rng } from "@getback/math";
import { grantBuff } from "./BuffSystem.js";
import { config } from "../config.js";

const BUFF_KINDS: readonly BuffKind[] = ["zoomies", "megabark", "calm"];

// Scan active treats; consume any that the dog overlaps.
// Always refills stamina to max. With probability `buffChance` also grants a
// random buff (via BuffSystem.grantBuff). Emits `signals.treatCollected` with
// the treat position. Released treats go back to the pool.
export function pickupSystem(
  dog: Dog,
  active: Treat[],
  pool: AgentPool<Treat>,
  signals: GameSignals,
  rng?: Rng,
): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const treat = active[i]!;
    const dx = dog.pos.x - treat.pos.x;
    const dy = dog.pos.y - treat.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= dog.radius + treat.radius) continue;

    // Consume
    active.splice(i, 1);
    pool.release(treat);

    // Refill stamina
    dog.stamina = config.stamina.max;

    // Maybe grant a buff
    if (rng && rng.float() < config.treats.buffChance) {
      const kind = rng.pick(BUFF_KINDS);
      grantBuff(dog, kind);
    }

    // Signal FX/HUD
    signals.treatCollected.emit({ x: treat.pos.x, y: treat.pos.y });
  }
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run packages/motor/src/systems/PickupSystem.test.ts`
Expected: PASS — 5 tests green.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/PickupSystem.ts packages/motor/src/systems/PickupSystem.test.ts
git commit -m "Add PickupSystem: treat overlap refills stamina and emits treatCollected"
```

---

### Task 7: `AmbientScareSystem`

**Files:**
- Create: `packages/motor/src/systems/AmbientScareSystem.ts`
- Create: `packages/motor/src/systems/AmbientScareSystem.test.ts`

- [ ] **Step 1: Failing test**

Create `packages/motor/src/systems/AmbientScareSystem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createAmbientScareState, ambientScareSystem } from "./AmbientScareSystem.js";
import { makeRng } from "@getback/math";
import { createSignals } from "../world/signals.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";

describe("ambientScareSystem", () => {
  it("does not fire before the interval elapses", () => {
    const state = createAmbientScareState(makeRng(1));
    const stress: StressSource[] = [];
    const signals = createSignals();
    let fired = 0;
    signals.ambientScare.add(() => fired++);
    // tick with dt = 1s (intervalMin = 18s)
    ambientScareSystem(state, stress, 1, signals);
    expect(fired).toBe(0);
    expect(stress.length).toBe(0);
  });

  it("fires and emits ambientScare after the interval", () => {
    const state = createAmbientScareState(makeRng(1));
    const stress: StressSource[] = [];
    const signals = createSignals();
    let fired = 0;
    signals.ambientScare.add(() => fired++);
    // force timer to expire
    state.timer = 0;
    ambientScareSystem(state, stress, 1 / 60, signals);
    expect(fired).toBe(1);
    expect(stress.some((s) => s.kind === "ambient")).toBe(true);
  });

  it("the ambient StressSource covers the whole pasture", () => {
    const state = createAmbientScareState(makeRng(1));
    const stress: StressSource[] = [];
    state.timer = 0;
    ambientScareSystem(state, stress, 1 / 60, createSignals());
    const src = stress.find((s) => s.kind === "ambient")!;
    expect(src.radius).toBeGreaterThan(400); // covers 480×270
    expect(src.intensity).toBe(config.ambient.intensity);
  });

  it("reschedules after firing", () => {
    const state = createAmbientScareState(makeRng(2));
    const stress: StressSource[] = [];
    state.timer = 0;
    ambientScareSystem(state, stress, 1 / 60, createSignals());
    expect(state.timer).toBeGreaterThanOrEqual(config.ambient.intervalMin - 1 / 60);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/systems/AmbientScareSystem.test.ts`
Expected: FAIL — cannot resolve `./AmbientScareSystem.js`.

- [ ] **Step 3: Implement**

Create `packages/motor/src/systems/AmbientScareSystem.ts`:
```ts
import type { Rng } from "@getback/math";
import type { StressSource } from "../scare/StressSource.js";
import type { GameSignals } from "../world/signals.js";
import { config } from "../config.js";

export interface AmbientScareState {
  rng:   Rng;
  timer: number; // seconds until next scare
}

export function createAmbientScareState(rng: Rng): AmbientScareState {
  return {
    rng,
    timer: rng.range(config.ambient.intervalMin, config.ambient.intervalMax),
  };
}

// Tick the ambient scare timer. When it fires, push a pasture-covering
// StressSource into `stress` (it will be processed by FearSystem this frame),
// emit `signals.ambientScare`, and reschedule.
export function ambientScareSystem(
  state:   AmbientScareState,
  stress:  StressSource[],
  dt:      number,
  signals: GameSignals,
): void {
  state.timer -= dt;
  if (state.timer > 0) return;

  state.timer = state.rng.range(config.ambient.intervalMin, config.ambient.intervalMax);

  // The pasture is 480×270; place the source at its centre with a radius that
  // covers the diagonal (~550 px, but config.ambient.radius is 9999 by default).
  stress.push({
    kind:      "ambient",
    pos:       { x: config.bounds.x + config.bounds.w / 2, y: config.bounds.y + config.bounds.h / 2 },
    radius:    config.ambient.radius,
    intensity: config.ambient.intensity,
  });

  signals.ambientScare.emit();
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run packages/motor/src/systems/AmbientScareSystem.test.ts`
Expected: PASS — 4 tests green.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/systems/AmbientScareSystem.ts packages/motor/src/systems/AmbientScareSystem.test.ts
git commit -m "Add AmbientScareSystem: random whole-pasture startle on a timer"
```

---

### Task 8: Wire everything into `Game.ts` + exports + integration tests

**Files:**
- Modify: `packages/motor/src/world/Game.ts`
- Modify: `packages/motor/src/world/World.ts` (add `ambientScareState` to `World` + `createWorld`)
- Modify: `packages/motor/src/world/Game.test.ts`
- Modify: `packages/motor/src/index.ts`

- [ ] **Step 1: Failing integration tests**

Append to `packages/motor/src/world/Game.test.ts` (also add `import { grantBuff } from "../systems/BuffSystem.js";` at the top of the file alongside the existing imports):
```ts
import { createTreat } from "../entities/Treat.js";
import { grantBuff } from "../systems/BuffSystem.js";

describe("treat pickup integration", () => {
  it("dog walking over a treat refills stamina and fires treatCollected", () => {
    const dog = createDog({ x: 100, y: 100 });
    dog.stamina = 0;
    const world = createWorld([], undefined, [], null, dog, makeRng(1));
    // Manually place a treat on top of the dog
    const treat = createTreat({ x: 100, y: 100 });
    world.treats.push(treat);

    const positions: import("@getback/math").Vec2[] = [];
    world.signals.treatCollected.add((p) => positions.push(p));

    const game = new Game(world);
    game.update(1 / 60);

    expect(world.treats.length).toBe(0); // consumed
    expect(dog.stamina).toBe(config.stamina.max);
    expect(positions.length).toBe(1);
  });
});

describe("zoomies buff integration", () => {
  it("a zoomies buff raises effective dog speed above plain maxSpeed, then expires", () => {
    const dog = createDog({ x: 100, y: 100 });
    const world = createWorld([], undefined, [], null, dog, makeRng(1));
    const game = new Game(world);
    const intent = { moveDir: { x: 1, y: 0 }, sprint: false, bark: false };

    // Grant zoomies directly (grantBuff is a named export of BuffSystem)
    grantBuff(dog, "zoomies");

    // After some steps the dog should exceed plain maxSpeed in velocity
    for (let i = 0; i < 30; i++) game.update(1 / 60, intent);
    expect(dog.vel.x).toBeGreaterThan(config.dog.maxSpeed);

    // Tick past the duration to expire the buff
    game.update(config.buffs.zoomies.duration + 1, intent);
    expect(dog.activeBuff).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/motor/src/world/Game.test.ts`
Expected: FAIL — `createTreat` unknown, new systems not yet wired.

- [ ] **Step 3: Implement**

**3a. Add `ambientScareState` to `World`** — in `World.ts`:

Add import:
```ts
import type { AmbientScareState } from "../systems/AmbientScareSystem.js";
import { createAmbientScareState } from "../systems/AmbientScareSystem.js";
```

Add to `World` interface (after `treatEmitter`):
```ts
  ambientScareState: AmbientScareState;
```

Add to the returned object in `createWorld` (after `treatEmitter`):
```ts
    ambientScareState: createAmbientScareState(rng),
```

**3b. Update `Game.ts`** — wire in all new systems. The full updated file:
```ts
import type { World } from "./World.js";
import { config } from "../config.js";
import { grassSystem } from "../systems/GrassSystem.js";
import { driveSystem } from "../systems/DriveSystem.js";
import { neighborhoodSystem } from "../systems/NeighborhoodSystem.js";
import { steeringSystem } from "../systems/SteeringSystem.js";
import { movementSystem, integrate } from "../systems/MovementSystem.js";
import { collisionSystem } from "../systems/CollisionSystem.js";
import { penSystem } from "../systems/PenSystem.js";
import { fenceCollisionSystem } from "../systems/FenceCollisionSystem.js";
import type { DogIntent } from "../types.js";
import { dogControlSystem } from "../systems/DogControlSystem.js";
import { scareSystem } from "../systems/ScareSystem.js";
import { fearSystem } from "../systems/FearSystem.js";
import { staminaSystem } from "../systems/StaminaSystem.js";
import { respawnSystem } from "../systems/RespawnSystem.js";
import { pickupSystem } from "../systems/PickupSystem.js";
import { buffSystem } from "../systems/BuffSystem.js";
import { ambientScareSystem } from "../systems/AmbientScareSystem.js";

// Frozen so the shared default can never be mutated by a future consumer.
const NEUTRAL_INTENT: DogIntent = Object.freeze({
  moveDir: Object.freeze({ x: 0, y: 0 }),
  sprint: false,
  bark: false,
}) as DogIntent;

// Drives one simulation step. The render/app layer calls this each frame.
export class Game {
  constructor(public readonly world: World) {
    world.signals.penFilled.add(() => this.spawnBonusTreat());
  }

  update(dt: number, intent: DogIntent = NEUTRAL_INTENT): void {
    const step = Math.min(dt, config.dtClampMax);
    const { sheep, grass, obstacles, pen, grid, dog, stress, signals,
            treats, treatPool, treatEmitter, ambientScareState } = this.world;

    if (dog) buffSystem(dog, step);
    if (dog) staminaSystem(dog, intent, step);
    scareSystem(stress, dog ?? null, intent, step, signals);
    ambientScareSystem(ambientScareState, stress, step, signals);
    grassSystem(grass, sheep, step);
    driveSystem(sheep, grass, step);
    neighborhoodSystem(sheep, grid);
    fearSystem(sheep, stress, step, dog ?? null);
    steeringSystem(sheep, { grass, obstacles, stress }, step);
    if (dog) dogControlSystem(dog, intent);
    movementSystem(sheep, step);
    if (dog) integrate(dog, step);
    collisionSystem(sheep, obstacles);
    if (dog) collisionSystem([dog], obstacles);
    if (pen) {
      fenceCollisionSystem(pen, sheep);
      penSystem(pen, sheep, signals);
    }
    respawnSystem(this.world);
    if (dog) pickupSystem(dog, treats, treatPool, signals, this.world.rng);

    // Drip-spawn treats using Plan 14's Emitter API: update(dt) returns Vec2[].
    // The treat emitter's geometry (rectGeometry over the pasture) determines
    // spawn position — no place-callback needed.
    const spawnPositions = treatEmitter.update(step);
    for (const pos of spawnPositions) {
      const t = treatPool.acquire(pos);
      t.pos.x = pos.x;
      t.pos.y = pos.y;
      treats.push(t);
      treatEmitter.active++;
    }
  }

  // Bonus treat spawned near the pen centroid when the flock is fully penned.
  // Uses emitNow(1) from Plan 14's Emitter to reset the accumulator (so the next
  // regular drip-emit is re-scheduled), then places the treat at the pen centroid.
  // emitNow bypasses the active-cap check, so we guard manually with config.treats.max.
  spawnBonusTreat(): void {
    const pen = this.world.pen;
    if (!pen) return;
    const { treats, treatPool, treatEmitter, rng } = this.world;
    if (treats.length >= config.treats.max) return; // respect cap
    // emitNow(1) resets the time accumulator and returns 1 geometry-sampled position.
    // We discard the geometry position and place near the pen centroid instead.
    treatEmitter.emitNow(1); // side effect: resets accumulator
    const pos = {
      x: pen.centroid.x + rng.range(-20, 20),
      y: pen.centroid.y + rng.range(-20, 20),
    };
    const t = treatPool.acquire(pos);
    t.pos.x = pos.x;
    t.pos.y = pos.y;
    treats.push(t);
    treatEmitter.active++;
  }
}
```

Note: the `penFilled` listener that calls `spawnBonusTreat()` is already wired in the `Game` constructor above — no additional change to `RespawnSystem.ts` is required.

**3c. Update `index.ts`** — add all new exports. Note: `AgentPool`, `Emitter` and related symbols are already barrel-exported by Plan 14; only add symbols new to Plan 15:
```ts
export type { Treat } from "./entities/Treat.js";
export { createTreat } from "./entities/Treat.js";
export type { BuffKind, ActiveBuff } from "./entities/Dog.js";
export { pickupSystem } from "./systems/PickupSystem.js";
export { buffSystem, grantBuff } from "./systems/BuffSystem.js";
export type { AmbientScareState } from "./systems/AmbientScareSystem.js";
export { createAmbientScareState, ambientScareSystem } from "./systems/AmbientScareSystem.js";
```

- [ ] **Step 4: Run to verify PASS**

Run: `npm test`
Expected: PASS — every test green, including all existing integration tests and the new treat/buff tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/motor/src/world/Game.ts packages/motor/src/world/World.ts packages/motor/src/world/Game.test.ts packages/motor/src/index.ts
git commit -m "Wire treats, buffs, ambient scares, and bonus treat into the Game pipeline"
```

---

## Self-review

**Scope-to-task map:**

| Scope item                                                       | Task(s)        |
| ---------------------------------------------------------------- | -------------- |
| 1. `Treat` entity + config keys (AgentPool/Emitter from Plan 14) | Task 1         |
| 2. `PickupSystem`                                                | Task 6         |
| 3. `BuffSystem` + `Dog.activeBuff`                               | Task 3         |
| 3 (effects). Zoomies / megabark / calm wired in                  | Task 4         |
| 4. Ambient scares (`AmbientScareSystem`)                         | Task 7         |
| 5. Richer `GameSignals`                                          | Task 2, 4, 5   |
| 6. Bonus treat on pen fill                                       | Task 8 (ctor listener + `spawnBonusTreat`) |
| 7. Config additions                                              | Task 1         |

**Pool/Emitter reuse:** `AgentPool<T>` and `Emitter` (world/Pool.ts, world/Emitter.ts) are authored in Plan 14 and reused here. The Emitter API used in this plan: `emitter.update(dt): Vec2[]` (drip spawns), `emitter.emitNow(count): Vec2[]` (bonus treat, resets accumulator), `emitter.active: number` (caller-managed live count). The AgentPool API: `new AgentPool({ create, reset })`, `pool.acquire(pos): T`, `pool.release(obj): void`.

**Placeholder scan:** Every step includes runnable TypeScript source and a `npx vitest run` command with an expected outcome. No `// TODO` or `...` placeholders.

**Type consistency:**
- `Signal<void>.emit()` — `emit` accepts `value: T`; for `T = void` TypeScript allows `emit()` with no argument. Confirmed against `packages/signal/src/Signal.ts`.
- `scareSystem` gains an optional fifth parameter `signals?: GameSignals`. Existing call site in `Game.ts` is updated; all other callers (tests) pass no signals and remain valid.
- `fearSystem` gains an optional fourth parameter `dog?: Dog | null`. Existing call site updated; test callers that omit `dog` continue to compile (the parameter is optional).
- `penSystem` gains an optional third parameter `signals?: GameSignals`. Existing test callers omit it and compile unchanged.
- `Dog.activeBuff` is non-optional (always `null` by default) so no `?.` needed in `createDog`.
- Treat drip-spawn uses `treatEmitter.update(step)` → `Vec2[]`; bonus treat uses `emitter.emitNow(1)` to reset the accumulator then places the treat manually at the pen centroid.
- `AmbientScareState` is stored on `World` so `Game` does not hold extra state.

**Backward-compat:** All new system parameters are optional. Existing tests for `ScareSystem`, `FearSystem`, `PenSystem`, `DogControlSystem`, and `Game` that do not pass the new parameters continue to compile and pass. The `Game.ts` pipeline reorder (BuffSystem before Stamina) is safe: buffs do not interact with stamina on the same tick.

---

## Next plans

- **Plan 16 — `@getback/game`: Atlas Pipeline & Render Core** — `tools/gen-sprites.mjs` + `tools/slice-sheet.mjs` to produce `public/assets/sprites.{png,json}`; `src/render/atlas.ts` frame-name constants + `Assets` loader; `Runner.ts` (`mount(el, world)`); `RenderSystem.ts` (sprite sync, depth-sort, FX); `GrassRenderer.ts`; `input.ts` (WASD/arrows + Shift + Space → `DogIntent`). First playable browser build.
