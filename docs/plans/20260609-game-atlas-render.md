# @getback/game: Atlas Pipeline & Render Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `@getback/game` package — the playable render core that wraps `@getback/motor` with a PixiJS draw layer. After this plan: the atlas pipeline runs (gen-sprites fallback always works; slice-sheet requires `asset0.png` which exists at repo root), a `mount(world, opts?)` function boots Pixi and renders the motor's `World` live at logical 480×270 with integer nearest-neighbour letterbox scaling, and every pure logic unit (frame resolver, AnimationSystem, RenderSystem diff, letterbox math) is fully TDD-green.

**Architecture:** `@getback/motor` stays Pixi-free and headless — it is never modified by this plan. `@getback/game` is the one package that imports `pixi.js`. The motor entity carries **no** rendering state; `RenderSystem` owns an external `Map<Mobile, Sprite>` keyed by entity identity. The atlas frame-name table in `src/atlas/frames.ts` is the single source of truth shared by the generator, the slicer, AnimationSystem, and RenderSystem.

**Tech Stack:** TypeScript 5 strict, ESM, `.js` import extensions on `.ts` files. Vitest 2 (picked up automatically via `packages/**/*.test.ts`). PixiJS v8. `@napi-rs/canvas` (dev dependency, Node-only, used only in `tools/`). npm workspaces (`packages/*` glob already covers `packages/game`).

---

## Key facts

- **Motor stays Pixi-free.** No file in `@getback/motor`, `@getback/math`, `@getback/signal`, or `@getback/spatial` may import `pixi.js`. Enforced naturally: those packages don't list it as a dependency.
- **Only `@getback/game` imports pixi.js.** `packages/game/src/render/*` and `packages/game/src/Runner.ts` are the only files that touch Pixi types.
- **Render decoupling.** `RenderSystem` owns `Map<Mobile, Sprite>`. The motor entity has no `.sprite`, no render ref, nothing Pixi-shaped.
- **`.js` import extensions** on every local `import` statement (TS5 ESM convention already used throughout the repo).
- **TDD vs smoke vs manual:** every pure/headless unit gets full Vitest TDD. Pixi boot, atlas tool output, and visual results get explicit smoke commands or are flagged `[manual verify]`.
- **Atlas frame table is the contract.** `src/atlas/frames.ts` defines `FRAME_GRID` and `frameName()`; the generator and slicer both consume it (or its output). Tests lock the resolver against it.
- **`asset0.png` exists** at `/Users/tmshv/Workspace/Playground/getback/asset0.png` (repo root). `slice-sheet.mjs` reads it from there (or a configurable path). `gen-sprites.mjs` runs without it.
- **Vitest include** is `packages/**/*.test.ts` — new tests under `packages/game/src/**` are picked up automatically, no config change needed.

---

## File structure (created/modified)

```
packages/game/package.json                          # NEW: @getback/game manifest; deps pixi.js + motor + math; devDep @napi-rs/canvas
packages/game/tsconfig.json                         # NEW: extends ../../tsconfig.base.json; includes src/**
packages/game/src/index.ts                          # NEW: package barrel; exports mount()
packages/game/src/config.ts                         # NEW: render constants (logical res, layers, frame durations, shadow offset)
packages/game/src/atlas/frames.ts                   # NEW: FRAME_GRID 6×9, frameName(), frameFlipX() — atlas contract
packages/game/src/atlas/frames.test.ts              # NEW: TDD for frameName() and frameFlipX()
packages/game/src/render/AnimationSystem.ts         # NEW: pure (kind, state, facing, timer, dt) → { frame, flipX }
packages/game/src/render/AnimationSystem.test.ts    # NEW: TDD walk-cycle, idle, bark, graze, mirroring
packages/game/src/render/RenderSystem.ts            # NEW: Map<Mobile, SpriteLike> diff; Pixi factory injected
packages/game/src/render/RenderSystem.test.ts       # NEW: TDD diff logic with fake factory (no Pixi)
packages/game/src/render/GrassRenderer.ts           # NEW: density→frame mapping (pure, TDD) + tile placement (Pixi)
packages/game/src/render/GrassRenderer.test.ts      # NEW: TDD density→frame mapping
packages/game/src/render/letterbox.ts               # NEW: pure computeLetterbox() function
packages/game/src/render/letterbox.test.ts          # NEW: TDD letterbox math
packages/game/src/Runner.ts                         # NEW: Pixi Application boot + Ticker loop [manual verify]
tools/gen-sprites.mjs                               # NEW: procedural atlas generator (@napi-rs/canvas) [smoke]
tools/slice-sheet.mjs                               # NEW: asset0.png → keyed + sliced + packed atlas [smoke]
```

Root-level files modified:

```
tsconfig.json                                       # MODIFIED: add packages/game to references (if using project refs)
```

> **Note:** The root `tsconfig.json` may already use a `references` array or may rely on the `tsconfig.base.json` + per-package configs. Check before editing; if no `references` array exists, no root change is needed — the workspace `packages/*` glob plus Vitest's `include` pattern is sufficient.

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/game/package.json`
- Create: `packages/game/tsconfig.json`
- Create: `packages/game/src/index.ts`
- Create: `packages/game/src/config.ts`

[smoke / compile check]

- [ ] **Step 1: Create `packages/game/package.json`**

```json
{
  "name": "@getback/game",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "gen:sprites": "node tools/gen-sprites.mjs",
    "slice:sheet": "node tools/slice-sheet.mjs"
  },
  "dependencies": {
    "@getback/math": "*",
    "@getback/motor": "*",
    "pixi.js": "^8.0.0"
  },
  "devDependencies": {
    "@napi-rs/canvas": "^0.1.44"
  }
}
```

- [ ] **Step 2: Create `packages/game/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/game/src/config.ts`**

```ts
// Render-side constants for @getback/game.
// Motor config lives in @getback/motor/src/config.ts — keep them separate.

export const LOGICAL_W = 480;
export const LOGICAL_H = 270;

// Layer z-order indices (assigned to Container.zIndex on the stage)
export const LAYER = {
  TERRAIN: 0,
  PROPS:   1,
  ENTITIES: 2,   // depth-sorted by entity y within this container
  FX:      3,
  HUD:     4,
} as const;

// Frame durations in seconds
export const FRAME_DURATION = {
  WALK: 0.12,   // seconds per walk frame (4-frame cycle → ~8 fps at normal walk)
  IDLE: 0,      // static — no cycling
} as const;

// Shadow
export const SHADOW_OFFSET_Y = 4;   // px below entity anchor
export const SHADOW_SCALE_X  = 1.0;
export const SHADOW_SCALE_Y  = 0.5;

