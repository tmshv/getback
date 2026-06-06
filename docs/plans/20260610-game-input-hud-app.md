# @getback/game: Input, HUD, FX & the Playable App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable `apps/getback` browser game by adding keyboard input, a status HUD, and signal-driven FX into `@getback/game` (the render core from Plan 16). The result auto-starts in the browser: no menu, no click. The `mount()` function wires all four pieces together.

**Architecture:** Four layers added in dependency order. (1) Pure `intentFromKeys` mapping (zero Pixi) → tiny DOM `attachKeyboard` wrapper. (2) Pure HUD derivation functions (`staminaColor`, `pipStates`, `buffDisplay`, `hudVisibility`) → Pixi-drawing `Hud` class. (3) Pure FX lifecycle functions (`spawnEffect`, `ageFx`) → Pixi-drawing `Fx` class driven by `GameSignals`. (4) `apps/getback` entry-point: `buildGameWorld(seed)` (pure, testable) + `main.ts` (Vite/Pixi, manual). Each layer's pure logic is TDD-first; the Pixi wiring is smoke/manual. The `mount(world, opts?)` signature gains an optional `hud` override field — a backward-compatible additive change to Plan 16's API.

**Tech Stack:** TypeScript 5 strict, ESM, `.js` import extensions. Vitest 2 (pure logic). PixiJS v8 (`Application`, `Graphics`, `Sprite`, `Container`, `Assets`, `Ticker`) — only in `@getback/game` and `apps/*`. Vite 5 as dev server in `apps/getback`. `@getback/motor` (`Game`, `createWorld`, `DogIntent`, `Dog`, `Pen`, `generatePen`, `buildPen`, `createDog`, `createSheep`, `defaultSheepTraits`, `createObstacle`, `config`). `@getback/math` (`Vec2`, `makeRng`). `@getback/signal` (`Signal`).

---

## Key facts

- `DogIntent` from `@getback/motor`: `{ moveDir: Vec2; sprint: boolean; bark: boolean }`. `Vec2` from `@getback/math`.
- `Dog` from `@getback/motor`: `{ ...Mobile, stamina: number, barkCooldown: number, activeBuff: ActiveBuff | null }`. `ActiveBuff = { kind: BuffKind; timeLeft: number }`.
- `config.stamina = { max: 100, sprintDrain: 18, regen: 22, barkCost: 12 }` (all from `@getback/motor/config`).
- `GameSignals` (after Plan 15): `{ penFilled: Signal<void>; sheepPenned: Signal<void>; treatCollected: Signal<Vec2>; barked: Signal<Vec2>; ambientScare: Signal<void> }`.
- `Game.update(dt, intent?)` — called each Pixi ticker frame with `time.deltaMS / 1000`.
- Logical resolution: `480 × 270`. Rendered nearest-neighbour, scaled to fill window, letterboxed.
- `mount(world, opts?)` from Plan 16: boots Pixi, loads atlas, wires `Runner` + `RenderSystem`. Plan 16's `MountOptions` already includes `container?: HTMLElement` and `input?: () => DogIntent`. Plan 17 adds `hud?: HudOverride` as an additional optional field (fully backward-compatible).
- Atlas frame names follow Plan 16 constants (e.g., `FRAME.corgi_idle_0`, `FRAME.sheep_idle_0`, `FRAME.treat`, `FRAME.buff_zoomies`, `FRAME.buff_megabark`, `FRAME.buff_calm`). Bark ring, dust, and sparkle are drawn procedurally with `Graphics` (no atlas frames needed).
- `Signal<void>.emit()` accepts no argument (TypeScript allows `emit()` when `T = void`).
- `Ticker` callback receives a `Ticker` instance; `deltaMS` is elapsed milliseconds since last frame.
- `Graphics` in Pixi v8: chain `.rect(x, y, w, h).fill(color)`, `.circle(x, y, r).fill(color)`, `.arc(...)`, `.stroke(...)`, `.clear()` — then call `.fill({ color, alpha })` / `.stroke({ color, width, alpha })`.
- `Container.sortableChildren = true` + `child.zIndex = N` for depth sorting within a layer.
- ESM `.js` import extensions on all `.ts` source imports.

---

## File structure (created/modified)

```
packages/game/                                        # @getback/game — created by Plan 16
  package.json                                        # MODIFIED: deps already include pixi.js; no change needed
  src/
    index.ts                                          # MODIFIED: re-export MountOptions, HudOverride, attachKeyboard, intentFromKeys, Hud, Fx
    Runner.ts                                         # MODIFIED: pass hud override to Hud constructor; wire Fx to signals
    input/
      keyboard.ts                                     # NEW: intentFromKeys (pure) + attachKeyboard (DOM)
      keyboard.test.ts                                # NEW: TDD pure mapping
    render/
      Hud.ts                                          # NEW: pure derivation fns + Pixi Hud class
      Hud.test.ts                                     # NEW: TDD pure derivation
      Fx.ts                                           # NEW: pure FX lifecycle + Pixi Fx class
      Fx.test.ts                                      # NEW: TDD lifecycle/aging

apps/
  getback/                                            # NEW package — the playable game
    package.json                                      # name: "getback-app"; deps: @getback/game, @getback/motor, @getback/math; devDeps: vite
    vite.config.ts                                    # NEW
    index.html                                        # NEW
    src/
      world.ts                                        # NEW: buildGameWorld(seed) — pure, testable
      world.test.ts                                   # NEW: TDD world builder
      main.ts                                         # NEW: DOM boot, mount(), game loop
```

---

### Task 1: Pure keyboard input + `attachKeyboard` [TDD + manual verify]

**Files:**
- Create: `packages/game/src/input/keyboard.ts`
- Create: `packages/game/src/input/keyboard.test.ts`

**Goal:** `intentFromKeys(pressed)` maps a `Set<string>` of currently-down key names to a `DogIntent`. WASD and arrow keys combine into a normalized 8-way `moveDir`; opposing keys cancel; Shift → `sprint`; Space → `bark` (edge-trigger: fires once per fresh press, not every frame). `attachKeyboard(target)` wires DOM events and returns a `dispose()` function.

- [ ] **Step 1: Write the failing tests [TDD]**