// Grass density thresholds (density in [0..1])
export const GRASS_THRESHOLD = {
  LUSH:   0.75,
  MED:    0.40,
  GRAZED: 0.10,
  // below 0.10 → dirt
} as const;
```

- [ ] **Step 4: Create `packages/game/src/index.ts`** (barrel — filled out fully in Task 7; stub now)

```ts
// @getback/game public surface.
// mount() is added in Task 7 (Runner).
export { computeLetterbox } from "./render/letterbox.js";
```

- [ ] **Step 5: Install dependencies**

From the repo root:
```bash
npm install
```

Expected: workspace resolves `pixi.js` and `@napi-rs/canvas`; no errors about missing packages.

- [ ] **Step 6: Smoke compile**

```bash
npm run typecheck
```

Expected: exit 0. (The stub `src/index.ts` exports nothing Pixi-typed yet, so it compiles cleanly even without a DOM lib.)

- [ ] **Step 7: Commit**

```bash
git add packages/game/package.json packages/game/tsconfig.json packages/game/src/config.ts packages/game/src/index.ts
git commit -m "Scaffold @getback/game package with config and barrel"
```

---

### Task 2: Atlas frame table — `src/atlas/frames.ts`

**Files:**
- Create: `packages/game/src/atlas/frames.ts`
- Create: `packages/game/src/atlas/frames.test.ts`

[TDD]

The `FRAME_GRID` constant is the **single source of truth** for every frame name in the atlas. It must exactly match §4.2 of the spec. Both `gen-sprites.mjs` (Task 3) and `slice-sheet.mjs` (Task 3) import this file (or its transpiled output) to guarantee they agree.

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/atlas/frames.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FRAME_GRID, frameName, frameFlipX, FRAME_NAMES } from "./frames.js";

describe("FRAME_GRID", () => {
  it("has 9 rows", () => {
    expect(FRAME_GRID.length).toBe(9);
  });

  it("has 6 columns in every row", () => {
    for (const row of FRAME_GRID) {
      expect(row.length).toBe(6);
    }
  });

  it("row 0 is corgi down frames", () => {
    expect(FRAME_GRID[0]).toEqual([
      "corgi_down_idle",
      "corgi_down_walk0",
      "corgi_down_walk1",
      "corgi_down_walk2",
      "corgi_down_walk3",
      "corgi_down_bark",
    ]);
  });

  it("row 3 is sheep down frames", () => {
    expect(FRAME_GRID[3]).toEqual([
      "sheep_down_idle",
      "sheep_down_walk0",
      "sheep_down_walk1",
      "sheep_down_walk2",
      "sheep_down_walk3",
      "sheep_down_graze",
    ]);
  });

  it("row 6 is terrain frames", () => {
    expect(FRAME_GRID[6]).toEqual([
      "grass_lush",
      "grass_med",
      "grass_grazed",
      "dirt",
      "water",
      "water_edge",
    ]);
  });

  it("row 7 is prop frames", () => {
    expect(FRAME_GRID[7]).toEqual([
      "tree",
      "boulder",
      "rock",
      "fence_post",
      "fence_rail",
      "gate_post",
    ]);
  });

  it("row 8 is fx/shadow frames (last slot empty string)", () => {
    expect(FRAME_GRID[8]).toEqual([
      "bone",
      "bark_ring",
      "dust",
      "shadow",
      "sparkle",
      "",
    ]);
  });
});

describe("FRAME_NAMES", () => {
  it("is a flat array of all non-empty frame names", () => {
    // 9 rows × 6 cols = 54 total slots; 1 empty → 53 names
    expect(FRAME_NAMES.length).toBe(53);
  });

  it("contains expected names", () => {
    expect(FRAME_NAMES).toContain("corgi_down_idle");
    expect(FRAME_NAMES).toContain("sheep_side_graze");
    expect(FRAME_NAMES).toContain("shadow");
    expect(FRAME_NAMES).toContain("sparkle");
  });
});

describe("frameName", () => {
  it("returns corgi_down_idle for dog / idle / down", () => {
    expect(frameName("dog", "idle", "down")).toBe("corgi_down_idle");
  });

  it("returns corgi_up_walk2 for dog / walk2 / up", () => {
    expect(frameName("dog", "walk2", "up")).toBe("corgi_up_walk2");
  });

  it("returns corgi_down_bark for dog / bark / down", () => {
    expect(frameName("dog", "bark", "down")).toBe("corgi_down_bark");
  });

  it("maps right-facing dog to side row (mirrored at render time)", () => {
    expect(frameName("dog", "idle", "right")).toBe("corgi_side_idle");
  });

  it("maps left-facing dog to side row (mirrored at render time)", () => {
    expect(frameName("dog", "idle", "left")).toBe("corgi_side_idle");
  });

  it("returns sheep_side_walk1 for sheep / walk1 / right", () => {
    expect(frameName("sheep", "walk1", "right")).toBe("sheep_side_walk1");
  });

  it("returns sheep_down_graze for sheep / graze / down", () => {
    expect(frameName("sheep", "graze", "down")).toBe("sheep_down_graze");
  });

  it("returns sheep_up_idle for sheep / idle / up", () => {
    expect(frameName("sheep", "idle", "up")).toBe("sheep_up_idle");
  });
});

describe("frameFlipX", () => {
  it("returns false for right-facing (natural side orientation)", () => {
    expect(frameFlipX("right")).toBe(false);
  });

  it("returns true for left-facing (mirror the side sprite)", () => {
    expect(frameFlipX("left")).toBe(true);
  });

  it("returns false for up or down (no horizontal flip needed)", () => {
    expect(frameFlipX("up")).toBe(false);
    expect(frameFlipX("down")).toBe(false);
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
npx vitest run packages/game/src/atlas/frames.test.ts
```

Expected: FAIL — cannot resolve `./frames.js`.

- [ ] **Step 3: Implement `packages/game/src/atlas/frames.ts`**

```ts
import type { Direction } from "@getback/motor";

// ---------------------------------------------------------------------------
// §4.2 Atlas frame layout — the single source of truth.
// 6 columns × 9 rows. Each cell is one sprite frame keyed by name.
// Left-facing sprites are NOT stored; *_side_* is mirrored at render time.
// An empty string means the slot is intentionally blank (row 8, col 5).
// ---------------------------------------------------------------------------

export const FRAME_GRID: readonly (readonly string[])[] = [
  // Row 0: corgi (dog) — down
  ["corgi_down_idle", "corgi_down_walk0", "corgi_down_walk1", "corgi_down_walk2", "corgi_down_walk3", "corgi_down_bark"],
  // Row 1: corgi (dog) — up
  ["corgi_up_idle",   "corgi_up_walk0",   "corgi_up_walk1",   "corgi_up_walk2",   "corgi_up_walk3",   "corgi_up_bark"],
  // Row 2: corgi (dog) — side (right-facing; flip for left)
  ["corgi_side_idle", "corgi_side_walk0", "corgi_side_walk1", "corgi_side_walk2", "corgi_side_walk3", "corgi_side_bark"],
  // Row 3: sheep — down
  ["sheep_down_idle", "sheep_down_walk0", "sheep_down_walk1", "sheep_down_walk2", "sheep_down_walk3", "sheep_down_graze"],
  // Row 4: sheep — up
  ["sheep_up_idle",   "sheep_up_walk0",   "sheep_up_walk1",   "sheep_up_walk2",   "sheep_up_walk3",   "sheep_up_graze"],
  // Row 5: sheep — side (right-facing; flip for left)
  ["sheep_side_idle", "sheep_side_walk0", "sheep_side_walk1", "sheep_side_walk2", "sheep_side_walk3", "sheep_side_graze"],
  // Row 6: terrain tiles
  ["grass_lush",  "grass_med", "grass_grazed", "dirt",       "water",      "water_edge"],
  // Row 7: props / obstacles
  ["tree",        "boulder",   "rock",         "fence_post", "fence_rail", "gate_post"],
  // Row 8: FX + shadow (col 5 is empty)
  ["bone",        "bark_ring", "dust",         "shadow",     "sparkle",    ""],
] as const;

/** Flat array of every non-empty frame name. Used to validate atlas output. */
export const FRAME_NAMES: string[] = FRAME_GRID.flatMap(row =>
  row.filter(name => name !== ""),
);

// ---------------------------------------------------------------------------
// Entity kinds that the render layer distinguishes
// ---------------------------------------------------------------------------
export type EntityKind = "dog" | "sheep";

// Animation states the render layer passes in.
// walk0..3 are the walk cycle frames; idle/bark/graze are hold states.
export type AnimState =
  | "idle"
  | "walk0" | "walk1" | "walk2" | "walk3"
  | "bark"
  | "graze";

// ---------------------------------------------------------------------------
// frameName: resolve (kind, state, facing) → atlas frame name
//
// Horizontal facing ("left" | "right") both resolve to the *_side_* row.
// The caller uses frameFlipX() to decide whether to mirror the sprite.
// ---------------------------------------------------------------------------
export function frameName(
  kind: EntityKind,
  state: AnimState,
  facing: Direction,
): string {
  const prefix = kind === "dog" ? "corgi" : "sheep";

  // Map facing to the row's direction token
  const dirToken = facing === "up"   ? "up"
                 : facing === "down" ? "down"
                 :                    "side"; // left or right → side row

  // Map state to the column's suffix token
  const stateToken = state; // "idle" | "walk0" .. "walk3" | "bark" | "graze"

  return `${prefix}_${dirToken}_${stateToken}`;
}

// ---------------------------------------------------------------------------
// frameFlipX: should the sprite be mirrored horizontally?
// Only left-facing uses the flipped side sprite.
// ---------------------------------------------------------------------------
export function frameFlipX(facing: Direction): boolean {
  return facing === "left";
}
```

- [ ] **Step 4: Run + verify PASS**

```bash
npx vitest run packages/game/src/atlas/frames.test.ts
```

Expected: PASS — all tests green.

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/atlas/frames.ts packages/game/src/atlas/frames.test.ts
git commit -m "Add atlas frame table, frameName resolver, and frameFlipX"
```

---

### Task 3: Atlas tools — `gen-sprites.mjs` and `slice-sheet.mjs`

**Files:**
- Create: `packages/game/tools/gen-sprites.mjs`
- Create: `packages/game/tools/slice-sheet.mjs`

[smoke — not unit-tested; explicit commands + expected outputs]

Both tools are Node ESM scripts. `gen-sprites.mjs` is the always-runnable fallback that requires no source artwork. `slice-sheet.mjs` requires `asset0.png` at repo root (confirmed present). Both produce `packages/game/public/assets/sprites.png` and `packages/game/public/assets/sprites.json` in Pixi spritesheet JSON-hash format.

**Pixi spritesheet JSON format (reference):**

```json
{
  "frames": {
    "corgi_down_idle": {
      "frame": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }
    }
  },
  "meta": {
    "image": "sprites.png",
    "format": "RGBA8888",
    "size": { "w": 192, "h": 288 },
    "scale": "1"
  }
}
```

**Sprite sizing decisions:**

- Creature frames: 32×32 px (fits logical 480×270 pasture; dog radius 6 → roughly 12 px creature footprint at 1× — a 32 px sprite with blank margins looks right and allows animation room).
- Terrain tiles: 16×16 px (matches motor `config.grass.cellSize = 16`).
- FX/shadow: 32×32 px.
- Sheet layout: 6 columns × 9 rows → sheet size `6×32 = 192` wide × `9×32 = 288` tall. (All frames packed at uniform 32 px for simplicity; terrain tiles centered in a 32 px cell.)

- [ ] **Step 1: Create output directory**

```bash
mkdir -p packages/game/public/assets
```

- [ ] **Step 2: Create `packages/game/tools/gen-sprites.mjs`**

This script procedurally draws colored placeholder frames with `@napi-rs/canvas` and emits the full atlas. It uses `FRAME_GRID` from `src/atlas/frames.ts` via a local data copy (tools are plain Node ESM — no TS compilation step — so we inline the frame grid rather than transpile).

```js
#!/usr/bin/env node
// tools/gen-sprites.mjs
// Procedural atlas generator — no source artwork required.
// Produces packages/game/public/assets/sprites.{png,json}.
//
// Frame grid reproduced from src/atlas/frames.ts (keep in sync).
// Each frame is 32×32 px; sheet is 6 cols × 9 rows = 192×288 px.

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, "../public/assets");

// ── Frame grid (mirror of src/atlas/frames.ts §4.2) ────────────────────────
const FRAME_GRID = [
  ["corgi_down_idle","corgi_down_walk0","corgi_down_walk1","corgi_down_walk2","corgi_down_walk3","corgi_down_bark"],
  ["corgi_up_idle",  "corgi_up_walk0",  "corgi_up_walk1",  "corgi_up_walk2",  "corgi_up_walk3",  "corgi_up_bark"],
  ["corgi_side_idle","corgi_side_walk0","corgi_side_walk1","corgi_side_walk2","corgi_side_walk3","corgi_side_bark"],
  ["sheep_down_idle","sheep_down_walk0","sheep_down_walk1","sheep_down_walk2","sheep_down_walk3","sheep_down_graze"],
  ["sheep_up_idle",  "sheep_up_walk0",  "sheep_up_walk1",  "sheep_up_walk2",  "sheep_up_walk3",  "sheep_up_graze"],
  ["sheep_side_idle","sheep_side_walk0","sheep_side_walk1","sheep_side_walk2","sheep_side_walk3","sheep_side_graze"],
  ["grass_lush","grass_med","grass_grazed","dirt","water","water_edge"],
  ["tree","boulder","rock","fence_post","fence_rail","gate_post"],
  ["bone","bark_ring","dust","shadow","sparkle",""],
];

const CELL = 32;           // px per frame (square)
const COLS = 6;
const ROWS = FRAME_GRID.length; // 9

// Colour palette per entity/category row
const ROW_COLORS = [
  "#e07060", // row 0  corgi down   — warm orange-red
  "#e07060", // row 1  corgi up
  "#e07060", // row 2  corgi side
  "#f0f0d0", // row 3  sheep down   — off-white
  "#f0f0d0", // row 4  sheep up
  "#f0f0d0", // row 5  sheep side
  "#60c060", // row 6  terrain
  "#806040", // row 7  props
  "#c0c0ff", // row 8  FX / shadow
];

const canvas = createCanvas(COLS * CELL, ROWS * CELL);
const ctx    = canvas.getContext("2d");

// Transparent background
ctx.clearRect(0, 0, canvas.width, canvas.height);

const frames = {};

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const name = FRAME_GRID[row][col];
    if (!name) continue; // empty slot (row 8 col 5)

    const x = col * CELL;
    const y = row * CELL;

    // Background fill
    ctx.fillStyle = ROW_COLORS[row];
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

    // Walk-frame indicator: a small numbered dot
    const walkMatch = name.match(/walk(\d)/);
    if (walkMatch) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(walkMatch[1], x + CELL / 2, y + CELL / 2);
    }

    // Special marker for bark / graze
    if (name.endsWith("_bark") || name.endsWith("_graze")) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + CELL / 2 - 4, y + CELL / 2 - 4, 8, 8);
    }

    frames[name] = {
      frame:           { x, y, w: CELL, h: CELL },
      rotated:         false,
      trimmed:         false,
      spriteSourceSize:{ x: 0, y: 0, w: CELL, h: CELL },
      sourceSize:      { w: CELL, h: CELL },
    };
  }
}

const json = {
  frames,
  meta: {
    image:  "sprites.png",
    format: "RGBA8888",
    size:   { w: COLS * CELL, h: ROWS * CELL },
    scale:  "1",
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "sprites.json"), JSON.stringify(json, null, 2));

const buf = canvas.toBuffer("image/png");
writeFileSync(join(OUT_DIR, "sprites.png"), buf);

console.log(`gen-sprites: wrote sprites.png (${COLS * CELL}×${ROWS * CELL}) and sprites.json (${Object.keys(frames).length} frames)`);
```

- [ ] **Step 3: Create `packages/game/tools/slice-sheet.mjs`**

Requires `asset0.png` at repo root (or `ASSET0` env var for an alternate path). Checkerboard key-out uses a two-pass approach: sample the four corner-region pixels to identify the two checker tones, then flood-fill from all border pixels with colour-match tolerance, setting matched pixels transparent.

```js
#!/usr/bin/env node
// tools/slice-sheet.mjs
// Slice asset0.png (2880×2880, 6col×9row, checkerboard background) into the
// Pixi spritesheet atlas.
//
// Requires: asset0.png at REPO_ROOT (or ASSET0 env override).
// Produces: packages/game/public/assets/sprites.{png,json}
//
// Key-out algorithm:
//   1. Sample the two checker tones from the four corners.
//   2. Flood-fill from every border pixel that matches within tolerance.
//   3. Set matched pixels to alpha=0.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");      // packages/game/tools → repo root
const ASSET_PATH = process.env["ASSET0"] ?? join(REPO_ROOT, "asset0.png");
const OUT_DIR    = join(__dirname, "../public/assets");

// ── Frame grid (mirror of src/atlas/frames.ts §4.2) ────────────────────────
const FRAME_GRID = [
  ["corgi_down_idle","corgi_down_walk0","corgi_down_walk1","corgi_down_walk2","corgi_down_walk3","corgi_down_bark"],
  ["corgi_up_idle",  "corgi_up_walk0",  "corgi_up_walk1",  "corgi_up_walk2",  "corgi_up_walk3",  "corgi_up_bark"],
  ["corgi_side_idle","corgi_side_walk0","corgi_side_walk1","corgi_side_walk2","corgi_side_walk3","corgi_side_bark"],
  ["sheep_down_idle","sheep_down_walk0","sheep_down_walk1","sheep_down_walk2","sheep_down_walk3","sheep_down_graze"],
  ["sheep_up_idle",  "sheep_up_walk0",  "sheep_up_walk1",  "sheep_up_walk2",  "sheep_up_walk3",  "sheep_up_graze"],
  ["sheep_side_idle","sheep_side_walk0","sheep_side_walk1","sheep_side_walk2","sheep_side_walk3","sheep_side_graze"],
  ["grass_lush","grass_med","grass_grazed","dirt","water","water_edge"],
  ["tree","boulder","rock","fence_post","fence_rail","gate_post"],
  ["bone","bark_ring","dust","shadow","sparkle",""],
];

// Source sheet geometry
const SRC_COLS = 6;
const SRC_ROWS = 9;
const SRC_W    = 2880;
const SRC_H    = 2880;
const CELL_W   = SRC_W / SRC_COLS; // 480
const CELL_H   = SRC_H / SRC_ROWS; // 320

// Output frame size (nearest-neighbour downscale to 32×32)
const FRAME = 32;
const TOL   = 30; // colour tolerance for checkerboard key-out

if (!existsSync(ASSET_PATH)) {
  console.error(`slice-sheet: asset0.png not found at ${ASSET_PATH}`);
  console.error("Set ASSET0 env var to the correct path, or run gen-sprites.mjs instead.");
  process.exit(1);
}

// ── Load source sheet ────────────────────────────────────────────────────────
const srcImg = await loadImage(ASSET_PATH);
const srcCanvas = createCanvas(SRC_W, SRC_H);
const srcCtx    = srcCanvas.getContext("2d");
srcCtx.drawImage(srcImg, 0, 0);
const srcData = srcCtx.getImageData(0, 0, SRC_W, SRC_H);
const px = srcData.data; // Uint8ClampedArray, RGBA