Create `packages/game/src/input/keyboard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { intentFromKeys, createEdgeTrigger } from "./keyboard.js";

const DIAG = Math.SQRT1_2; // 1/√2 ≈ 0.7071

describe("intentFromKeys — moveDir", () => {
  it("no keys → zero vector", () => {
    const intent = intentFromKeys(new Set());
    expect(intent.moveDir.x).toBe(0);
    expect(intent.moveDir.y).toBe(0);
  });

  it("ArrowRight → unit right", () => {
    const intent = intentFromKeys(new Set(["ArrowRight"]));
    expect(intent.moveDir.x).toBeCloseTo(1, 5);
    expect(intent.moveDir.y).toBe(0);
  });

  it("KeyA → unit left", () => {
    const intent = intentFromKeys(new Set(["KeyA"]));
    expect(intent.moveDir.x).toBeCloseTo(-1, 5);
    expect(intent.moveDir.y).toBe(0);
  });

  it("ArrowUp → unit up (negative y)", () => {
    const intent = intentFromKeys(new Set(["ArrowUp"]));
    expect(intent.moveDir.x).toBe(0);
    expect(intent.moveDir.y).toBeCloseTo(-1, 5);
  });

  it("KeyS → unit down (positive y)", () => {
    const intent = intentFromKeys(new Set(["KeyS"]));
    expect(intent.moveDir.x).toBe(0);
    expect(intent.moveDir.y).toBeCloseTo(1, 5);
  });

  it("diagonal KeyW+KeyD → normalized to length 1", () => {
    const intent = intentFromKeys(new Set(["KeyW", "KeyD"]));
    const len = Math.hypot(intent.moveDir.x, intent.moveDir.y);
    expect(len).toBeCloseTo(1, 5);
    expect(intent.moveDir.x).toBeCloseTo(DIAG, 5);
    expect(intent.moveDir.y).toBeCloseTo(-DIAG, 5);
  });

  it("opposing horizontal keys cancel (KeyA + KeyD → x = 0)", () => {
    const intent = intentFromKeys(new Set(["KeyA", "KeyD"]));
    expect(intent.moveDir.x).toBe(0);
  });

  it("opposing vertical keys cancel (ArrowUp + ArrowDown → y = 0)", () => {
    const intent = intentFromKeys(new Set(["ArrowUp", "ArrowDown"]));
    expect(intent.moveDir.y).toBe(0);
  });

  it("WASD and arrow equivalents produce the same result", () => {
    const wasd = intentFromKeys(new Set(["KeyW", "KeyD"]));
    const arrows = intentFromKeys(new Set(["ArrowUp", "ArrowRight"]));
    expect(wasd.moveDir.x).toBeCloseTo(arrows.moveDir.x, 5);
    expect(wasd.moveDir.y).toBeCloseTo(arrows.moveDir.y, 5);
  });
});

describe("intentFromKeys — sprint + bark flags", () => {
  it("ShiftLeft → sprint true", () => {
    expect(intentFromKeys(new Set(["ShiftLeft"])).sprint).toBe(true);
  });

  it("ShiftRight → sprint true", () => {
    expect(intentFromKeys(new Set(["ShiftRight"])).sprint).toBe(true);
  });

  it("no Shift → sprint false", () => {
    expect(intentFromKeys(new Set(["KeyW"])).sprint).toBe(false);
  });

  it("Space → bark true (raw, no edge trigger)", () => {
    expect(intentFromKeys(new Set(["Space"])).bark).toBe(true);
  });

  it("no Space → bark false", () => {
    expect(intentFromKeys(new Set()).bark).toBe(false);
  });
});

describe("createEdgeTrigger", () => {
  it("fires on the first call when Space is pressed", () => {
    const trigger = createEdgeTrigger();
    expect(trigger(new Set(["Space"]))).toBe(true);
  });

  it("does NOT fire on the second consecutive call (key held)", () => {
    const trigger = createEdgeTrigger();
    trigger(new Set(["Space"])); // first — fires
    expect(trigger(new Set(["Space"]))).toBe(false); // held — no repeat
  });

  it("fires again after Space is released and re-pressed", () => {
    const trigger = createEdgeTrigger();
    trigger(new Set(["Space"])); // press
    trigger(new Set([]));        // release
    expect(trigger(new Set(["Space"]))).toBe(true); // re-press
  });

  it("does not fire when Space is absent", () => {
    const trigger = createEdgeTrigger();
    expect(trigger(new Set(["KeyW"]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL [TDD]**

```bash
npx vitest run packages/game/src/input/keyboard.test.ts
```
Expected: FAIL — cannot resolve `./keyboard.js`.

- [ ] **Step 3: Implement `keyboard.ts` [TDD]**

Create `packages/game/src/input/keyboard.ts`:
```ts
import type { DogIntent } from "@getback/motor";
import type { Vec2 } from "@getback/math";

// Raw mapping: key code → axis contribution.
const AXIS_X: Record<string, number> = {
  ArrowLeft: -1, KeyA: -1,
  ArrowRight: 1, KeyD: 1,
};
const AXIS_Y: Record<string, number> = {
  ArrowUp: -1,   KeyW: -1,
  ArrowDown: 1,  KeyS: 1,
};

/**
 * Derive a DogIntent from a set of currently-pressed key codes.
 * `bark` is the RAW Space flag (true whenever Space is in the set).
 * Wrap with `createEdgeTrigger` to convert to a one-shot edge signal.
 */
export function intentFromKeys(pressed: Set<string>): DogIntent {
  let x = 0;
  let y = 0;
  for (const key of pressed) {
    if (AXIS_X[key] !== undefined) x += AXIS_X[key]!;
    if (AXIS_Y[key] !== undefined) y += AXIS_Y[key]!;
  }
  // Clamp opposing cancellations to [-1, 1] then normalize diagonal.
  if (x > 1) x = 1;
  if (x < -1) x = -1;
  if (y > 1) y = 1;
  if (y < -1) y = -1;
  const len = Math.hypot(x, y);
  const moveDir: Vec2 = len > 1e-6 ? { x: x / len, y: y / len } : { x: 0, y: 0 };

  const sprint = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
  const bark = pressed.has("Space");
  return { moveDir, sprint, bark };
}

/**
 * Returns a stateful function that converts the raw `bark` boolean from
 * `intentFromKeys` into an edge-trigger: true only on the frame Space first
 * becomes pressed, not while it is held.
 */
export function createEdgeTrigger(): (pressed: Set<string>) => boolean {
  let wasDown = false;
  return (pressed: Set<string>): boolean => {
    const isDown = pressed.has("Space");
    const fire = isDown && !wasDown;
    wasDown = isDown;
    return fire;
  };
}