// ── Identify checker tones from corners ─────────────────────────────────────
function sampleAt(x, y) {
  const i = (y * SRC_W + x) * 4;
  return [px[i], px[i+1], px[i+2]];
}
const samples = [
  sampleAt(0, 0),
  sampleAt(SRC_W - 1, 0),
  sampleAt(0, SRC_H - 1),
  sampleAt(SRC_W - 1, SRC_H - 1),
];
// Deduplicate into at most 2 checker tones (corners alternate)
const tones = [samples[0]];
for (const s of samples.slice(1)) {
  const distinct = tones.every(t =>
    Math.abs(s[0] - t[0]) > TOL || Math.abs(s[1] - t[1]) > TOL || Math.abs(s[2] - t[2]) > TOL
  );
  if (distinct && tones.length < 2) tones.push(s);
}
console.log(`slice-sheet: detected ${tones.length} checker tone(s):`, tones.map(t => `rgb(${t.join(",")})`));

function isChecker(r, g, b) {
  return tones.some(t =>
    Math.abs(r - t[0]) <= TOL &&
    Math.abs(g - t[1]) <= TOL &&
    Math.abs(b - t[2]) <= TOL,
  );
}

// ── Flood-fill key-out from borders ─────────────────────────────────────────
// Mark pixels transparent if they are checker-coloured and reachable from border.
const visited = new Uint8Array(SRC_W * SRC_H);
const queue   = [];

for (let x = 0; x < SRC_W; x++) {
  queue.push(x, 0);
  queue.push(x, SRC_H - 1);
}
for (let y = 1; y < SRC_H - 1; y++) {
  queue.push(0, y);
  queue.push(SRC_W - 1, y);
}

let qi = 0;
while (qi < queue.length) {
  const x = queue[qi++];
  const y = queue[qi++];
  if (x < 0 || x >= SRC_W || y < 0 || y >= SRC_H) continue;
  const idx = y * SRC_W + x;
  if (visited[idx]) continue;
  visited[idx] = 1;
  const pi = idx * 4;
  if (!isChecker(px[pi], px[pi+1], px[pi+2])) continue;
  px[pi+3] = 0; // set transparent
  queue.push(x+1, y, x-1, y, x, y+1, x, y-1);
}

// ── Cut cells, downscale, pack ───────────────────────────────────────────────
const OUT_COLS = SRC_COLS;
const OUT_ROWS = SRC_ROWS;
const sheetCanvas = createCanvas(OUT_COLS * FRAME, OUT_ROWS * FRAME);
const sheetCtx    = sheetCanvas.getContext("2d");
sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);

const frames = {};

for (let row = 0; row < OUT_ROWS; row++) {
  for (let col = 0; col < OUT_COLS; col++) {
    const name = FRAME_GRID[row][col];
    if (!name) continue;

    // Copy keyed cell to a temp canvas at source resolution
    const cellCanvas = createCanvas(CELL_W, CELL_H);
    const cellCtx    = cellCanvas.getContext("2d");
    cellCtx.putImageData(srcData, -(col * CELL_W), -(row * CELL_H), col * CELL_W, row * CELL_H, CELL_W, CELL_H);

    // Downscale to FRAME×FRAME using nearest-neighbour (imageSmoothingEnabled=false)
    const dx = col * FRAME;
    const dy = row * FRAME;
    sheetCtx.imageSmoothingEnabled = false;
    sheetCtx.drawImage(cellCanvas, 0, 0, CELL_W, CELL_H, dx, dy, FRAME, FRAME);

    frames[name] = {
      frame:           { x: dx, y: dy, w: FRAME, h: FRAME },
      rotated:         false,
      trimmed:         false,
      spriteSourceSize:{ x: 0, y: 0, w: FRAME, h: FRAME },
      sourceSize:      { w: FRAME, h: FRAME },
    };
  }
}

const json = {
  frames,
  meta: {
    image:  "sprites.png",
    format: "RGBA8888",
    size:   { w: OUT_COLS * FRAME, h: OUT_ROWS * FRAME },
    scale:  "1",
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "sprites.json"), JSON.stringify(json, null, 2));

const buf = sheetCanvas.toBuffer("image/png");
writeFileSync(join(OUT_DIR, "sprites.png"), buf);

console.log(`slice-sheet: wrote sprites.png (${OUT_COLS * FRAME}×${OUT_ROWS * FRAME}) and sprites.json (${Object.keys(frames).length} frames)`);
```

- [ ] **Step 4: Smoke — run gen-sprites and verify JSON**

From the repo root:

```bash
cd packages/game && npm run gen:sprites && cd ../..
```

Expected output: `gen-sprites: wrote sprites.png (192×288) and sprites.json (53 frames)`

Verify the JSON contains the expected frame names:

```bash
jq '.frames | keys | length' packages/game/public/assets/sprites.json
# expected: 53

jq '.frames | has("corgi_down_idle")' packages/game/public/assets/sprites.json
# expected: true

jq '.frames | has("shadow")' packages/game/public/assets/sprites.json
# expected: true

jq '.frames | has("sheep_side_graze")' packages/game/public/assets/sprites.json
# expected: true
```

- [ ] **Step 5: Smoke — run slice-sheet and verify JSON**

```bash
cd packages/game && npm run slice:sheet && cd ../..
```

Expected output: `slice-sheet: wrote sprites.png (192×288) and sprites.json (53 frames)`

```bash
jq '.frames | keys | length' packages/game/public/assets/sprites.json
# expected: 53
```

- [ ] **Step 6: Commit**

```bash
git add packages/game/tools/gen-sprites.mjs packages/game/tools/slice-sheet.mjs packages/game/public/assets/
git commit -m "Add gen-sprites and slice-sheet atlas tools with smoke verification"
```

---

### Task 4: AnimationSystem

**Files:**
- Create: `packages/game/src/render/AnimationSystem.ts`
- Create: `packages/game/src/render/AnimationSystem.test.ts`

[TDD — pure, no Pixi]

`AnimationSystem` is a **pure function** (or a tiny stateless object). Given the entity's render-relevant state plus a timer accumulator and dt, it returns `{ frame: string, flipX: boolean }`. The caller (RenderSystem) owns the timer per entity and passes it in.

Input record:

```ts
interface AnimInput {
  kind:    EntityKind;   // "dog" | "sheep"
  moving:  boolean;      // true if speed > MOVE_THRESHOLD (e.g. 2 px/s)
  penned:  boolean;      // sheep only — grazing when penned+idle
  barking: boolean;      // dog only
  grazing: boolean;      // sheep: in graze state (hunger top drive + on lush cell)
  facing:  Direction;
  timer:   number;       // accumulated seconds; caller advances this
  dt:      number;
}
```

Output: `{ frame: string, flipX: boolean }`.

Walk-cycle selection: `walk0..3` at `FRAME_DURATION.WALK` seconds each → index `Math.floor(timer / WALK) % 4`.

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/render/AnimationSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectFrame } from "./AnimationSystem.js";
import { FRAME_DURATION } from "../config.js";

const W = FRAME_DURATION.WALK; // 0.12 s per walk frame

describe("selectFrame — idle (not moving, not barking, not grazing)", () => {
  it("returns *_down_idle for a stopped dog facing down", () => {
    const result = selectFrame({
      kind: "dog", moving: false, penned: false, barking: false, grazing: false,
      facing: "down", timer: 0, dt: 0,
    });
    expect(result.frame).toBe("corgi_down_idle");
    expect(result.flipX).toBe(false);
  });

  it("returns *_up_idle for a stopped sheep facing up", () => {
    const result = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: false,
      facing: "up", timer: 0, dt: 0,
    });
    expect(result.frame).toBe("sheep_up_idle");
    expect(result.flipX).toBe(false);
  });
});

describe("selectFrame — walk cycle", () => {
  it("returns walk0 at timer=0", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk0");
  });

  it("returns walk1 at timer=1×W", () => {
    const r = selectFrame({
      kind: "sheep", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: W, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_walk1");
  });

  it("returns walk3 at timer=3×W", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 3 * W, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk3");
  });

  it("wraps: timer=4×W returns walk0 again", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 4 * W, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk0");
  });

  it("wraps fractionally: timer=4.5×W returns walk0", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 4.5 * W, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk0");
  });
});

describe("selectFrame — bark", () => {
  it("returns *_bark when dog is barking (overrides motion)", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: true, grazing: false,
      facing: "up", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("corgi_up_bark");
  });

  it("returns idle (not bark) for sheep even if barking=true", () => {
    // sheep don't bark; barking flag is ignored for sheep
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: true, grazing: false,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_idle");
  });
});

describe("selectFrame — graze", () => {
  it("returns sheep_down_graze when grazing and facing down", () => {
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: true,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_graze");
  });

  it("graze overrides idle but not motion — moving sheep does not graze", () => {
    // a moving sheep is walking, not grazing, even if grazing=true
    const r = selectFrame({
      kind: "sheep", moving: true, penned: false, barking: false, grazing: true,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_walk0");
  });
});

describe("selectFrame — side mirroring", () => {
  it("right-facing side: flipX=false", () => {
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: false,
      facing: "right", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_side_idle");
    expect(r.flipX).toBe(false);
  });

  it("left-facing side: same frame, flipX=true", () => {
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: false,
      facing: "left", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_side_idle");
    expect(r.flipX).toBe(true);
  });

  it("left-facing dog walking: side walk frame, flipX=true", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "left", timer: W, dt: 0,
    });
    expect(r.frame).toBe("corgi_side_walk1");
    expect(r.flipX).toBe(true);
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
npx vitest run packages/game/src/render/AnimationSystem.test.ts
```

Expected: FAIL — cannot resolve `./AnimationSystem.js`.

- [ ] **Step 3: Implement `packages/game/src/render/AnimationSystem.ts`**

```ts
import { frameName, frameFlipX } from "../atlas/frames.js";
import type { EntityKind, AnimState } from "../atlas/frames.js";
import type { Direction } from "@getback/motor";
import { FRAME_DURATION } from "../config.js";

export interface AnimInput {
  kind:    EntityKind;
  moving:  boolean;
  penned:  boolean;   // reserved: penned sheep can have a calm idle later
  barking: boolean;
  grazing: boolean;
  facing:  Direction;
  timer:   number;    // accumulated seconds owned by caller
  dt:      number;
}

export interface AnimOutput {
  frame: string;
  flipX: boolean;
}

const WALK_FRAMES = 4;

/** Pure — no Pixi, no side effects. */
export function selectFrame(input: AnimInput): AnimOutput {
  const { kind, moving, barking, grazing, facing, timer } = input;

  let state: AnimState;

  if (kind === "dog" && barking) {
    state = "bark";
  } else if (moving) {
    const idx = Math.floor(timer / FRAME_DURATION.WALK) % WALK_FRAMES;
    state = `walk${idx}` as AnimState;
  } else if (kind === "sheep" && grazing) {
    state = "graze";
  } else {
    state = "idle";
  }

  return {
    frame: frameName(kind, state, facing),
    flipX: frameFlipX(facing),
  };
}
```

- [ ] **Step 4: Run + verify PASS**

```bash
npx vitest run packages/game/src/render/AnimationSystem.test.ts
```

Expected: PASS — all tests green.

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/render/AnimationSystem.ts packages/game/src/render/AnimationSystem.test.ts
git commit -m "Add pure AnimationSystem: entity state to atlas frame selection"
```

---

### Task 5: Letterbox math

**Files:**
- Create: `packages/game/src/render/letterbox.ts`
- Create: `packages/game/src/render/letterbox.test.ts`

[TDD — pure math, no Pixi]

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/render/letterbox.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeLetterbox } from "./letterbox.js";

describe("computeLetterbox", () => {
  it("exact fit: scale=1, no offset", () => {
    const r = computeLetterbox(480, 270, 480, 270);
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it("2× window: scale=2, no offset", () => {
    const r = computeLetterbox(960, 540, 480, 270);
    expect(r.scale).toBe(2);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it("wide window (1920×1080): scale=4, centered horizontally", () => {
    // 1920/480=4, 1080/270=4 — perfect 4×; no bars
    const r = computeLetterbox(1920, 1080, 480, 270);
    expect(r.scale).toBe(4);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it("extra-wide window adds horizontal bars (pillarbox)", () => {
    // 1280×720 window: height-limited → 720/270=2.66 → floor=2; width bars
    const r = computeLetterbox(1280, 720, 480, 270);
    expect(r.scale).toBe(2);
    // logical canvas: 960 wide, centered in 1280 → offsetX = (1280-960)/2 = 160
    expect(r.offsetX).toBe(160);
    expect(r.offsetY).toBe(90);
  });

  it("tall window adds vertical bars (letterbox)", () => {
    // 480×800 window: width-limited → 480/480=1; height bars
    const r = computeLetterbox(480, 800, 480, 270);
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(0);
    // logical canvas: 270 tall, centered in 800 → offsetY = (800-270)/2 = 265
    expect(r.offsetY).toBe(265);
  });

  it("scale is always a positive integer ≥ 1", () => {
    const r = computeLetterbox(100, 100, 480, 270);
    expect(r.scale).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(r.scale)).toBe(true);
  });

  it("offsets are non-negative integers", () => {
    const r = computeLetterbox(1280, 720, 480, 270);
    expect(r.offsetX).toBeGreaterThanOrEqual(0);
    expect(r.offsetY).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r.offsetX)).toBe(true);
    expect(Number.isInteger(r.offsetY)).toBe(true);
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
npx vitest run packages/game/src/render/letterbox.test.ts
```

Expected: FAIL — cannot resolve `./letterbox.js`.

- [ ] **Step 3: Implement `packages/game/src/render/letterbox.ts`**

```ts
export interface LetterboxResult {
  scale:   number; // integer ≥ 1
  offsetX: number; // px from left edge of the window to the logical canvas left
  offsetY: number; // px from top edge of the window to the logical canvas top
}

/**
 * Pure. Computes an integer nearest-neighbour letterbox scale and centering
 * offsets so the logical canvas (logicalW × logicalH) fills the window as
 * large as possible without cropping or fractional scaling.
 *
 * Scale is always ≥ 1 (never shrinks below the logical size — if the window
 * is smaller than logical, scale=1 and the canvas overflows, which is a
 * degenerate case for a desktop game).
 */
export function computeLetterbox(
  winW:     number,
  winH:     number,
  logicalW: number,
  logicalH: number,
): LetterboxResult {
  const scaleX = Math.floor(winW / logicalW);
  const scaleY = Math.floor(winH / logicalH);
  const scale  = Math.max(1, Math.min(scaleX, scaleY));

  const scaledW = logicalW * scale;
  const scaledH = logicalH * scale;

  const offsetX = Math.floor((winW - scaledW) / 2);
  const offsetY = Math.floor((winH - scaledH) / 2);

  return { scale, offsetX, offsetY };
}
```

- [ ] **Step 4: Run + verify PASS**

```bash
npx vitest run packages/game/src/render/letterbox.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/render/letterbox.ts packages/game/src/render/letterbox.test.ts
git commit -m "Add pure computeLetterbox with TDD"
```

---

### Task 6: RenderSystem — diff logic (TDD) + Pixi factory

**Files:**
- Create: `packages/game/src/render/RenderSystem.ts`
- Create: `packages/game/src/render/RenderSystem.test.ts`

[TDD on diff logic; Pixi factory is smoke/manual verify]

The **diff logic** (add/remove/position) is tested headless by injecting a `SpriteLike` factory. The **Pixi production factory** (`createPixiSprite`) is wired in `Runner.ts` and verified manually.

**Design:**

```
SpriteLike interface {
  x: number;
  y: number;
  zIndex: number;
  scaleX: number;    // sign encodes flipX
  texture: string;   // frame name (fake tracks this as a string)
  shadowY: number;   // shadow sprite's y offset from entity
  destroy(): void;
}

SpriteFactory = (frameName: string) => { entity: SpriteLike; shadow: SpriteLike }

RenderSystem {
  constructor(factory: SpriteFactory, container: ContainerLike)
  sync(world: World, animTimers: Map<Mobile, number>, dt: number): void
}
```

`animTimers` is a `Map<Mobile, number>` owned by the caller (Runner), advanced by `dt` each frame. `RenderSystem.sync()` uses `AnimationSystem.selectFrame()` to pick the frame per entity, then writes to its `SpriteLike`.

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/render/RenderSystem.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { RenderSystem } from "./RenderSystem.js";
import type { SpriteLike, SpriteFactory } from "./RenderSystem.js";
import type { Mobile } from "@getback/motor";
import type { World } from "@getback/motor";
import { createWorld, createSheep, defaultSheepTraits, createDog } from "@getback/motor";

// ── Fake sprite factory (no Pixi) ────────────────────────────────────────────
function makeFakeSprite(): SpriteLike {
  return { x: 0, y: 0, zIndex: 0, scaleX: 1, texture: "", shadowY: 0, destroyed: false,
    destroy() { (this as any).destroyed = true; } };
}

const fakePairs: Array<{ entity: SpriteLike; shadow: SpriteLike }> = [];

const fakeFactory: SpriteFactory = (_name: string) => {
  const pair = { entity: makeFakeSprite(), shadow: makeFakeSprite() };
  fakePairs.push(pair);
  return pair;
};