/**
 * Attach keyboard listeners to `target` (typically `window`).
 * Returns a `dispose()` function that removes the listeners.
 * Feeds a live `Set<string>` of key codes (e.g. "KeyW", "ArrowUp", "Space").
 */
export function attachKeyboard(target: EventTarget): {
  pressed: Set<string>;
  dispose: () => void;
} {
  const pressed = new Set<string>();
  const onDown = (e: Event): void => {
    pressed.add((e as KeyboardEvent).code);
    // Prevent page scroll on arrow/space.
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        (e as KeyboardEvent).code,
      )
    ) {
      e.preventDefault();
    }
  };
  const onUp = (e: Event): void => { pressed.delete((e as KeyboardEvent).code); };
  const onBlur = (): void => { pressed.clear(); };
  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);
  return {
    pressed,
    dispose: () => {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}
```

- [ ] **Step 4: Run to verify PASS [TDD]**

```bash
npx vitest run packages/game/src/input/keyboard.test.ts
```
Expected: PASS — 14 tests green.

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Manual verify [manual verify]**

After Task 4 (app boots): press WASD in the browser — dog moves 8-way. Hold Shift — dog sprints. Press Space — bark ring appears (verified via Task 3 FX). Diagonal movement feels smooth (normalized, not faster).

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/input/keyboard.ts packages/game/src/input/keyboard.test.ts
git commit -m "Add intentFromKeys, createEdgeTrigger, and attachKeyboard to @getback/game"
```

---

### Task 2: Pure HUD derivation functions [TDD]

**Files:**
- Create: `packages/game/src/render/Hud.ts` (pure functions only — Pixi class added in Task 3)
- Create: `packages/game/src/render/Hud.test.ts`

**Goal:** Define and TDD the pure functions that translate world state into HUD display values: stamina color + dimming, pip states array, buff display, and visibility gate. No Pixi imports in this file yet — just plain TypeScript data.

- [ ] **Step 1: Write the failing tests [TDD]**

Create `packages/game/src/render/Hud.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  staminaColor,
  staminaDimmed,
  pipStates,
  buffDisplay,
  hudVisibility,
} from "./Hud.js";
import type { ActiveBuff } from "@getback/motor";

// ── staminaColor ──────────────────────────────────────────────────────────────

describe("staminaColor", () => {
  it("returns green at full stamina", () => {
    expect(staminaColor(1.0)).toBe(0x55cc44);
  });

  it("returns amber in the mid range (~0.5)", () => {
    expect(staminaColor(0.5)).toBe(0xddaa22);
  });

  it("returns red at empty", () => {
    expect(staminaColor(0)).toBe(0xdd3322);
  });

  it("returns red below the low threshold (0.2)", () => {
    expect(staminaColor(0.19)).toBe(0xdd3322);
  });

  it("returns amber between low (0.2) and high (0.6) thresholds", () => {
    expect(staminaColor(0.4)).toBe(0xddaa22);
  });

  it("returns green above the high threshold (0.6)", () => {
    expect(staminaColor(0.8)).toBe(0x55cc44);
  });
});

// ── staminaDimmed ─────────────────────────────────────────────────────────────

describe("staminaDimmed", () => {
  // barkCost=12, max=100 → barkRatio = 0.12
  const barkCost = 12;
  const max = 100;

  it("not dimmed when stamina well above barkCost", () => {
    expect(staminaDimmed(80, barkCost, max)).toBe(false);
  });

  it("dimmed when stamina is zero", () => {
    expect(staminaDimmed(0, barkCost, max)).toBe(true);
  });

  it("dimmed when stamina is below barkCost", () => {
    expect(staminaDimmed(10, barkCost, max)).toBe(true);
  });

  it("not dimmed at exactly barkCost", () => {
    expect(staminaDimmed(12, barkCost, max)).toBe(false);
  });
});

// ── pipStates ─────────────────────────────────────────────────────────────────

describe("pipStates", () => {
  it("all empty when 0 penned out of 4", () => {
    expect(pipStates(0, 4)).toEqual(["empty", "empty", "empty", "empty"]);
  });

  it("all filled when all penned", () => {
    expect(pipStates(3, 3)).toEqual(["filled", "filled", "filled"]);
  });

  it("mixed: 2 filled, 2 empty for 2/4", () => {
    expect(pipStates(2, 4)).toEqual(["filled", "filled", "empty", "empty"]);
  });

  it("empty array when total is 0", () => {
    expect(pipStates(0, 0)).toEqual([]);
  });
});

// ── buffDisplay ───────────────────────────────────────────────────────────────

describe("buffDisplay", () => {
  it("returns null when no active buff", () => {
    expect(buffDisplay(null)).toBeNull();
  });

  it("returns kind and 0..1 progress when buff is active", () => {
    const buff: ActiveBuff = { kind: "zoomies", timeLeft: 2 };
    // duration of zoomies = 4s (from config.buffs.zoomies.duration)
    const result = buffDisplay(buff, 4);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("zoomies");
    expect(result!.progress).toBeCloseTo(0.5, 5); // 2/4 = 0.5
  });

  it("progress clamps to [0, 1]", () => {
    const buff: ActiveBuff = { kind: "calm", timeLeft: 99 };
    const result = buffDisplay(buff, 6);
    expect(result!.progress).toBeLessThanOrEqual(1);
    expect(result!.progress).toBeGreaterThanOrEqual(0);
  });
});

// ── hudVisibility ─────────────────────────────────────────────────────────────

describe("hudVisibility", () => {
  const worldWithPen = { pen: { centroid: { x: 0, y: 0 } } };
  const worldNoPen = { pen: null };

  it("shows flock counter when world has a pen and no override", () => {
    const vis = hudVisibility(worldWithPen, {});
    expect(vis.flockCounter).toBe(true);
  });

  it("hides flock counter when world has no pen", () => {
    const vis = hudVisibility(worldNoPen, {});
    expect(vis.flockCounter).toBe(false);
  });

  it("override can force-hide flock counter even when pen exists", () => {
    const vis = hudVisibility(worldWithPen, { flockCounter: false });
    expect(vis.flockCounter).toBe(false);
  });

  it("stamina meter always visible by default", () => {
    const vis = hudVisibility(worldNoPen, {});
    expect(vis.stamina).toBe(true);
  });

  it("override can force-hide stamina meter", () => {
    const vis = hudVisibility(worldNoPen, { stamina: false });
    expect(vis.stamina).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL [TDD]**

```bash
npx vitest run packages/game/src/render/Hud.test.ts
```
Expected: FAIL — cannot resolve `./Hud.js`.

- [ ] **Step 3: Implement pure functions in `Hud.ts` [TDD]**

Create `packages/game/src/render/Hud.ts` with the pure functions only (Pixi `HudView` class added in Task 3):
```ts
import type { ActiveBuff } from "@getback/motor";

// ── Colours (0xRRGGBB) ───────────────────────────────────────────────────────
const COLOR_GREEN = 0x55cc44;
const COLOR_AMBER = 0xddaa22;
const COLOR_RED   = 0xdd3322;
const THRESH_HIGH = 0.6;
const THRESH_LOW  = 0.2;

/**
 * Bar fill colour for a stamina ratio in [0, 1].
 * green → amber → red as stamina falls.
 */
export function staminaColor(ratio: number): number {
  if (ratio >= THRESH_HIGH) return COLOR_GREEN;
  if (ratio >= THRESH_LOW)  return COLOR_AMBER;
  return COLOR_RED;
}

/**
 * Returns true when the bar should render at reduced opacity —
 * i.e. the dog cannot bark (stamina < barkCost) or cannot sprint (stamina = 0).
 */
export function staminaDimmed(stamina: number, barkCost: number, max: number): boolean {
  void max; // kept for callers that pass it for clarity
  return stamina < barkCost;
}

export type PipState = "filled" | "empty";

/**
 * Array of pip states representing the flock counter.
 * Index 0 is the first pip (leftmost); penned pips come first.
 */
export function pipStates(penned: number, total: number): PipState[] {
  const states: PipState[] = [];
  for (let i = 0; i < total; i++) {
    states.push(i < penned ? "filled" : "empty");
  }
  return states;
}

export interface BuffDisplayData {
  kind:     "zoomies" | "megabark" | "calm";
  progress: number; // timeLeft / totalDuration, clamped [0, 1]
}

/**
 * Derive what the buff indicator should display.
 * Returns null when no buff is active.
 * `totalDuration` defaults to 1 (caller should pass config.buffs[kind].duration).
 */
export function buffDisplay(
  activeBuff: ActiveBuff | null,
  totalDuration = 1,
): BuffDisplayData | null {
  if (!activeBuff) return null;
  const raw = activeBuff.timeLeft / totalDuration;
  const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return { kind: activeBuff.kind, progress };
}

export interface HudOverride {
  stamina?:      boolean;
  flockCounter?: boolean;
}

export interface HudVisibility {
  stamina:      boolean;
  flockCounter: boolean;
}

/** Compute which HUD elements to render, based on world state + optional overrides. */
export function hudVisibility(
  world: { pen: unknown | null },
  override: HudOverride,
): HudVisibility {
  const autoFlockCounter = world.pen !== null;
  return {
    stamina:      override.stamina      ?? true,
    flockCounter: override.flockCounter ?? autoFlockCounter,
  };
}
```

- [ ] **Step 4: Run to verify PASS [TDD]**

```bash
npx vitest run packages/game/src/render/Hud.test.ts
```
Expected: PASS — all tests green (20+ assertions, ~12 test cases).

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/render/Hud.ts packages/game/src/render/Hud.test.ts
git commit -m "Add pure HUD derivation functions: staminaColor, pipStates, buffDisplay, hudVisibility"
```

---

### Task 3: `HudView` Pixi class [smoke]

**Files:**
- Modify: `packages/game/src/render/Hud.ts` (append `HudView` class)

**Goal:** Add the `HudView` class that reads `World` state each frame, calls the pure functions from Task 2, and updates `Graphics`/`Sprite` objects accordingly. The class is created once by `Runner.ts` and calls `update(world)` every tick.

- [ ] **Step 1: Append `HudView` to `Hud.ts` [smoke]**

Append after the pure functions in `packages/game/src/render/Hud.ts`:
```ts
import { Container, Graphics, Sprite } from "pixi.js";
import type { Texture } from "pixi.js";
import type { World } from "@getback/motor";
import { config } from "@getback/motor";

// Logical-space positions (480×270 coordinate space).
const STAMINA_X    = 6;
const STAMINA_Y    = 252;  // bottom-left; 270 - 6 - 12 (bar height)
const STAMINA_W    = 60;
const STAMINA_H    = 6;
const FLOCK_X      = 160;
const FLOCK_Y      = 4;    // top-center
const PIP_SIZE     = 5;
const PIP_GAP      = 2;
const BUFF_X       = 70;
const BUFF_Y       = 248;

/** Live Pixi display for the status HUD. Attach `.view` to the HUD layer container. */
export class HudView {
  readonly view: Container;
  private readonly staminaBg:   Graphics;
  private readonly staminaBar:  Graphics;
  private readonly flockPips:   Container;
  private readonly buffIcon:    Container;
  private readonly buffRadial:  Graphics;
  private override: HudOverride;

  // Textures injected by Runner after atlas is loaded.
  buffTextures: Record<string, Texture> = {};

  constructor(override: HudOverride = {}) {
    this.override = override;
    this.view = new Container();

    // Stamina: dark background + colored fill bar.
    this.staminaBg = new Graphics()
      .rect(STAMINA_X - 1, STAMINA_Y - 1, STAMINA_W + 2, STAMINA_H + 2)
      .fill({ color: 0x000000, alpha: 0.45 });
    this.staminaBar = new Graphics();

    // Flock counter: dynamic pip row managed in update().
    this.flockPips = new Container();

    // Buff icon + radial timer.
    this.buffIcon   = new Container();
    this.buffRadial = new Graphics();
    this.buffIcon.addChild(this.buffRadial);

    this.view.addChild(this.staminaBg, this.staminaBar, this.flockPips, this.buffIcon);
  }

  update(world: World): void {
    const dog     = world.dog;
    const pen     = world.pen;
    const vis     = hudVisibility(world, this.override);
    const stMax   = config.stamina.max;
    const barkCost = config.stamina.barkCost;

    // ── Stamina bar ───────────────────────────────────────────────────────
    this.staminaBg.visible  = vis.stamina;
    this.staminaBar.visible = vis.stamina;
    if (vis.stamina && dog) {
      const ratio   = dog.stamina / stMax;
      const color   = staminaColor(ratio);
      const dimmed  = staminaDimmed(dog.stamina, barkCost, stMax);
      const alpha   = dimmed ? 0.45 : 1.0;
      const barW    = Math.max(0, ratio * STAMINA_W);
      this.staminaBar.clear()
        .rect(STAMINA_X, STAMINA_Y, barW, STAMINA_H)
        .fill({ color, alpha });
    }

    // ── Flock counter pips ────────────────────────────────────────────────
    this.flockPips.visible = vis.flockCounter;
    if (vis.flockCounter && pen) {
      const total  = world.sheep.length;
      const penned = pen.contained.size;
      const states = pipStates(penned, total);
      // Rebuild pips if count changed (cheap for small flocks ≤ 20).
      while (this.flockPips.children.length > states.length) {
        this.flockPips.removeChildAt(this.flockPips.children.length - 1);
      }
      for (let i = 0; i < states.length; i++) {
        let pip = this.flockPips.children[i] as Graphics | undefined;
        if (!pip) {
          pip = new Graphics();
          this.flockPips.addChild(pip);
        }
        const state = states[i]!;
        const px = FLOCK_X + i * (PIP_SIZE + PIP_GAP);
        pip.clear()
          .rect(px, FLOCK_Y, PIP_SIZE, PIP_SIZE)
          .fill({ color: state === "filled" ? 0xffffff : 0x555555, alpha: state === "filled" ? 1 : 0.5 });
      }
    }

    // ── Active buff icon + radial ─────────────────────────────────────────
    if (dog?.activeBuff) {
      const { kind } = dog.activeBuff;
      const duration: Record<string, number> = {
        zoomies:  config.buffs.zoomies.duration,
        megabark: config.buffs.megabark.duration,
        calm:     config.buffs.calm.duration,
      };
      const data = buffDisplay(dog.activeBuff, duration[kind] ?? 1);
      this.buffIcon.visible = true;
      this.buffRadial.clear();
      if (data) {
        const angle = -Math.PI / 2;
        const sweep = data.progress * Math.PI * 2;
        this.buffRadial
          .arc(BUFF_X + 4, BUFF_Y + 4, 6, angle, angle + sweep)
          .stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
      }
    } else {
      this.buffIcon.visible = false;
    }
  }
}
```

- [ ] **Step 2: Smoke check [smoke]**

After Task 4 (app boots), verify in the browser:
- Stamina bar (bottom-left, ~60 px wide) drains green→amber→red as the dog sprints or barks.
- Dims (lower alpha) when stamina < 12 (below bark cost).
- Pip row (top-center) shows one pip per sheep; pips fill white as sheep enter the pen.
- Buff icon + arc appear when the dog collects a buff treat; arc shrinks to zero as the buff expires.
- All elements auto-hide when `world.pen === null` (flock counter only).

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/render/Hud.ts
git commit -m "Add HudView Pixi class for stamina meter, pip counter, and buff radial"
```

---

### Task 4: Pure FX lifecycle + `FxSystem` Pixi class [TDD + smoke]

**Files:**
- Create: `packages/game/src/render/Fx.ts`
- Create: `packages/game/src/render/Fx.test.ts`

**Goal:** Define FX instances (bark ring, dust puff, sparkle) as plain data; TDD their lifecycle (spawn, age, expire). Then add a `FxSystem` Pixi class that listens to `GameSignals` and renders living instances each frame.

- [ ] **Step 1: Write the failing tests [TDD]**

Create `packages/game/src/render/Fx.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  createBarkRing,
  createDustPuff,
  createSparkle,
  ageFx,
  isFxAlive,
} from "./Fx.js";

// ── spawn factories ───────────────────────────────────────────────────────────

describe("createBarkRing", () => {
  it("creates a ring at the given position with age 0", () => {
    const fx = createBarkRing({ x: 10, y: 20 });
    expect(fx.kind).toBe("barkRing");
    expect(fx.pos.x).toBe(10);
    expect(fx.pos.y).toBe(20);
    expect(fx.age).toBe(0);
    expect(fx.radius).toBeCloseTo(0, 5);
  });

  it("ring has a positive lifetime", () => {
    expect(createBarkRing({ x: 0, y: 0 }).lifetime).toBeGreaterThan(0);
  });
});

describe("createDustPuff", () => {
  it("creates a puff with age 0 and a positive lifetime", () => {
    const fx = createDustPuff({ x: 5, y: 5 });
    expect(fx.kind).toBe("dustPuff");
    expect(fx.age).toBe(0);
    expect(fx.lifetime).toBeGreaterThan(0);
  });
});

describe("createSparkle", () => {
  it("creates a sparkle with age 0 at the given position", () => {
    const fx = createSparkle({ x: 100, y: 50 });
    expect(fx.kind).toBe("sparkle");
    expect(fx.pos.x).toBe(100);
    expect(fx.age).toBe(0);
  });
});

// ── ageFx ─────────────────────────────────────────────────────────────────────