// ── ContainerLike stub ───────────────────────────────────────────────────────
interface ContainerLike {
  addChild(...s: SpriteLike[]): void;
  removeChild(...s: SpriteLike[]): void;
}

function makeContainer(): ContainerLike & { children: SpriteLike[] } {
  const children: SpriteLike[] = [];
  return {
    children,
    addChild(...s: SpriteLike[]) { children.push(...s); },
    removeChild(...s: SpriteLike[]) {
      for (const sp of s) {
        const i = children.indexOf(sp);
        if (i >= 0) children.splice(i, 1);
      }
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sheep(x: number, y: number) {
  const s = createSheep({ x, y }, defaultSheepTraits());
  return s;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("RenderSystem — diff", () => {
  let container: ReturnType<typeof makeContainer>;
  let rs: RenderSystem;
  let timers: Map<Mobile, number>;

  beforeEach(() => {
    fakePairs.length = 0;
    container = makeContainer();
    rs = new RenderSystem(fakeFactory, container);
    timers = new Map();
  });

  it("creates a sprite pair for a new sheep on first sync", () => {
    const s = sheep(100, 200);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs.length).toBe(1);
    expect(container.children).toContain(fakePairs[0]!.entity);
    expect(container.children).toContain(fakePairs[0]!.shadow);
  });

  it("does not create a duplicate sprite for the same entity on subsequent syncs", () => {
    const s = sheep(100, 200);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs.length).toBe(1);
  });

  it("destroys sprite pair when entity is removed from the world", () => {
    const s = sheep(100, 200);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    const pair = fakePairs[0]!;

    world.sheep.length = 0; // entity removed
    rs.sync(world, timers, 1 / 60);

    expect((pair.entity as any).destroyed).toBe(true);
    expect((pair.shadow as any).destroyed).toBe(true);
    expect(container.children).not.toContain(pair.entity);
  });

  it("copies entity pos to sprite x/y", () => {
    const s = sheep(123, 456);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.x).toBe(123);
    expect(fakePairs[0]!.entity.y).toBe(456);
  });

  it("sets zIndex from entity y (depth sort)", () => {
    const s = sheep(0, 99);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.zIndex).toBe(99);
  });

  it("sets scaleX=-1 for left-facing entity (flipX)", () => {
    const s = sheep(50, 50);
    s.facing = "left";
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.scaleX).toBe(-1);
  });

  it("sets scaleX=+1 for right-facing entity (no flip)", () => {
    const s = sheep(50, 50);
    s.facing = "right";
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.scaleX).toBe(1);
  });

  it("creates sprite for dog when world.dog is set", () => {
    const dog = createDog({ x: 240, y: 135 });
    const world = createWorld([], undefined, [], null, dog) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs.length).toBe(1);
    expect(fakePairs[0]!.entity.x).toBe(240);
  });

  it("advances anim timer per entity by dt", () => {
    const s = sheep(50, 50);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 0.1);
    expect(timers.get(s)).toBeCloseTo(0.1);
    rs.sync(world, timers, 0.05);
    expect(timers.get(s)).toBeCloseTo(0.15);
  });

  it("removes timer when entity departs", () => {
    const s = sheep(50, 50);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 0.1);
    expect(timers.has(s)).toBe(true);
    world.sheep.length = 0;
    rs.sync(world, timers, 0);
    expect(timers.has(s)).toBe(false);
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
npx vitest run packages/game/src/render/RenderSystem.test.ts
```

Expected: FAIL — cannot resolve `./RenderSystem.js`.

- [ ] **Step 3: Implement `packages/game/src/render/RenderSystem.ts`**

```ts
import type { Mobile, World } from "@getback/motor";
import { selectFrame } from "./AnimationSystem.js";
import type { EntityKind } from "../atlas/frames.js";
import { SHADOW_OFFSET_Y } from "../config.js";

// ── SpriteLike ───────────────────────────────────────────────────────────────
// A minimal interface so the diff logic is testable without real Pixi Sprites.
// The production factory returns Pixi Sprites (which satisfy this interface).
export interface SpriteLike {
  x:        number;
  y:        number;
  zIndex:   number;
  scaleX:   number;   // +1 or -1; callers set sprite.scale.x in prod
  texture:  string;   // frame name; production impl swaps the actual Texture
  shadowY:  number;
  destroy(): void;
}

// ── SpriteFactory ────────────────────────────────────────────────────────────
// Injected: creates an entity sprite + shadow sprite and returns both.
// Production impl: creates real Pixi Sprites from the loaded spritesheet.
export type SpriteFactory = (frameName: string) => { entity: SpriteLike; shadow: SpriteLike };

// ── ContainerLike ────────────────────────────────────────────────────────────
export interface ContainerLike {
  addChild(...s: SpriteLike[]): void;
  removeChild(...s: SpriteLike[]): void;
}

// ── Internal record per entity ───────────────────────────────────────────────
interface EntityRecord {
  entity: SpriteLike;
  shadow: SpriteLike;
}

// ── RenderSystem ─────────────────────────────────────────────────────────────
export class RenderSystem {
  private readonly sprites = new Map<Mobile, EntityRecord>();
  private readonly factory: SpriteFactory;
  private readonly container: ContainerLike;

  constructor(factory: SpriteFactory, container: ContainerLike) {
    this.factory   = factory;
    this.container = container;
  }

  /**
   * Sync the sprite map with the current world state.
   * @param world    - motor World (read-only from render perspective)
   * @param timers   - anim timer accumulator, keyed by entity identity; caller owns this Map
   * @param dt       - seconds since last frame
   */
  sync(world: World, timers: Map<Mobile, number>, dt: number): void {
    // Collect all current mobiles
    const current = new Set<Mobile>();
    for (const s of world.sheep) current.add(s);
    if (world.dog) current.add(world.dog);

    // Remove departed entities
    for (const [mobile, rec] of this.sprites) {
      if (!current.has(mobile)) {
        this.container.removeChild(rec.entity, rec.shadow);
        rec.entity.destroy();
        rec.shadow.destroy();
        this.sprites.delete(mobile);
        timers.delete(mobile);
      }
    }

    // Add + update entities
    for (const mobile of current) {
      // Advance timer
      const prevTimer = timers.get(mobile) ?? 0;
      const timer     = prevTimer + dt;
      timers.set(mobile, timer);

      // Determine kind
      const kind: EntityKind = world.dog === mobile ? "dog" : "sheep";

      // Compute animation state
      const sheep = kind === "sheep" ? (mobile as import("@getback/motor").Sheep) : null;
      const dog   = kind === "dog"   ? (mobile as import("@getback/motor").Dog)   : null;

      const speed   = Math.hypot(mobile.vel.x, mobile.vel.y);
      const moving  = speed > 2;
      const barking = dog ? dog.barkCooldown > 0 : false;
      const penned  = sheep ? sheep.penned : false;
      const grazing = sheep ? (sheep.drives.hunger > 0.5 && !moving) : false;

      const anim = selectFrame({
        kind,
        moving,
        penned,
        barking,
        grazing,
        facing: mobile.facing,
        timer,
        dt,
      });

      // Create sprite if new
      if (!this.sprites.has(mobile)) {
        const pair = this.factory(anim.frame);
        this.sprites.set(mobile, pair);
        this.container.addChild(pair.entity, pair.shadow);
      }

      const rec = this.sprites.get(mobile)!;

      // Copy position and depth
      rec.entity.x      = mobile.pos.x;
      rec.entity.y      = mobile.pos.y;
      rec.entity.zIndex = mobile.pos.y;
      rec.entity.scaleX = anim.flipX ? -1 : 1;
      rec.entity.texture = anim.frame;

      // Shadow: same x, slightly below entity
      rec.shadow.x      = mobile.pos.x;
      rec.shadow.y      = mobile.pos.y + SHADOW_OFFSET_Y;
      rec.shadow.zIndex = mobile.pos.y - 0.5; // just behind entity
    }
  }
}
```

- [ ] **Step 4: Run + verify PASS**

```bash
npx vitest run packages/game/src/render/RenderSystem.test.ts
```

Expected: PASS — all tests green.

```bash
npm test
```

Expected: entire suite green (including prior motor tests).

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/render/RenderSystem.ts packages/game/src/render/RenderSystem.test.ts
git commit -m "Add RenderSystem with injected factory and TDD diff logic"
```

---

### Task 7: GrassRenderer — density→frame (TDD) + tile placement (Pixi, manual)

**Files:**
- Create: `packages/game/src/render/GrassRenderer.ts`
- Create: `packages/game/src/render/GrassRenderer.test.ts`

[TDD for pure density→frame mapping; tile placement is Pixi — manual verify]

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/render/GrassRenderer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { densityToFrame } from "./GrassRenderer.js";

describe("densityToFrame", () => {
  it("density 1.0 → grass_lush", () => {
    expect(densityToFrame(1.0)).toBe("grass_lush");
  });

  it("density 0.75 → grass_lush (at threshold)", () => {
    expect(densityToFrame(0.75)).toBe("grass_lush");
  });

  it("density 0.74 → grass_med (just below lush threshold)", () => {
    expect(densityToFrame(0.74)).toBe("grass_med");
  });

  it("density 0.40 → grass_med (at threshold)", () => {
    expect(densityToFrame(0.40)).toBe("grass_med");
  });

  it("density 0.39 → grass_grazed (just below med threshold)", () => {
    expect(densityToFrame(0.39)).toBe("grass_grazed");
  });

  it("density 0.10 → grass_grazed (at grazed threshold)", () => {
    expect(densityToFrame(0.10)).toBe("grass_grazed");
  });

  it("density 0.09 → dirt (below grazed threshold)", () => {
    expect(densityToFrame(0.09)).toBe("dirt");
  });

  it("density 0.0 → dirt", () => {
    expect(densityToFrame(0)).toBe("dirt");
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
npx vitest run packages/game/src/render/GrassRenderer.test.ts
```

Expected: FAIL — cannot resolve `./GrassRenderer.js`.

- [ ] **Step 3: Implement `packages/game/src/render/GrassRenderer.ts`**

```ts
import type { GrassField } from "@getback/motor";
import { densityAt } from "@getback/motor";
import { GRASS_THRESHOLD } from "../config.js";

// ── Pure density→frame mapping (TDD) ─────────────────────────────────────────

/**
 * Maps a grass density value in [0..1] to an atlas frame name.
 * Thresholds are defined in config.ts.
 */
export function densityToFrame(density: number): string {
  if (density >= GRASS_THRESHOLD.LUSH)   return "grass_lush";
  if (density >= GRASS_THRESHOLD.MED)    return "grass_med";
  if (density >= GRASS_THRESHOLD.GRAZED) return "grass_grazed";
  return "dirt";
}

// ── GrassRenderer (Pixi — manual verify) ─────────────────────────────────────
// Renders the grass field as a grid of sprites, one per cell.
// Each frame, densityToFrame() picks the tile; Sprite.texture is swapped.
//
// NOTE: This class imports Pixi types. It is NOT covered by unit tests.
// Correctness is verified visually when Runner.ts mounts a world.

import { Sprite, Container, Texture, Assets } from "pixi.js";

export class GrassRenderer {
  private readonly tiles: Sprite[][] = [];
  private readonly container: Container;
  private initialized = false;

  constructor(container: Container) {
    this.container = container;
  }

  /** Call once after the spritesheet is loaded. */
  init(field: GrassField): void {
    if (this.initialized) return;
    this.initialized = true;

    for (let row = 0; row < field.rows; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < field.cols; col++) {
        const density = field.density[row * field.cols + col] ?? 1;
        const frame   = densityToFrame(density);
        const sprite  = new Sprite(Texture.from(frame));
        sprite.x      = col * field.cellSize;
        sprite.y      = row * field.cellSize;
        sprite.width  = field.cellSize;
        sprite.height = field.cellSize;
        this.container.addChild(sprite);
        this.tiles[row]![col] = sprite;
      }
    }
  }

  /** Call each frame to update tile textures to match current grass density. */
  update(field: GrassField): void {
    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        const density = field.density[row * field.cols + col] ?? 1;
        const frame   = densityToFrame(density);
        const sprite  = this.tiles[row]?.[col];
        if (sprite) {
          sprite.texture = Texture.from(frame);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run + verify PASS (pure part)**

```bash
npx vitest run packages/game/src/render/GrassRenderer.test.ts
```

Expected: PASS — 8 tests green (only the pure `densityToFrame` tests run; the `GrassRenderer` class is not exercised by unit tests).

```bash
npm run typecheck
```

Expected: exit 0. (Pixi types resolve because `pixi.js` is in `package.json`.)

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/render/GrassRenderer.ts packages/game/src/render/GrassRenderer.test.ts
git commit -m "Add GrassRenderer: TDD density-to-frame mapping, Pixi tile layer"
```

---

### Task 8: Runner + mount() + barrel

**Files:**
- Create: `packages/game/src/Runner.ts`
- Modify: `packages/game/src/index.ts`

[Pixi boot — manual verify; letterbox math already TDD'd in Task 5]

The `Runner` boots a Pixi `Application` with:
- `roundPixels: true`
- `TextureSource.defaultOptions.scaleMode = "nearest"` (set globally before `Assets.load`)
- Logical 480×270 renderer; integer letterbox centering applied via `app.stage.position` + `app.stage.scale`
- Layer `Container`s with `sortableChildren = true` on the entities layer
- A `Ticker` callback: `game.update(dt, opts.input?.())` → `renderSystem.sync(world, timers, dt)`

The production `SpriteFactory` creates real Pixi `Sprite` objects from `Texture.from(frameName)`.

- [ ] **Step 1: Implement `packages/game/src/Runner.ts`**

```ts
// Runner.ts — boots Pixi, loads the atlas, drives the render+simulation loop.
// This file imports pixi.js; it must NEVER be imported by @getback/motor.
//
// [manual verify]: run an example app that calls mount() and confirm the
// canvas appears, sprites render, and the simulation updates.

import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
  TextureSource,
} from "pixi.js";

import { Game } from "@getback/motor";
import type { World, Mobile, DogIntent } from "@getback/motor";

import { LOGICAL_W, LOGICAL_H, LAYER, SHADOW_OFFSET_Y } from "./config.js";
import { computeLetterbox } from "./render/letterbox.js";
import { RenderSystem } from "./render/RenderSystem.js";
import type { SpriteLike, SpriteFactory, ContainerLike } from "./render/RenderSystem.js";
import { GrassRenderer } from "./render/GrassRenderer.js";

export interface MountOptions {
  /** HTMLElement to append the Pixi canvas to. Default: document.body */
  container?: HTMLElement;
  /** Called each tick to feed the dog's intent; omitted → neutral intent */
  input?: () => DogIntent;
  /** Path to sprites.json (default: "./assets/sprites.json") */
  atlasPath?: string;
}

// ── Production SpriteLike adapter ────────────────────────────────────────────
// Wraps a Pixi Sprite to satisfy the SpriteLike interface.
class PixiSpriteLike implements SpriteLike {
  constructor(private readonly sprite: Sprite) {}

  get x()       { return this.sprite.x; }
  set x(v)      { this.sprite.x = v; }

  get y()       { return this.sprite.y; }
  set y(v)      { this.sprite.y = v; }

  get zIndex()  { return this.sprite.zIndex; }
  set zIndex(v) { this.sprite.zIndex = v; }

  get scaleX()  { return this.sprite.scale.x; }
  set scaleX(v) { this.sprite.scale.x = v; }

  get texture() { return this.sprite.texture.label ?? ""; }
  set texture(name: string) {
    const t = Texture.from(name);
    if (this.sprite.texture !== t) this.sprite.texture = t;
  }

  get shadowY() { return this.sprite.y; }
  set shadowY(v) { this.sprite.y = v; }

  destroy() { this.sprite.destroy(); }
}

// ── Production container adapter ─────────────────────────────────────────────
class PixiContainerLike implements ContainerLike {
  constructor(private readonly c: Container) {}

  addChild(...sprites: SpriteLike[]) {
    for (const s of sprites) {
      const raw = (s as PixiSpriteLike & { sprite?: Sprite })["sprite"];
      if (raw) this.c.addChild(raw);
    }
  }

  removeChild(...sprites: SpriteLike[]) {
    for (const s of sprites) {
      const raw = (s as PixiSpriteLike & { sprite?: Sprite })["sprite"];
      if (raw) this.c.removeChild(raw);
    }
  }
}

// ── mount() — public entry point ─────────────────────────────────────────────
/**
 * Boot Pixi, load the atlas, and start the game loop.
 * Returns the Pixi `Application` so callers can inspect or stop it.
 * Called by a runnable app's main.ts:
 *
 *   import { mount } from "@getback/game";
 *   const world = createWorld([...sheep], ...);
 *   const { app } = await mount(world, { input: () => intent, container: el });
 */
export async function mount(world: World, opts: MountOptions = {}): Promise<{ app: Application }> {
  const atlasPath = opts.atlasPath ?? "./assets/sprites.json";

  // ── 1. Set nearest-neighbour globally (before any texture load) ────────────
  TextureSource.defaultOptions.scaleMode = "nearest";

  // ── 2. Boot Pixi Application ───────────────────────────────────────────────
  const app = new Application();
  await app.init({
    width:       LOGICAL_W,
    height:      LOGICAL_H,
    roundPixels: true,
    backgroundColor: 0x3a7d44,  // pasture green fallback
    autoStart:   false,         // we drive the ticker manually
  });

  // ── 3. Mount canvas ────────────────────────────────────────────────────────
  const mountTarget: HTMLElement = opts.container ?? document.body;
  mountTarget.appendChild(app.canvas);

  // ── 4. Apply integer letterbox on resize ──────────────────────────────────
  function applyLetterbox() {
    const { scale, offsetX, offsetY } = computeLetterbox(
      window.innerWidth, window.innerHeight, LOGICAL_W, LOGICAL_H,
    );
    app.stage.scale.set(scale);
    app.stage.position.set(offsetX, offsetY);
    app.renderer.resize(window.innerWidth, window.innerHeight);
  }
  applyLetterbox();
  window.addEventListener("resize", applyLetterbox);

  // ── 5. Build layer containers ─────────────────────────────────────────────
  const terrainLayer  = new Container();
  const propsLayer    = new Container();
  const entitiesLayer = new Container();
  const fxLayer       = new Container();
  const hudLayer      = new Container();

  terrainLayer.zIndex  = LAYER.TERRAIN;
  propsLayer.zIndex    = LAYER.PROPS;
  entitiesLayer.zIndex = LAYER.ENTITIES;
  fxLayer.zIndex       = LAYER.FX;
  hudLayer.zIndex      = LAYER.HUD;

  entitiesLayer.sortableChildren = true;

  app.stage.sortableChildren = true;
  app.stage.addChild(terrainLayer, propsLayer, entitiesLayer, fxLayer, hudLayer);

  // ── 6. Load atlas ─────────────────────────────────────────────────────────
  await Assets.load(atlasPath);

  // ── 7. Initialize GrassRenderer ──────────────────────────────────────────
  const grassRenderer = new GrassRenderer(terrainLayer);
  grassRenderer.init(world.grass);

  // ── 8. Build production SpriteFactory ────────────────────────────────────
  const shadowTexture = Texture.from("shadow");

  const factory: SpriteFactory = (frameName: string) => {
    const entitySprite = new Sprite(Texture.from(frameName));
    entitySprite.anchor.set(0.5, 1); // feet-anchored

    const shadowSprite = new Sprite(shadowTexture);
    shadowSprite.anchor.set(0.5, 0.5);
    shadowSprite.scale.set(1, 0.5);  // flatten into ellipse

    return {
      entity: new PixiSpriteLike(entitySprite),
      shadow: new PixiSpriteLike(shadowSprite),
    };
  };

  // ── 9. Build RenderSystem ─────────────────────────────────────────────────
  const containerLike = new PixiContainerLike(entitiesLayer);
  const renderSystem  = new RenderSystem(factory, containerLike);
  const animTimers    = new Map<Mobile, number>();

  // ── 10. Build Game and wire Ticker ───────────────────────────────────────
  const game = new Game(world);

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    game.update(dt, opts.input?.());
    grassRenderer.update(world.grass);
    renderSystem.sync(world, animTimers, dt);
  });

  app.ticker.start();
  return { app };
}
```

- [ ] **Step 2: Update `packages/game/src/index.ts` barrel**

Replace the stub from Task 1 with the full barrel:

```ts
// @getback/game public surface.
export { mount } from "./Runner.js";
export type { MountOptions } from "./Runner.js";
export { computeLetterbox } from "./render/letterbox.js";
export type { LetterboxResult } from "./render/letterbox.js";
export { selectFrame } from "./render/AnimationSystem.js";
export type { AnimInput, AnimOutput } from "./render/AnimationSystem.js";
export { densityToFrame } from "./render/GrassRenderer.js";
export { frameName, frameFlipX, FRAME_GRID, FRAME_NAMES } from "./atlas/frames.js";
export type { EntityKind, AnimState } from "./atlas/frames.js";
export * from "./config.js";
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0. The `Runner.ts` uses Pixi types; since `pixi.js` is in `package.json` and `skipLibCheck: true` is in `tsconfig.base.json`, it should compile. If DOM types are missing (no `lib: ["DOM"]` in tsconfig), add `"lib": ["ES2022", "DOM"]` to `packages/game/tsconfig.json`.

- [ ] **Step 4: Full suite green**

```bash
npm test
```

Expected: all tests pass. `Runner.ts` has no unit tests — it is verified in the next step.

- [ ] **Step 5: Manual verify**

Create a minimal HTML test harness (this is NOT committed as a permanent file — it is a temporary smoke check):

```bash
# From repo root: confirm the package exposes mount correctly
node --input-type=module <<'EOF'
import { computeLetterbox, densityToFrame, frameName } from "./packages/game/src/index.ts";
// Can't run in Node without tsx, so just typecheck is the gate.
// Visual verify is done by the apps/getback example (Plan 17).
EOF
```

The full visual smoke is deferred to Plan 17 (`apps/getback`). At that point: load the page in a browser, confirm the canvas appears, the grass tiles render, sheep sprites move, and the corgi is controllable. Those observations are the `[manual verify]` gate for Task 8.

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/Runner.ts packages/game/src/index.ts
git commit -m "Add Runner mount() bootstrapping Pixi with atlas, layers, and ticker"
```

---

## Self-review

**Scope coverage (§1–§8 of the brief → Tasks 1–8):**

| Brief §          | Task   | Type                              | Status gate                                                                    |
| ---------------- | ------ | --------------------------------- | ------------------------------------------------------------------------------ |
| §1 scaffold      | Task 1 | smoke/compile                     | `npm install && npm run typecheck`                                             |
| §2 atlas table   | Task 2 | TDD                               | `npx vitest run …frames.test.ts`                                               |
| §3 atlas tools   | Task 3 | smoke                             | `npm run gen:sprites` + `jq` checks                                            |
| §4 AnimSystem    | Task 4 | TDD                               | `npx vitest run …AnimationSystem`                                              |
| §5 letterbox     | Task 5 | TDD                               | `npx vitest run …letterbox.test.ts`                                            |
| §6 RenderSystem  | Task 6 | TDD (diff) + manual (factory)     | `npx vitest run …RenderSystem` + visual                                        |
| §7 GrassRenderer | Task 7 | TDD (pure) + manual (Pixi tiles)  | `npx vitest run …GrassRenderer` + visual                                       |
| §8 Runner/mount  | Task 8 | manual verify                     | `npm run typecheck` + Plan 17 visual; returns `Promise<{ app: Application }>` |

**Placeholder scan:** none. Every task contains runnable code, real frame names from §4.2, real motor types (`Mobile`, `Sheep`, `Dog`, `World`, `Direction`), and explicit commands with expected outputs.

**Type consistency:**
- `EntityKind = "dog" | "sheep"` — aligns with `Dog` vs `Sheep` in motor.
- `AnimState` union covers all atlas suffixes: `idle`, `walk0..3`, `bark`, `graze`.
- `Direction = "down" | "up" | "left" | "right"` — imported from `@getback/motor` (re-exported from `types.ts`).
- `Mobile` from `@getback/motor` is the `Map` key in `RenderSystem` and `animTimers`.
- `FRAME_DURATION.WALK = 0.12` — explicit constant, not magic number.
- `GRASS_THRESHOLD` — consumed by both `densityToFrame()` (pure) and config docs.

**Parts that are manual only (no unit tests):**
- `Runner.ts` / `mount()` — Pixi Application boot, Ticker, canvas append, resize handler. Returns `Promise<{ app: Application }>`; input flows through `opts.input?.()` each tick.
- `GrassRenderer.init()` / `.update()` — Pixi Sprite creation and texture swaps.
- `PixiSpriteLike` / `PixiContainerLike` adapters — Pixi bridge; tested implicitly by visual smoke.
- `slice-sheet.mjs` — Node script; smoke-tested via `jq` but pixel output only verified visually.
- `gen-sprites.mjs` — Node script; smoke-tested via `jq` frame-count assertion.

**Motor stays Pixi-free:** confirmed — no file in `packages/motor/**` is modified by this plan. The only new import of `pixi.js` occurs in `packages/game/src/render/GrassRenderer.ts` and `packages/game/src/Runner.ts`.

---

## Next plans

**Plan 17 — `@getback/game`: Input, HUD, FX & the Playable App.** Creates `apps/getback` (the playable browser target), `src/input.ts` (keyboard→`DogIntent` mapper), the HUD layer (stamina bar, flock counter using Pixi `Graphics`), the bark-ring and dust FX (from atlas frames), and wires `GameSignals` (`penFilled`, `barked`) to FX triggers. Also handles the `examples/headless` scenario for CI. Depends on this plan (Plan 16) being merged and `public/assets/sprites.{png,json}` present.