describe("ageFx", () => {
  it("increments age by dt", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, 0.1);
    expect(fx.age).toBeCloseTo(0.1, 5);
  });

  it("accumulates across multiple calls", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, 0.1);
    ageFx(fx, 0.05);
    expect(fx.age).toBeCloseTo(0.15, 5);
  });

  it("expands bark ring radius proportionally to age/lifetime", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, fx.lifetime / 2);
    // radius at half-life should be roughly half maxRadius
    expect(fx.radius).toBeGreaterThan(0);
    expect(fx.radius).toBeLessThan(fx.maxRadius);
  });
});

// ── isFxAlive ─────────────────────────────────────────────────────────────────

describe("isFxAlive", () => {
  it("alive when age < lifetime", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, fx.lifetime * 0.5);
    expect(isFxAlive(fx)).toBe(true);
  });

  it("dead when age >= lifetime", () => {
    const fx = createBarkRing({ x: 0, y: 0 });
    ageFx(fx, fx.lifetime + 0.01);
    expect(isFxAlive(fx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL [TDD]**

```bash
npx vitest run packages/game/src/render/Fx.test.ts
```
Expected: FAIL — cannot resolve `./Fx.js`.

- [ ] **Step 3: Implement pure types + lifecycle functions in `Fx.ts` [TDD]**

Create `packages/game/src/render/Fx.ts` with the pure section first:
```ts
import type { Vec2 } from "@getback/math";

// ── Pure FX data types ────────────────────────────────────────────────────────

export interface BarkRingFx {
  kind:      "barkRing";
  pos:       Vec2;
  age:       number;
  lifetime:  number;
  radius:    number;
  maxRadius: number;
}

export interface DustPuffFx {
  kind:     "dustPuff";
  pos:      Vec2;
  age:      number;
  lifetime: number;
}

export interface SparkleFx {
  kind:     "sparkle";
  pos:      Vec2;
  age:      number;
  lifetime: number;
}

export type FxInstance = BarkRingFx | DustPuffFx | SparkleFx;

// ── Spawn factories ───────────────────────────────────────────────────────────

const BARK_RING_LIFETIME  = 0.35; // seconds
const BARK_RING_MAX_R     = 50;   // px at full expansion
const DUST_PUFF_LIFETIME  = 0.4;
const SPARKLE_LIFETIME    = 0.55;

export function createBarkRing(pos: Vec2): BarkRingFx {
  return { kind: "barkRing", pos: { x: pos.x, y: pos.y }, age: 0, lifetime: BARK_RING_LIFETIME, radius: 0, maxRadius: BARK_RING_MAX_R };
}

export function createDustPuff(pos: Vec2): DustPuffFx {
  return { kind: "dustPuff", pos: { x: pos.x, y: pos.y }, age: 0, lifetime: DUST_PUFF_LIFETIME };
}

export function createSparkle(pos: Vec2): SparkleFx {
  return { kind: "sparkle", pos: { x: pos.x, y: pos.y }, age: 0, lifetime: SPARKLE_LIFETIME };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** Advance an FX instance by `dt` seconds; updates derived fields (e.g. ring radius). */
export function ageFx(fx: FxInstance, dt: number): void {
  fx.age += dt;
  if (fx.kind === "barkRing") {
    const t = Math.min(fx.age / fx.lifetime, 1);
    fx.radius = t * fx.maxRadius;
  }
}

export function isFxAlive(fx: FxInstance): boolean {
  return fx.age < fx.lifetime;
}
```

- [ ] **Step 4: Run to verify PASS [TDD]**

```bash
npx vitest run packages/game/src/render/Fx.test.ts
```
Expected: PASS — all tests green (~11 test cases).

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Append `FxSystem` Pixi class to `Fx.ts` [smoke]**

Append to `packages/game/src/render/Fx.ts`:
```ts
import { Container, Graphics } from "pixi.js";
import type { GameSignals } from "@getback/motor";

/**
 * Pixi rendering system for particle FX.
 * Subscribe to signals in the constructor; call update(dt) each frame.
 * Attach `.view` to the FX layer (above entities, below HUD).
 */
export class FxSystem {
  readonly view: Container;
  private readonly gfx:      Graphics;
  private readonly instances: FxInstance[] = [];

  constructor(signals: GameSignals) {
    this.view = new Container();
    this.gfx  = new Graphics();
    this.view.addChild(this.gfx);

    signals.barked.add((pos: Vec2) => {
      this.instances.push(createBarkRing(pos));
      this.instances.push(createDustPuff(pos));
    });

    signals.penFilled.add(() => {
      // Sparkle burst at a fixed pasture centre when pen fills.
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = 20;
        this.instances.push(
          createSparkle({ x: 240 + Math.cos(angle) * r, y: 135 + Math.sin(angle) * r }),
        );
      }
    });

    signals.treatCollected.add((pos: Vec2) => {
      this.instances.push(createSparkle(pos));
    });
  }

  update(dt: number): void {
    // Age all instances; remove expired ones.
    for (let i = this.instances.length - 1; i >= 0; i--) {
      ageFx(this.instances[i]!, dt);
      if (!isFxAlive(this.instances[i]!)) this.instances.splice(i, 1);
    }

    // Redraw all living instances.
    this.gfx.clear();
    for (const fx of this.instances) {
      const t = Math.min(fx.age / fx.lifetime, 1);
      const alpha = 1 - t; // fade out uniformly

      if (fx.kind === "barkRing") {
        this.gfx
          .circle(fx.pos.x, fx.pos.y, fx.radius)
          .stroke({ color: 0xffffff, width: 1.5, alpha: alpha * 0.9 });
      } else if (fx.kind === "dustPuff") {
        const r = 3 + t * 5;
        this.gfx
          .circle(fx.pos.x, fx.pos.y, r)
          .fill({ color: 0xd4b483, alpha: alpha * 0.6 });
      } else if (fx.kind === "sparkle") {
        const r = 2 + t * 4;
        this.gfx
          .circle(fx.pos.x, fx.pos.y, r)
          .fill({ color: 0xffee88, alpha: alpha * 0.8 });
      }
    }
  }
}
```

- [ ] **Step 6: Smoke check [smoke]**

After Task 5 (app boots), verify in the browser:
- Pressing Space triggers a white expanding ring at the dog's position, fading over ~0.35 s.
- A dust puff appears at the same position.
- Collecting a treat spawns a small yellow sparkle.
- Filling the pen triggers 6 sparkles in a circle at the pasture centre.
- No console errors; FPS stays above 55.

- [ ] **Step 7: Commit**

```bash
git add packages/game/src/render/Fx.ts packages/game/src/render/Fx.test.ts
git commit -m "Add pure FX lifecycle and FxSystem signal-driven Pixi renderer"
```

---

### Task 5: Wire input, HUD, FX into `Runner.ts` + update `index.ts` [smoke]

**Files:**
- Modify: `packages/game/src/Runner.ts` (extend `MountOptions`; create `HudView`, `FxSystem`; wire ticker)
- Modify: `packages/game/src/index.ts` (re-export new types)

**Goal:** `mount(world, opts?)` now creates a `HudView` and `FxSystem`, hooks them into the render loop, and respects the optional `hud` override. No new tests (Pixi-only wiring); verified by running the app in Task 6.

- [ ] **Step 1: Extend `MountOptions` and update `Runner.ts` [smoke]**

In `packages/game/src/Runner.ts`, read the current file first (created by Plan 16), then make the following changes:

Add to the `MountOptions` interface:
```ts
hud?: HudOverride;
```

Import new pieces at the top:
```ts
import { HudView, HudOverride } from "./render/Hud.js";
import { FxSystem } from "./render/Fx.js";
```

Inside `mount()`, after the existing layer containers are created, add:

```ts
// FX layer — above entities
const fxSystem = new FxSystem(world.signals);
fxContainer.addChild(fxSystem.view);

// HUD layer — top
const hudView = new HudView(opts?.hud ?? {});
hudContainer.addChild(hudView.view);
```

Inside the ticker callback, after `renderSystem.update(world)`, add:
```ts
const dtSec = time.deltaMS / 1000;
fxSystem.update(dtSec);
hudView.update(world);
```

- [ ] **Step 2: Update `index.ts` [smoke]**

Add to `packages/game/src/index.ts`:
```ts
export type { HudOverride } from "./render/Hud.js";
export { intentFromKeys, createEdgeTrigger, attachKeyboard } from "./input/keyboard.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/Runner.ts packages/game/src/index.ts
git commit -m "Wire HudView and FxSystem into Runner.ts; extend MountOptions with hud override"
```

---

### Task 6: `buildGameWorld` + headless test [TDD]

**Files:**
- Create: `apps/getback/src/world.ts`
- Create: `apps/getback/src/world.test.ts`
- Create: `apps/getback/package.json`
- Create: `apps/getback/vite.config.ts`
- Create: `apps/getback/index.html`
- Create: `apps/getback/src/main.ts`

**Goal:** `buildGameWorld(seed)` is a pure factory function (no Pixi, no DOM) that builds the full game scenario: a dog, a seeded flock of sheep, obstacles (trees + rocks), a water hole obstacle, and a randomly generated pen. TDD the world builder; the Vite + main.ts wiring is manual.

- [ ] **Step 1: Write failing tests [TDD]**

Create `apps/getback/src/world.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildGameWorld } from "./world.js";

describe("buildGameWorld", () => {
  it("returns a world with a dog", () => {
    const world = buildGameWorld(1);
    expect(world.dog).not.toBeNull();
    expect(world.dog!.stamina).toBeGreaterThan(0);
  });

  it("returns a world with a non-empty flock (≥ 6 sheep)", () => {
    const world = buildGameWorld(1);
    expect(world.sheep.length).toBeGreaterThanOrEqual(6);
  });

  it("returns a world with a pen", () => {
    const world = buildGameWorld(1);
    expect(world.pen).not.toBeNull();
    expect(world.pen!.fences.length).toBeGreaterThan(0);
  });

  it("returns a world with obstacles", () => {
    const world = buildGameWorld(1);
    expect(world.obstacles.length).toBeGreaterThan(0);
  });

  it("different seeds produce different pen centroids", () => {
    const w1 = buildGameWorld(1);
    const w2 = buildGameWorld(99);
    const cx1 = w1.pen!.centroid.x;
    const cx2 = w2.pen!.centroid.x;
    // With different seeds, pen geometry should differ (not always the exact same centroid).
    expect(cx1 !== cx2 || w1.pen!.centroid.y !== w2.pen!.centroid.y).toBe(true);
  });

  it("sheep are placed within world bounds", () => {
    const world = buildGameWorld(42);
    const b = world.bounds;
    for (const s of world.sheep) {
      expect(s.pos.x).toBeGreaterThanOrEqual(b.x);
      expect(s.pos.x).toBeLessThanOrEqual(b.x + b.w);
      expect(s.pos.y).toBeGreaterThanOrEqual(b.y);
      expect(s.pos.y).toBeLessThanOrEqual(b.y + b.h);
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL [TDD]**

First create `apps/getback/package.json` so the workspace resolves:
```json
{
  "name": "getback-app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@getback/game": "*",
    "@getback/motor": "*",
    "@getback/math": "*"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

Run from repo root:
```bash
npm install
npx vitest run apps/getback/src/world.test.ts
```
Expected: FAIL — cannot resolve `./world.js`.

- [ ] **Step 3: Implement `buildGameWorld` [TDD]**

Create `apps/getback/src/world.ts`:
```ts
import {
  createWorld,
  createDog,
  createSheep,
  defaultSheepTraits,
  createObstacle,
  generatePen,
  buildPen,
  config,
} from "@getback/motor";
import { makeRng } from "@getback/math";
import type { World } from "@getback/motor";

const FLOCK_SIZE = 8;
const { w, h } = config.bounds;

/**
 * Build the full GetBack game scenario: dog at center, a random flock of sheep,
 * static obstacles, and a randomly generated pen. Pure — no Pixi, no DOM.
 */
export function buildGameWorld(seed: number): World {
  const rng = makeRng(seed);

  // Dog starts at the center of the pasture.
  const dog = createDog({ x: w / 2, y: h / 2 });

  // Flock: scatter sheep away from the center so they don't overlap the dog.
  const sheep = Array.from({ length: FLOCK_SIZE }, (_, i) => {
    const angle = (i / FLOCK_SIZE) * Math.PI * 2;
    const r = rng.range(40, 80);
    const s = createSheep(
      { x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r },
      defaultSheepTraits(),
    );
    return s;
  });

  // Static obstacles: 2 trees + 2 rocks + 1 water-hole (modelled as rock).
  const obstacles = [
    createObstacle("tree",  { x: 80,  y: 60  }, 10),
    createObstacle("tree",  { x: 390, y: 200 }, 10),
    createObstacle("rock",  { x: 300, y: 60  }, 7),
    createObstacle("rock",  { x: 100, y: 190 }, 7),
    createObstacle("rock",  { x: 240, y: 210 }, 14), // water hole — larger radius
  ];

  // Pen: random polygon in the lower-right quadrant so the dog can herd toward it.
  const penCenter = {
    x: rng.range(280, 400),
    y: rng.range(150, 220),
  };
  const penShape = generatePen(rng, {
    center:       penCenter,
    rMin:         config.pen.rMin,
    rMax:         config.pen.rMax,
    minVerts:     config.pen.minVerts,
    maxVerts:     config.pen.maxVerts,
    minGateWidth: config.pen.minGateWidth,
  });
  const pen = buildPen(penShape.outline, penShape.gateEdge);

  return createWorld(sheep, undefined, obstacles, pen, dog, rng);
}
```

- [ ] **Step 4: Run to verify PASS [TDD]**

```bash
npx vitest run apps/getback/src/world.test.ts
```
Expected: PASS — 6 tests green.

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/getback/package.json apps/getback/src/world.ts apps/getback/src/world.test.ts
git commit -m "Add buildGameWorld factory and headless tests for the getback app"
```

---

### Task 7: App entry point — `main.ts`, `index.html`, `vite.config.ts` [manual verify]

**Files:**
- Create: `apps/getback/index.html`
- Create: `apps/getback/vite.config.ts`
- Create: `apps/getback/src/main.ts`

**Goal:** Wire the browser entry point. `main.ts` calls `buildGameWorld`, then `mount(world, { input, hud })` — passing the live intent function and hud overrides through `opts`. Auto-start — no menu, no click.

- [ ] **Step 1: Create `index.html` [manual verify]**

Create `apps/getback/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GetBack</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; background: #1a1a1a; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `vite.config.ts` [manual verify]**

Create `apps/getback/vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { port: 3000 },
  build: { outDir: "dist" },
});
```

- [ ] **Step 3: Create `src/main.ts` [manual verify]**

Create `apps/getback/src/main.ts`:
```ts
import { mount, attachKeyboard, createEdgeTrigger, intentFromKeys } from "@getback/game";
import { buildGameWorld } from "./world.js";

async function run(): Promise<void> {
  const world = buildGameWorld(Date.now());

  // Keyboard input — attach before Pixi boots so no events are missed.
  const { pressed, dispose: disposeKeys } = attachKeyboard(window);
  const barkEdge = createEdgeTrigger();

  // Build a live hud override (no overrides — auto-detect from world).
  const hud = {};

  const { app } = await mount(world, {
    input: () => {
      const raw  = intentFromKeys(pressed);
      const bark = barkEdge(pressed);
      return { moveDir: raw.moveDir, sprint: raw.sprint, bark };
    },
    hud,
  });

  // Clean up on HMR / page unload.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disposeKeys();
      app.destroy(true);
    });
  }
}

run().catch(console.error);
```

- [ ] **Step 4: Manual verify [manual verify]**

```bash
cd apps/getback && npm run dev
```
Open `http://localhost:3000` in the browser. Verify all of the following:
- Page loads without console errors.
- The 480×270 pixel-art pasture renders, letterboxed, scaled to fill the window.
- WASD / arrow keys move the corgi (8-way; diagonals feel same speed as cardinal).
- Shift held → dog sprints; stamina bar (bottom-left) drains.
- Space pressed → bark ring expands at dog position; nearby sheep scatter.
- Stamina bar dims to ~45 % alpha when stamina < 12 (can't bark).
- Pip row (top-center) shows one pip per sheep; pips fill white as sheep enter the pen.
- Collecting a treat spawns a sparkle; stamina refills.
- Filling the pen: sparkle burst appears, pips reset, new pen generated, flock scatters.
- No perceptible frame drops at 60 fps.

- [ ] **Step 5: Commit**

```bash
git add apps/getback/index.html apps/getback/vite.config.ts apps/getback/src/main.ts
git commit -m "Add getback app entry point: index.html, vite.config.ts, main.ts"
```

---

## Self-review

**Scope-to-task map:**

| Scope item (from brief)                                                   | Task(s)   |
| ------------------------------------------------------------------------- | --------- |
| 1. Input: `intentFromKeys`, edge trigger, `attachKeyboard`                | Task 1    |
| 2. HUD: pure derivation functions + `HudView` Pixi class                  | Task 2, 3 |
| 3. FX: pure lifecycle + `FxSystem` Pixi class (bark ring, dust, sparkle)  | Task 4    |
| 4. `mount()` opts extended with `hud` override                            | Task 5    |
| 5. Runner wiring: `HudView` + `FxSystem` into the ticker                  | Task 5    |
| 6. `buildGameWorld(seed)` — pure, testable world factory                  | Task 6    |
| 7. `apps/getback` Vite app: `index.html`, `main.ts`, auto-start           | Task 7    |

**Placeholder scan:** No `// TODO`, `// ...`, or ellipsis in any code block. All types are named and imported from real packages. All commands include exact file paths and expected outcomes.

**Type consistency:**
- `DogIntent` from `@getback/motor`; `Vec2` from `@getback/math` — no cross-package re-declaration.
- `GameSignals` is already the Plan 15 extended version with `barked: Signal<Vec2>`, `sheepPenned: Signal<void>`, etc.
- `Signal<void>.emit()` — no-argument call is valid when `T = void` in TypeScript.
- `HudOverride` is exported and re-exported via `index.ts` so apps can pass it to `mount()`.
- `ActiveBuff` and `BuffKind` are imported from `@getback/motor` (exported by Plan 15).
- `config.buffs.zoomies.duration` etc. exist after Plan 15's config additions.
- `App.ticker.add` callback receives a `Ticker` object; `time.deltaMS` is the property name in Pixi v8.
- `mount(world, opts?)` returns `Promise<{ app: Application }>` — canonical signature defined in Plan 16; `app` is the Pixi `Application` instance callers use to inspect or stop the loop.

**TDD vs manual split:**
- TDD (full failing-test → implement → pass cycle): Tasks 1, 2, 4, 6 (keyboard mapping, HUD pure functions, FX lifecycle, world builder).
- Smoke (Pixi class written, verified in browser): Tasks 3, 4-step-5 (HudView Pixi drawing, FxSystem rendering).
- Manual verify (run the app, exercise all features): Tasks 7, with cross-references back to Tasks 1/3/4.

**Open / forward-compat notes:**
- `mount(world, opts?)` signature and return type `Promise<{ app: Application }>` are canonical per Plan 16. The `input?` and `container?` fields are defined there; `hud?` is the only new field added by this plan.
- The `hud` field in `MountOptions` is additive and optional — existing callers (examples) break nothing.
- `FxSystem` draws bark rings and dust puffs at `barked` position; the dust puff offset is zero (same point). A small random offset can be added later for variety without changing the pure interface.
- `buildGameWorld` places the water hole as a `rock` obstacle (largest radius). When an atlas water-hole tile is added (Plan 16 or later), the `RenderSystem` can discriminate by radius or a future `kind: "water"` field.

---

## Next plans

- **Plan 18 — Examples: `one-sheep`, `several-sheep`, `only-corgi`** — Three thin `examples/*` packages each with an `index.html + vite.config + main.ts` that build a minimal scenario `World` (no pen for `only-corgi`, a single sheep for `one-sheep`, a flock with no pen for `several-sheep`) and call `mount()`. Verify that `hudVisibility` auto-hides the flock counter for the pen-less scenarios. Smoke tests only (no new pure logic).
