# GetBack — Corgi Sheep-Herding Game — Design Spec

- **Date:** 2026-06-04
- **Status:** Design approved, ready for implementation planning
- **Stack:** TypeScript + Vite + PixiJS v8, **npm-workspaces monorepo** (foundational libs + headless motor + playable `@getback/game` core + final app + examples)

---

## 1. Vision

**GetBack** is a calm, endless, single-screen pixel-art game. You are a corgi on a
pasture; sheep graze and wander in natural flocks; your job is to pressure and bark
them through a gate into a pen. When the whole flock is penned, they drift off and a
fresh, scattered flock appears with a **newly generated pen shape**. There is no score,
no timer, no win or lose, no menus — opening the page drops you straight into play.

The pleasure of the game is twofold:
1. **Emergent sheep behaviour** that reads as genuinely ovine (not bird-like boids).
2. **Tactile, physical movement** — herding sheep that slide along fences, bunch when
   barked at, and self-organize toward grass and water.

A light "fun layer" (stamina, treats, temporary power-ups) adds pacing and small
decisions without compromising the ambient tone.

### Design pillars
- **Natural, self-organized flocking** — no scripted waypoints; behaviour emerges from drives + social forces + a grass field.
- **Robust physical movement** — force-based steering, corner-safe line collision, continuous collision detection so units never tunnel or pop to the wrong side of a fence.
- **One geometry, many models** — a pen is a single polygon that yields both the containment test and the physics fence.
- **Swappable assets** — a fixed atlas layout; art may come from the procedural generator or a hand-made/AI sheet, code is unaffected.
- **Calm by default** — endless, scoreless, no fail state.

---

## 2. Tech, tooling, project structure

- **Language:** TypeScript (strict).
- **Repo:** **npm-workspaces monorepo** — foundational libs, the motor (headless simulation), the `@getback/game` playable core (render + assets + input + run-loop), and thin runnable targets (`apps/getback` + `examples/*`). The motor package has **no Pixi dependency at all**, so the render/logic boundary is enforced by the build, not by convention.
- **Bundler/dev server:** Vite in each runnable target (`apps/getback`, `examples/*`); library packages are TS source consumed across the workspace, type-checked with **TS project references**.
- **Renderer:** PixiJS v8 (only in `@getback/game`, the playable core).
- **Package manager:** npm (workspaces).
- **Tests:** Vitest, run across the workspace (`vitest.workspace.ts`); each package owns its tests, TDD.
- **Node tools:** `@napi-rs/canvas` (in `@getback/game` only) for the procedural sprite generator and the atlas slicer.
- **Runtime logic libraries (Pixi-free, headless-safe):** `rbush` (in `@getback/spatial`), `pure-rand` (in `@getback/math`), `robust-point-in-polygon` (in `@getback/math`). Everything else in the simulation is hand-written — see §2.1.

```
getback/                           # npm-workspaces monorepo root
  package.json                     # { "private": true, "workspaces": ["packages/*","apps/*","examples/*"] }
  package-lock.json
  tsconfig.base.json               # shared strict compiler options; every package extends it
  vitest.workspace.ts              # discovers & runs each package's tests

  packages/
    math/                          # @getback/math — pure math, no DOM/Pixi
      package.json                 #   deps: pure-rand, robust-point-in-polygon
      src/{ vec2, geometry, rng, index }.ts
        # geometry.ts  = closest-point-on-segment, winding, swept; point-in-polygon via robust-point-in-polygon
        # rng.ts       = seeded float/int/range over pure-rand

    signal/                        # @getback/signal — tiny generic pub/sub, zero deps
      src/{ Signal, index }.ts

    spatial/                       # @getback/spatial — deps: rbush, @getback/math
      src/{ grid, staticIndex, index }.ts
        # grid.ts        = 2D uniform grid for DYNAMIC agents (yuka CellSpacePartitioning, 2D, incremental)
        # staticIndex.ts = rbush R-tree wrapper for STATIC fence segments + obstacles

    motor/                         # @getback/motor — headless GetBack simulation (NO pixi dep; fully testable)
      package.json                 #   deps: @getback/{math,signal,spatial}, rbush(via spatial)
      src/
        config.ts                  # ALL tunables (one file)
        steering/                  # the behavior-tree machinery (was its own pkg; now lives here)
          primitives.ts            # seek / flee / arrive / truncate (operate on a Mobile)
          Behavior.ts              # BehaviorNode + nodes Blend(combine), Selector, Conditional, Sequence, Dynamic
          types.ts                 # Status, Predicate, node/ctx interfaces
        ai/
          behaviors.ts             # GetBack leaf steering (separation, cohesion, follow, gradientFollow, arriveGoal, flee, wallAvoid, obstacleAvoid, bounds, wander, intentFollow)
          predicates.ts            # isPenned, isAfraid, thirstIsTop, hungerIsTop, onLushCell
          trees.ts                 # builds the sheep + dog root trees
        entities/{ Dog, Sheep, Pen, Obstacle, Attractor, Treat }.ts   # data + factories
        world/
          World.ts                 # holds all entities + environment + spatial indices + signals
          Game.ts                  # update(dt, intent): runs the system pipeline, owns respawn flow
          penGen.ts                # random simple-polygon pen generator
          Emitter.ts               # declarative spawner {area, period, amount, kind} — flocks + treats
          Pool.ts                  # AgentPool object pools for sheep + treats (pools motor entities)
        systems/
          StaminaSystem, ScareSystem, DriveSystem, NeighborhoodSystem,
          SteeringSystem, SpawnSystem, MovementSystem, CollisionSystem,
          PenSystem, PickupSystem, BuffSystem, GrassSystem,
          AnimationSystem.ts       # AnimationSystem only picks the frame INDEX (pure state, no Pixi)
        index.ts                   # public motor API: createWorld(), Game, types

    game/   @getback/game                     # NEW shared playable core — the ONLY lib package with pixi.js
      package.json                 #   deps: @getback/motor, pixi.js   (dev: @napi-rs/canvas)
      assets/asset0.png            # source sprite sheet (6x9 grid, baked checkerboard bg)
      public/assets/{ sprites.png, sprites.json }     # packed atlas (shipped with the package → reused by all)
      tools/
        gen-sprites.mjs            # procedural pixel-art -> public/assets (layout source of truth)
        slice-sheet.mjs            # slices asset0.png: key checkerboard -> alpha, cut 6x9, trim, pack
      src/
        Runner.ts                  # mount(el, world): boot Pixi, load atlas, ticker -> Game.update(dt,intent) -> render, resize/scale
        input.ts                   # DOM keyboard -> DogIntent
        index.ts                   # public API: mount(), loadAtlas(), the render pieces
        render/
          atlas.ts                 # frame-name constants + loader
          SpriteFactory.ts         # build Pixi Sprites (textures swapped from anim.frame; no autoplay)
          RenderSystem.ts          # sync sprite transforms, depth-sort by y, draw FX
          Hud.ts                   # status HUD: stamina meter + flock counter (penned/total) + active-buff icon
          GrassRenderer.ts         # draws the grass grid tiles by density

  apps/
    getback/                       # the FINAL game (full scenario) — thin entry point
      index.html · vite.config.ts
      package.json                 #   name "getback";  deps: @getback/game, @getback/motor
      src/main.ts                  # const w = createWorld(fullScenario); mount(document.body, w)

  examples/                        # scenario sandboxes — each a thin package, reuses @getback/game assets+render
    one-sheep/                     #   1 sheep, no pen: a single agent grazing/wandering/fleeing
    several-sheep/                 #   a flock, no pen: pure flocking, no goal pressure
    only-corgi/                    #   just the dog: tune control feel, sprint, bark FX
    …                              #   each: index.html + vite.config + package.json + src/main.ts
                                   #   deps: @getback/game, @getback/motor
```

**Dependency DAG (acyclic):** `math` ← `spatial`; `math`, `signal`, `spatial` ← `motor` ←
`@getback/game` ← (`apps/getback`, `examples/*`). Nothing flows back toward the leaves, and
**`pixi.js` lives in `@getback/game`** (re-exported to the runnable apps) — **never** in the
motor or foundational libs.

**Architecture style:** lightweight data-oriented. Entities are plain data objects;
**systems are functions** run once per frame over the `World`. The whole simulation lives in
`@getback/motor` and is **Pixi-free and headless**; `@getback/game` is the playable shell
(render + assets + input + run-loop) that *every* runnable target reuses; each app/example just
builds a scenario `World` from motor factories and `mount()`s it. This keeps the motor
unit-testable without a DOM or GPU, and makes examples a few lines each.

> **Throughout this doc:** a bare module name like `geometry.ts` or `Game.ts` refers to the file
> in the package shown above (`geometry.ts` → `@getback/math`; systems → `@getback/motor`;
> `render/*`, `input.ts`, `Runner.ts` → `@getback/game`; `main.ts` → a runnable app/example).
> System steps without a path live in the motor.

### 2.1 PixiJS boundary — reuse vs build from scratch

**PixiJS is used for one thing only: rendering to the screen**, and it lives in exactly one
package (`@getback/game`, the playable core). It is a draw layer, not a game engine. The entire simulation — movement,
vector math, steering, collision, flocking AI, the game loop's update logic — is **our own code
in `@getback/{math,signal,spatial,motor}` with no game, physics, ECS, or math engine**.
None of those packages depend on `pixi.js`, so they run headless (no Pixi, no DOM) — which is
exactly why they are unit-testable.

We do reuse **three small, pure-logic utility libraries** for well-solved, fiddly pieces
that are not the heart of the game (spatial index, PRNG, point-in-polygon). They are
Pixi-free and headless-safe, so they don't compromise the testability or the "Pixi = render
only" rule. We deliberately do **not** adopt a steering/AI library (`yuka`) or a physics/
collision engine (`rapier`, `planck`, `matter`, `detect-collisions`), because our flock
rules (k-nearest cohesion, follow-only-moving-neighbours, fear-scaled cohesion) and our fence
model (open polyline + one-way gate + swept CCD + slide) are bespoke enough that those would
fight the design rather than save work.

**Reused from PixiJS (render / platform only):**

| Concern                | PixiJS API used                                              |
| ---------------------- | ----------------------------------------------------------- |
| Canvas + GPU context   | `Application` / renderer (WebGL/WebGPU), window resize       |
| Frame clock            | `Ticker` — supplies the per-frame `dt` that drives our `Game.update(dt)` (the *only* thing Pixi runs each frame; all update logic is ours) |
| Asset loading          | `Assets` loader + `Spritesheet`/`Texture` parsing of `sprites.json` |
| Drawing sprites        | `Sprite` (we swap textures ourselves; see below), `Container` layers |
| Depth sort             | `Container.sortableChildren` / `zIndex` set from entity `y`  |
| Pixel scaling          | nearest-neighbour texture scale mode, integer letterbox via renderer resize |
| HUD / FX shapes        | `Graphics` (stamina bar, bark ring) or `Sprite` for atlas FX |
| Tinting / alpha        | `Sprite.tint` / `.alpha` (e.g. fade-out on respawn)         |

**Reused third-party logic libraries (pure, Pixi-free, headless-safe):**

| Concern             | Library                                  | Why a lib (not built)                                              |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| Static AABB index   | `rbush` (R-tree)                          | Battle-tested; ideal for the **static** fence-segment + obstacle AABBs (segments have extent → an R-tree fits better than a point grid). Dynamic sheep use our own uniform grid instead (see build table). |
| Seedable PRNG       | `pure-rand`                               | High-quality, splittable PRNG — no reason to hand-roll determinism. |
| Point-in-polygon    | `robust-point-in-polygon`                 | Robust containment for the *non-hot* paths (pen validation, capture test). Hot per-frame primitives stay hand-written (below). |

> We keep our own thin wrappers (`spatial/staticIndex.ts`, `math/rng.ts`) over these so the
> rest of the code depends on our interface, not the lib — easy to swap or replace.

**Built entirely from scratch (no libraries):**

| Concern                  | Our module(s)                                                    |
| ------------------------ | --------------------------------------------------------------- |
| Vector math              | `math/vec2.ts` (no gl-matrix etc.)                              |
| Steering primitives      | motor `steering/primitives.ts` (seek/flee/arrive/truncate)    |
| Behavior-tree framework  | motor `steering/Behavior.ts` (Blend/Selector/Conditional/Sequence/Dynamic + `combine()`) |
| GetBack behaviors        | motor `ai/behaviors.ts` (leaf steering, incl. `intentFollow`), `ai/predicates.ts`, `ai/trees.ts` — see §2.2 |
| Geometry (hot paths)     | `math/geometry.ts` (closest-point-on-segment, winding, swept circle–segment; allocation-light). Point-in-polygon delegates to `robust-point-in-polygon`. |
| Movement & integration   | `MovementSystem` (force accumulator, Euler integrate, damping, clamping) |
| Flocking / sheep AI       | `SteeringSystem` (evaluates the tree), `DriveSystem`, `NeighborhoodSystem` |
| Spawning / pooling / events | motor `world/Emitter.ts` + `world/Pool.ts` + `SpawnSystem`; `@getback/signal` `Signal.ts` (patterns from `swarm`) |
| Collision (broad+narrow) | `CollisionSystem` (circle–circle, segment closest-feature, CCD, one-way gate) — **no matter.js / planck / rapier / detect-collisions** |
| Dynamic spatial index    | `spatial/grid.ts` (2D uniform grid for sheep; yuka CellSpacePartitioning ported to 2D — **dependency-free**) |
| Static spatial wrapper   | `spatial/staticIndex.ts` (thin API over `rbush`; static fence segments + obstacles) |
| Pen polygon generation   | `world/penGen.ts`                                              |
| Frame orchestration      | `Game.ts` (system order, fixed-ish timestep, `dt` clamp)       |
| Stamina / treats / buffs | `StaminaSystem`, `PickupSystem`, `BuffSystem`                  |
| Scare / ambient events   | `ScareSystem`                                                  |
| Grass field sim          | `GrassSystem`                                                  |
| Determinism wrapper      | `math/rng.ts` (thin API over `pure-rand`; seeded float/int/range) |
| Animation selection      | `AnimationSystem` picks the atlas frame by (type, state, facing); we drive frame timing ourselves rather than relying on `AnimatedSprite` autoplay, so animation stays in sync with simulation state |

> **Rule of thumb for the build:** `pixi.js` is a dependency of **`@getback/game`** (and the
> runnable apps/examples that use it). If a file imports it, it lives under `@getback/game/src/`
> (`render/*`, `Runner.ts`). The motor and the foundational libs (`math`/`signal`/`spatial`)
> must be Pixi-free and runnable in a plain Node/Vitest context — enforced by the fact that they
> simply don't list `pixi.js` as a dependency.

### 2.2 Steering: a composable behavior tree (yuka + swarm)

The movement/AI layer is a **composable behavior tree**, merging yuka's weighted-truncated
force blending with the prior `swarm` project's combinator behaviors (`ComposableBehavior`,
`ConditionalBehavior`, `DynamicBehavior`, status-returning `Behavior.run`). One abstraction
handles **both** the decision logic (penned? afraid? hungry?) and the steering blend — there
is no separate `BehaviorSystem` switch. We still keep the data-oriented **system pipeline**
(§5.2) for orchestration around it, and reject the heavy parts of both libraries (yuka's 3D
math / scene graph / serialization; swarm's pheromones and track history — deferred).

**Node model.** A `BehaviorNode` is evaluated per entity per frame:
`run(entity, ctx, out: Vec2) => Status` — it may add steering into `out` and returns a
`Status` (`fired` / `skipped`) used for control flow. `ctx` carries read-only world refs
(neighbors, dog, stress, grass, attractors, obstacles, pen, bounds, dt). Node kinds:

- **Leaf steering** (pure): `separation`, `cohesion` (k-nearest), `follow` (moving neighbours
  only), `gradientFollow` (grass), `arriveGoal`, `flee`, `wallAvoid`, `obstacleAvoid`,
  `bounds`, `wander`. Each writes a force and returns `fired`. Independently unit-testable.
- **`Blend(children, weights)`** — combines children's forces with yuka's **prioritized
  truncated accumulation** (`combine()`): walk in priority order, add `force × weight` while
  tracking the remaining `maxForce` budget, stop when spent — so `flee` is never starved by
  `wander`. This is the steering backbone (great for flocking).
- **`Selector(children)`** — run children until one returns `fired`; the chosen one's force is
  kept. This is the utility decision (pick the active goal by drive).
- **`Conditional(predicate, then, else?)`** — branch on a pure predicate
  (`isPenned`, `isAfraid`, `thirstIsTop`, `onLushCell`…). Predicates read drives/state.
- **`Sequence(children)`** — run all (e.g. apply a goal then a modifier).
- **`Dynamic(fn)`** — inline escape hatch (swarm's `DynamicBehavior.from`).

**The sheep's root tree** (illustrative) — a `Blend` in priority order whose *goal* child is a
`Selector`/`Conditional` cascade, so decisions live inside the tree:

```
Blend([
  Conditional(isPenned,  seekPenCenter),         // penned: gentle interior wander (high prio)
  Conditional(isAfraid,  flee),                  // safety first
  wallAvoid, obstacleAvoid, separation,
  Selector([                                     // utility goal pick (by top drive)
    Conditional(thirstIsTop, arrive(water)),
    Conditional(hungerIsTop, gradientFollow(grass)),
    arrive(shade) /* else: rest/idle */,
  ]),
  cohesion /*×(1+fear)*/, follow, bounds, wander,
])
```

`SteeringSystem` evaluates each entity's root into `sheep.force`; §7.2 then integrates. The dog
has its own small root tree. Per-archetype trees are built once and reused (state lives on the
entity, not the tree, so trees are shareable and stateless).

**Precomputed neighborhood.** `NeighborhoodSystem` fills `sheep.neighbors[]` once per frame from
the uniform grid; leaf behaviours read that array and never query the index themselves.

**Render decoupling — moving and rendering are fully separate concerns.** Unlike yuka's
`setRenderComponent` (which stores a render ref *on* the entity), the motor entity carries **no
rendering state at all**. Instead `@getback/game`'s `RenderSystem` owns an external
`Map<Mobile, Sprite>` (keyed by entity identity): each frame it creates sprites for new entities,
removes them for departed ones, and copies `pos`/depth/frame/flip from the `World` onto its
sprites. The motor never imports Pixi and never holds a sprite; the render layer reads the motor,
never the reverse.

### 2.3 Infrastructure adopted from `swarm`

- **`Emitter`** (`world/Emitter.ts`) — a declarative spawner `{ geometry, period, amount, kind }`
  used for **both** flock spawns and treat spawns, instead of bespoke spawn code per system.
- **`AgentPool`** (motor `world/Pool.ts`) — object pools for sheep and treats, reused across the
  endless respawn loop to avoid GC churn (flocks fade out → returned to pool → re-emitted).
- **`Signal`** (`@getback/signal`) — tiny pub/sub. Game events (`penFilled`, `sheepPenned`,
  `treatCollected`, `barked`, `ambientScare`) are emitted by systems and consumed by FX, HUD,
  and (optional) audio, so those stay decoupled from simulation logic.

We did **not** adopt swarm's unified `{type, geometry, force, radius}` field-source primitive —
our explicit `Obstacle` / `Attractor` / `Segment` types stay (clearer for this smaller scope).

---

## 3. Rendering & display

- **Logical resolution:** `480 × 270` (16:9). The entire pasture fits on one screen; no scrolling camera.
- **Scaling:** the logical canvas is scaled up by an integer-friendly factor with **nearest-neighbour** sampling (`roundPixels: true`, texture scale mode `nearest`) to fill the window, letterboxed to preserve aspect. Crisp pixels, no blur.
- **Layers (back to front):**
  1. Grass/terrain grid (tiled).
  2. Static props that sit on the ground (water hole, shade footprint).
  3. Entities + obstacles, **depth-sorted by `y`** (lower on screen drawn later) so sheep/dog/trees overlap naturally.
  4. FX (bark ring, dust puffs, sparkles) — above entities.
  5. HUD (stamina meter, flock counter, buff icon) — screen-space, top layer (§13.3).
- **Shadows:** each mobile entity and prop draws the `shadow` sprite as a soft ellipse beneath it.
- **Auto-start:** a runnable target's `index.html` loads its `main.ts`, which builds a scenario `World` (motor factories) and calls `@getback/game`'s `mount()`; the `Runner` boots Pixi, loads the atlas, and starts the ticker. No menu, no click-to-start.

---

## 4. Asset pipeline

### 4.1 Source sheet (`asset0.png`)
- 2880×2880, **6 columns × 9 rows**, so each grid cell is **480 × 320 px** (3:2).
- **RGB, no alpha.** The transparent-looking background is a **painted checkerboard**, not real transparency.

### 4.2 Atlas frame layout (the contract — both generator and slicer must match)

| Row | Frames (col 0 → 5)                                                      |
| --- | ---------------------------------------------------------------------- |
| 0   | `corgi_down_idle` `corgi_down_walk0..3` `corgi_down_bark`              |
| 1   | `corgi_up_idle` `corgi_up_walk0..3` `corgi_up_bark`                    |
| 2   | `corgi_side_idle` `corgi_side_walk0..3` `corgi_side_bark`              |
| 3   | `sheep_down_idle` `sheep_down_walk0..3` `sheep_down_graze`             |
| 4   | `sheep_up_idle` `sheep_up_walk0..3` `sheep_up_graze`                   |
| 5   | `sheep_side_idle` `sheep_side_walk0..3` `sheep_side_graze`             |
| 6   | `grass_lush` `grass_med` `grass_grazed` `dirt` `water` `water_edge`    |
| 7   | `tree` `boulder` `rock` `fence_post` `fence_rail` `gate_post`          |
| 8   | `bone` `bark_ring` `dust` `shadow` `sparkle` (empty)                   |

- **Left-facing** sprites are not stored; `*_side_*` is mirrored horizontally at render time (`sprite.scale.x = -1`).

### 4.3 `tools/slice-sheet.mjs`
1. Load `asset0.png`.
2. **Key out the checkerboard → alpha:** the checkerboard is two near-constant light-grey tones; detect background pixels (the two checker colours within tolerance, flood-filled from the borders so interior near-white art is preserved) and set them transparent.
3. Cut the 6×9 grid (480×320 strides).
4. **Trim** each cell to its content bounding box; record the trim offset so the sprite's logical origin (feet/center) is consistent.
5. **Downscale** trimmed sprites to game scale (target sprite footprint ≈ 32px tall for creatures; terrain tiles normalized to the tile size) using nearest-neighbour to preserve the pixel look, or keep native size and let Pixi scale — decided in planning (leaning: pack at a uniform creature height, e.g. 32px).
6. Pack into `public/assets/sprites.png` + `sprites.json` (Pixi spritesheet format) using the frame names above.

### 4.4 `tools/gen-sprites.mjs` (fallback / layout source of truth)
Procedurally draws the same 6×9 frame set with `@napi-rs/canvas` and emits the same atlas. Keeps the project runnable and the layout authoritative even without the AI sheet. Both tools live in `@getback/game/tools/`; `npm run gen:sprites` and `npm run slice:sheet` (workspace scripts) produce a valid `@getback/game/public/assets/sprites.{png,json}` — shipped with the package, so every app/example reuses the same atlas.

---

## 5. Core architecture & game loop

### 5.1 World contents
- `dog: Dog`
- `sheep: Sheep[]`
- `pen: Pen`
- `obstacles: Obstacle[]` (trees, rocks)
- `attractors: Attractor[]` (water hole; shade attached to each tree)
- `treats: Treat[]`
- `grass: GrassField`
- `stress: StressSource[]` (rebuilt each frame)
- `fx: FxInstance[]` (bark rings, dust, sparkles — transient)
- `emitters: Emitter[]` (flock + treat spawners)
- `pools: { sheep: AgentPool<Sheep>; treats: AgentPool<Treat> }`
- `signals: GameSignals` (penFilled, sheepPenned, treatCollected, barked, ambientScare)
- `staticIndex: StaticIndex` (rbush wrapper; fence segments + obstacles, built per generation)
- `sheepGrid: UniformGrid` (2D uniform grid; sheep, incrementally updated each frame)
- `bounds: Rect` (pasture extent)
- `rng: Rng`

**Composable construction (for the final game *and* examples).** The motor exposes small
factories — `createDog()`, `createSheep(n)`, `createPen()`, `createGrass()`, `createWaterHole()`,
`createTree()/createRock()`, `createEmitter()` — and a `createWorld(scenario)` that assembles a
`World` from a partial scenario object. Every field is optional, so a runnable target can build
exactly what it needs:
- `apps/getback` → the **full** scenario (flock + pen + grass + water + shade + obstacles + treats + ambient scares).
- `examples/one-sheep` → `{ dog, sheep: 1, grass }` — no pen, no treats.
- `examples/several-sheep` → `{ dog, sheep: 20, grass }` — pure flocking, no goal pressure.
- `examples/only-corgi` → `{ dog }` — just the player avatar, to tune control feel/sprint/bark.

`@getback/game`'s `mount(el, world)` then renders+runs any of them identically — same assets,
same `Runner`, same input. Examples are a handful of lines.

### 5.2 Frame pipeline (deterministic order, fixed-ish timestep)

`dt` is clamped to `≤ 1/30 s` to prevent integration blow-ups and tunneling on hitches.

Each frame **`@getback/game`'s `Runner`** reads input and calls the motor's `Game.update(dt,
intent)`; the motor runs steps 2–14; then the `Runner` renders (step 15). Steps 1 and 15 live in
`@getback/game`, not the motor.

```
 1. input (game core)  DOM keyboard -> DogIntent {moveDir, sprintHeld, barkPressed}, passed into update()
 2. StaminaSystem      drain (sprint/bark), regen; gate availability of sprint & bark
 3. ScareSystem        rebuild stress[]: dog presence (every frame), bark pulse (on press),
                       ambient scare (timer); expire ttl-based sources
 4. GrassSystem        regrow all cells; deplete cells under grazing sheep
 5. DriveSystem        sheep: hunger/thirst rise; fear = max over nearby stress sources
                       (scaled by 1/boldness); fear decays when unthreatened
 6. NeighborhoodSystem update sheepGrid cells; fill each sheep.neighbors[] (one query/sheep)
 7. SteeringSystem     evaluate every agent's behavior tree -> force (sheep AND the dog;
                       the dog's tree uses a generic `intentFollow` leaf reading ctx.intent)
 8. MovementSystem     all mobile entities: force->vel->pos, damping, facing
 9. CollisionSystem    resolve point obstacles + fences (CCD + closest-feature) + one-way gate
10. PenSystem          point-in-polygon capture; penned behavior lock; fill check -> emit penFilled
11. PickupSystem       treat overlap -> consume -> refill stamina + maybe grant buff -> treatCollected
12. SpawnSystem        tick Emitters (period/amount); pull entities from Pool, add to world
13. BuffSystem         tick buff timer; apply/remove modifiers
14. AnimationSystem    advance anim cursor; pick frame INDEX by (type, state, facing) — pure state
15. RenderSystem(game) read World: sync Pixi sprite transforms/textures, depth-sort by y, draw FX + HUD
```

Soft avoidance forces are produced in step 7 (look-ahead steering, via the `wallAvoid` /
`obstacleAvoid` leaf behaviours); **hard** positional resolution happens in step 9. This
two-phase split is what makes movement both smooth and unbreakable. `Signal`s emitted by the
Pen/Pickup/Scare systems are consumed by FX/HUD/audio listeners outside this hot path.

---

## 6. Data models

```ts
// ---- shared ----
interface Vec2 { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
interface AABB { minX: number; minY: number; maxX: number; maxY: number }
type Direction = 'down' | 'up' | 'left' | 'right'

// ---- mobile kinematic core (shared by Sheep & Dog) ----
interface Mobile {
  pos: Vec2
  vel: Vec2
  force: Vec2     // per-frame steering accumulator, zeroed after integration
  radius: number  // collision radius
  maxSpeed: number
  maxForce: number
  facing: Direction
  // NOTE: no render field. Moving and rendering are separate concerns — the motor entity
  // carries zero rendering state. The render layer keeps its own entity→sprite map (§2.2).
}

// ---- composable behavior tree (see §2.2) ----
type Status = 'fired' | 'skipped'
// a node may add steering into `out`; returns a status used for control flow.
interface BehaviorNode { run(e: Mobile, ctx: SteerContext, out: Vec2): Status }
type Predicate = (e: Mobile, ctx: SteerContext) => boolean
// node kinds (all implement BehaviorNode):
//   Blend(children, weights)  -> prioritized truncated combine of child forces (yuka combine)
//   Selector(children)        -> run until one returns 'fired'; keep its force
//   Conditional(pred, then, else?) -> branch on a pure predicate
//   Sequence(children)        -> run all
//   Dynamic(fn)               -> inline (e, ctx, out) => Status
//   leaf steering fns (separation/cohesion/flee/...) wrapped as nodes

// the app turns DOM input into this each frame and passes it to Game.update(dt, intent);
// the motor stores it on the World so systems/behaviours can read it. The *meaning* of the
// keys lives in @getback/game/src/input.ts — the motor only sees an abstract intent.
interface DogIntent {
  moveDir: Vec2      // normalized 8-way desired direction (zero = stand)
  sprint: boolean
  bark: boolean      // edge-triggered this frame
}

// read-only world refs a node may need; passed in, so nodes stay pure & testable
interface SteerContext {
  self: Mobile
  neighbors: Sheep[]
  dog: Dog
  intent: DogIntent  // read by the dog's `intentFollow` leaf; ignored by sheep behaviours
  stress: StressSource[]
  grass: GrassField
  attractors: Attractor[]
  obstacles: Obstacle[]
  pen: Pen
  bounds: Rect
  dt: number
}

// ---- sheep ----
type SheepBehavior = 'graze' | 'travel' | 'drink' | 'rest' | 'flee' | 'idle' | 'penned'

interface SheepTraits {     // static personality, rolled once at spawn from rng
  maxSpeed: number
  maxForce: number
  personalSpace: number     // separation radius
  perception: number        // neighbor + gradient sensing radius
  boldness: number          // [0..1] low = skittish (bigger fear, flees sooner, recovers slower)
  sociability: number       // [0..1] scales cohesion + follow
  hungerRate: number
  thirstRate: number
  appetite: number          // grazing fullness threshold before wandering on
}

interface Sheep extends Mobile {
  traits: SheepTraits
  drives: { hunger: number; thirst: number; fear: number }  // each [0..1]
  behavior: SheepBehavior         // current state LABEL (for animation); set by the active tree leaf
  root: BehaviorNode              // the (shared, stateless) sheep behavior tree; evaluated by SteeringSystem
  goal: Vec2 | null               // current target, set by the active goal node
  neighbors: Sheep[]              // refilled each frame by NeighborhoodSystem from sheepGrid
  penned: boolean
  anim: { frame: number; time: number }
}

// ---- dog ----
interface Dog extends Mobile {
  stamina: number              // [0..staminaMax]
  barkCooldown: number         // seconds remaining
  activeBuff: Buff | null
  anim: { frame: number; time: number }
  barking: boolean             // true for the bark anim flash window
}

// ---- environment ----
interface GrassField {
  cols: number; rows: number; cellSize: number
  density: Float32Array        // [0..1] per cell
  regrowRate: number           // per second
  depleteRate: number          // per second per grazing sheep
}

interface Obstacle { kind: 'tree' | 'rock'; pos: Vec2; radius: number }

type DriveType = 'thirst' | 'rest'   // attractors satisfy these; hunger is the grass field
interface Attractor {
  kind: 'water' | 'shade'
  pos: Vec2
  radius: number
  satisfies: DriveType
  satisfyRate: number          // drive reduced per second while inside
  pull: number                 // base steering weight when targeted
}

// ---- pen: one polygon, two derived models ----
interface Segment { a: Vec2; b: Vec2 }
interface Pen {
  outline: Vec2[]              // ordered vertices of an arbitrary simple polygon
  gateEdge: number            // index i: edge outline[i]->outline[(i+1)%n] is the gate (no fence)
  // derived & cached at build:
  fences: Segment[]           // every edge EXCEPT gateEdge
  gate: { mouth: Segment; inwardNormal: Vec2 }
  windingCCW: boolean         // from signed area; used for inward normals
  aabb: AABB
  contained: Set<Sheep>
}

// ---- stress / fear sources ----
interface StressSource {
  kind: 'presence' | 'bark' | 'ambient'
  pos: Vec2 | null            // null = global (whole flock)
  radius: number
  intensity: number           // [0..1]
  falloff: 'linear' | 'none'
  ttl: number                 // seconds; presence re-emitted each frame, bark/ambient expire
}

// ---- fun layer ----
type BuffType = 'zoomies' | 'megabark' | 'calm'
interface Buff { type: BuffType; timeLeft: number }
interface Treat { pos: Vec2; radius: number; grantsBuff: BuffType | null }

// ---- infrastructure adopted from swarm ----
type SpawnArea =
  | { type: 'point'; at: Vec2 }
  | { type: 'circle'; at: Vec2; radius: number }
  | { type: 'polygon'; points: Vec2[] }      // e.g. "far side, away from the pen"
interface Emitter {
  kind: 'sheep' | 'treat'
  area: SpawnArea
  period: number        // seconds between emissions; 0 = one-shot/manual
  amount: number        // entities per emission
  timer: number         // counts down
  max?: number          // cap of live entities of this kind on the field
  enabled: boolean
}

interface Signal<T> { add(fn: (v: T) => void): void; remove(fn: (v: T) => void): void; emit(v: T): void }
interface GameSignals {
  penFilled: Signal<void>
  sheepPenned: Signal<Sheep>
  treatCollected: Signal<{ treat: Treat; buff: BuffType | null }>
  barked: Signal<{ pos: Vec2; radius: number }>
  ambientScare: Signal<void>
}

interface AgentPool<T> { acquire(): T; release(item: T): void }  // reuse across respawns, no GC churn
```

---

## 7. Movement mechanics (centerpiece)

All movement uses **Reynolds-style steering** on a shared kinematic core. The key idea:
**`force` is a per-frame accumulator.** Many systems push a unit in a single frame;
they all add into `force`; `MovementSystem` integrates once and zeroes it. **Velocity is
the only thing that persists between frames** (that is the inertia) — acceleration never
accumulates across frames, so there is no runaway speed-up.

### 7.1 Steering primitives (motor `steering/primitives.ts`, pure)
```
truncate(v, max)          -> v scaled to length max if |v| > max, else v
seek(m, target)           -> desired = norm(target - m.pos) * m.maxSpeed; return desired - m.vel
flee(m, point)            -> -seek(m, point)
arrive(m, target, slowR)  -> like seek, but desired speed ramps 0..maxSpeed across slowR
                             near the target (prevents overshoot on water/shade/idle goals)
followGradient(m, dir)    -> desired = norm(dir) * maxSpeed; return desired - m.vel
```
The leaf steering behaviours in motor `ai/behaviors.ts` (§2.2) are built on these
primitives; `combine()` merges them with **prioritized truncated accumulation** (below),
not a plain weighted sum.

### 7.2 Integration (`MovementSystem`), per mobile entity, after force accumulation

**Method: semi-implicit (symplectic) Euler** — update velocity first, then advance position with
the *new* velocity:
```
force = truncate(force, maxForce)        // maxForce caps agility -> smooth turns, no teleport
vel   = truncate(vel + force * dt, maxSpeed)   // velocity first
pos   = pos + vel * dt                          // position uses the NEW velocity
if (|force| < EPS) vel *= damping^dt      // coast to a graceful stop when nothing is pushing
facing = directionFromVelocity(vel, facing)  // keep previous facing if |vel| ~ 0
force = { x: 0, y: 0 }                     // reset for next frame
```
- **Mass = 1** (folded into `maxForce`); no separate mass field.
- `damping` (e.g. ~0.1/s effective) makes grazing/idle stops look natural rather than abrupt.
- `directionFromVelocity`: pick `down/up/left/right` from the dominant velocity axis; sticky to avoid facing flicker near diagonals (hysteresis around the 45° boundaries).
- `dt` clamped upstream (`≤ 1/30`).

> **Why Euler, not Verlet.** The model is **velocity-driven** — every steering primitive
> (`seek/flee/arrive`, `follow`/alignment reading neighbour velocity, `maxSpeed`, damping,
> `intentFollow`, facing) reads or writes velocity as a first-class quantity. Semi-implicit
> Euler keeps velocity explicit and is the standard for Reynolds/boids steering (yuka, swarm).
> Verlet makes velocity *implicit* (`v ≈ pos − prevPos`), which would add friction to all of the
> above for benefits we don't need: it shines for **constraint-heavy** physics (cloth, rope,
> springs, PBD rigid stacks), which this game has none of. Our only constraints — fence/obstacle
> push-out and the one-way gate — are resolved positionally after integration (§10), where we
> explicitly zero the inward velocity for sliding. (Tunneling is handled by CCD regardless of
> integrator; `dt` is clamped regardless.) Revisit only if rope/cloth/soft-body is ever added.

> **Note — how `force` is filled.** For sheep, `force` is produced by `SteeringSystem`
> evaluating each agent's behavior tree (whose root `Blend` calls `combine()`, §2.2) *before*
> this integration step — the **dog included** (its tree's `intentFollow` leaf, §7.4).
> `MovementSystem` itself only integrates — it doesn't know about behaviours.

### 7.2b Prioritized combination (motor `steering/Behavior.ts` `combine()`)
```
combine(entity, behaviors, ctx) -> out:
  out = (0,0); budget = entity.maxForce
  for b in behaviors (priority order):           // flee/wallAvoid first ... wander last
    if !b.active: continue
    f = b.fn(entity, ctx) * b.weight
    mag = |f|
    if mag > budget: f = norm(f) * budget        // truncate to remaining budget
    out += f; budget -= mag
    if budget <= 0: break                          // high-priority behaviours never starved
  return out
```
This is yuka's `_accumulate` rule (`SteeringManager.js:116`): order matters, and a saturated
flee force can legitimately crowd out wander/cohesion in a panic. `out` becomes `sheep.force`.

### 7.3 Sheep steering forces (the leaf behaviours)
These are the leaf steering nodes blended by the sheep's `Blend` root (§2.2), in the priority
order below. `Conditional`/`Selector` nodes inside the tree decide which `goal` leaf fires and
gate `flee`/`penned`; weights are read from drives/state. Leaves read the precomputed
`sheep.neighbors`. All base weights live in `config.ts`:

| Force         | Source                                                       | Weight                          |
| ------------- | ------------------------------------------------------------ | ------------------------------- |
| Separation    | sum of repulsion from neighbours closer than `personalSpace` | `wSeparation`                   |
| Cohesion      | `seek` toward center-of-mass of the **k nearest** neighbours | `wCohesion · sociability · (1+fear)` |
| Follow        | steer toward avg heading of neighbours **that are moving**   | `wFollow · sociability`         |
| Goal          | active goal force (see §8.3)                                 | drive-scaled (see §8)           |
| Flee          | sum of `flee` from each stress source in range, ∝ intensity  | `wFlee · fear / boldness` (**dominant**) |
| Wall-avoid    | look-ahead repulsion from nearest fence feature (see §10.4)  | `wWallAvoid`                    |
| Obstacle-avoid| look-ahead repulsion from nearby point obstacles             | `wObstacleAvoid`                |
| Bounds        | steer inward when near pasture edge                          | `wBounds`                       |
| Wander        | small smoothed random jitter (only when calm: graze/idle)    | `wWander`                       |

**Priority order** for `combine()` (first = highest, gets force budget first):
`flee → wallAvoid → obstacleAvoid → separation → goal → cohesion → follow → bounds → wander`.
Survival/safety outranks comfort outranks idle wander, so a panicking sheep spends its whole
`maxForce` on escaping and clamping to walls, not on drifting.

- **k-nearest cohesion** (not radius-average) is the sheep-specific rule: the flock forms a loose grazing *front* and subgroups don't implode/explode.
- **Follow only tracks moving neighbours** — contagious motion ("one bolts, the rest follow"); a field of still grazers has nothing to follow, killing the bird-like look.
- **Fear multiplies cohesion** so a bark makes the herd bunch into a tight knot and flee as one unit, then fan back out as fear decays.

### 7.4 Dog movement (a generic `intentFollow` leaf — no dog-specific system)
The dog is **just another agent**: `SteeringSystem` (§5.2 step 7) evaluates its behavior tree
like any sheep. There is **no `DogControlSystem`** in the motor. The dog's tree is a small
`Blend` whose primary node is the game-agnostic `intentFollow` leaf, which reads `ctx.intent`:
```
intentFollow(dog, ctx):                         // generic: any agent can be intent-driven
  speed      = maxSpeed * (ctx.intent.sprint && stamina>0 ? sprintMult : 1) * (zoomies ? zoomiesMult : 1)
  desiredVel = ctx.intent.moveDir * speed       // moveDir already normalized 8-way, zero = stand
  force      = desiredVel - dog.vel             // snappy but inertial; dog has high maxForce
  if |moveDir| ~ 0: force = -dog.vel * stopGain // active braking so control feels tight
```
The dog's `maxForce` is much higher than a sheep's, giving responsive control, while it's
integrated through the **same** pipeline (so it collides with fences/obstacles too). The
*meaning* of the input (which keys, Space = bark) lives in `@getback/game/src/input.ts`, which
produces the `DogIntent`; barking's *effect* (emit a stress source, cooldown, stamina cost) is
simulation and stays in the motor (`ScareSystem`/`StaminaSystem` read `intent.bark`).

---

## 8. Sheep AI

### 8.1 Drives (`DriveSystem`)
- `hunger += hungerRate · dt`, `thirst += thirstRate · dt` (clamped [0..1]); **they keep rising even while fleeing**, so sheep are eager to settle and graze right after a scare.
- `fear`: for the frame, `fearTarget = max over in-range stress sources of intensity·falloff(dist)`, then `fear = max(fearTarget, fear − fearDecay·boldnessRecovery·dt)`. Low `boldness` ⇒ larger effective fear and slower recovery.
- Grazing reduces hunger while a sheep is in `graze` behaviour over a lush cell (`hunger -= grazeRate·dt`); drinking reduces thirst inside the water radius.

### 8.2 Action selection (encoded in the behavior tree, §2.2)
There is no separate selection system — the decision *is* the tree. The relevant nodes, in the
order the root `Blend`/`Selector` evaluate them, express exactly this logic:
```
Conditional(isPenned)             -> penned interior wander   (see §11.4)
Conditional(isAfraid)             -> flee                     (safety overrides goals)
Selector(                          // utility: highest drive wins
  Conditional(thirstIsTop)        -> arrive(water)            [behavior='drink']
  Conditional(hungerIsTop)        -> onLushCell ? graze : gradientFollow(grass)  ['graze'/'travel']
  default                          -> arrive(shade) | idle near flock            ['rest'/'idle']
)
```
The firing leaf sets `sheep.behavior` (the animation label) and `sheep.goal`. `rest` is not a
full drive — it is the low-priority "nothing else to do" loiter at shade.

### 8.3 Goal forces
- **Graze/travel:** `followGradient(grass gradient at pos)`; gradient sampled from the 4–8 neighbouring grass cells. Hungrier ⇒ higher weight. On a sufficiently lush cell the sheep switches to `graze` (slows, head-down anim, depletes the cell).
- **Drink:** `arrive(water.pos, water.radius)`, weight ∝ thirst.
- **Rest/idle:** `arrive(shade.pos)` at low weight, or gentle cohesion-only loitering near the flock center.

### 8.4 Emergent grouping (summary)
Separation + k-nearest cohesion = cohesive blob with breathing room; contagious follow =
flock flows together when travelling; shared grass/water goals = convergence without an
explicit "stay together" rule; fear×cohesion = tight stampede. Calm = loose front,
travelling = flowing column, scared = tight clump.

### 8.5 Per-sheep variation
At spawn, each `SheepTraits` field is rolled from the seeded `rng` within a config range
(e.g. `maxSpeed ±20%`, `boldness ∈ [0.3,0.9]`, `sociability ∈ [0.4,1.0]`), so no two sheep
move identically and the herd never looks mechanical.

---

## 9. Environment

### 9.1 Grass field (`GrassSystem`)
- Coarse grid over the pasture (`cellSize ≈ 16px`). `density[cell] ∈ [0..1]`.
- **Regrow:** every cell `density += regrowRate·dt` (clamped ≤ 1).
- **Deplete:** each sheep in `graze` removes `depleteRate·dt` from its current cell.
- **Visuals (`GrassRenderer`):** map density → `grass_lush` / `grass_med` / `grass_grazed` / `dirt` tiles, so grazed areas visibly darken/shorten and recover — the herd's drift becomes legible.
- Sheep read the local density **gradient** to steer toward greener cells; depletion is the engine that keeps the flock roaming.

### 9.2 Water hole
A single `Attractor{kind:'water'}` — a pool sheep stand in to satisfy `thirst`. It is **not**
an obstacle (sheep enter it). Rendered with `water` + `water_edge` tiles.

### 9.3 Trees & rocks (point obstacles)
- `Obstacle{kind:'rock'}` — pure circular obstacle.
- `Obstacle{kind:'tree'}` — circular obstacle (trunk) **plus** an attached `Attractor{kind:'shade'}` of larger radius (rest spot). Solid trunk, restful shade.

---

## 10. Collision system (`CollisionSystem`)

Two obstacle primitives — **circles** (points) and **segments** (fence lines) — resolved
after integration, with a **two-tier broad-phase** in front of every narrow-phase test.

> **Considered & rejected: `check2d` / `detect-collisions`.** Evaluated as a drop-in collision
> library (BVH + SAT, Circle/Line/Polygon bodies, MTV separation, raycast). It cleanly handles
> circle–circle and could model the fence as Line bodies (omitting the gate edge), but it
> provides **no CCD/swept** test (our anti-tunneling guarantee), **no one-way gate**, and **no
> slide response** — all of which would stay custom anyway — while imposing a parallel
> Body/System object model and reopening the grid+rbush split. For a game whose quality *is* the
> herding/fence feel, the bespoke parts are the point, so we keep collision custom. (See §2.1 —
> we likewise avoid `matter`/`planck`/`rapier`.)

### 10.1 Broad-phase (split: static R-tree + dynamic grid)
- **Static geometry → `staticIndex` (`rbush` R-tree, via `spatial/staticIndex.ts`)**: all fence
  segments + obstacles, built once per generation; ideal for the variable-size segment AABBs.
  Collision queries against fences/obstacles hit this index.
- **Dynamic sheep → `sheepGrid` (`spatial/grid.ts`, 2D uniform grid)**: incrementally updated
  each frame (an entity only changes cell when its index changes — no rebuild), serving the
  per-frame flocking neighbour queries (`NeighborhoodSystem`).
- Every query is **AABB/cell-first, precise-second**: broad query → candidate set →
  narrow-phase (circle/segment) → point-in-polygon last and only when needed.

### 10.2 Point obstacles (circle vs circle)
If `dist(unit.pos, obs.pos) < unit.radius + obs.radius`: push the unit out along the
center→center vector by the penetration depth and remove the inward velocity component.
Radially symmetric ⇒ **no corner problem**, always circumnavigable from either side.

### 10.3 Fence lines — corner-safe resolution
The fence is treated as a **single distance field with rounded vertices**, not independent
segments with face normals. Three coordinated rules:

1. **Closest-feature, not per-segment-normal.** For each nearby segment compute the
   closest point with the projection parameter **clamped to [0,1]**. Resolve against the
   single **minimum-distance** feature. When that point is a segment interior, push along
   the face normal; when it is an **endpoint (vertex), push radially from the vertex**. Every
   corner thus behaves like a **rounded cap of radius = unit radius** — the unit slides
   smoothly around it instead of fighting two conflicting normals. No jitter, no seams.

2. **Continuous collision detection (CCD).** To guarantee a unit can never tunnel through a
   thin fence (e.g. when a bark flings it), test the **swept motion** `oldPos → newPos`
   (inflated by `radius`) against fence segments; on a hit, clamp the unit to the
   time-of-impact and slide the remaining motion tangentially along the wall. Independent of
   speed. `dt`/`maxSpeed` clamps are a cheap secondary backstop.

3. **Inside/outside is global ground truth.** Whether a sheep is in or out comes **only** from
   `pointInPolygon(pos, pen.outline)` (closed ring, ray-cast, concave-safe) and the gate's
   inward direction comes from the polygon **winding** (signed area). The code never infers
   side from a local segment, so a sheep cannot be silently misclassified and ejected to the
   wrong side. If CCD ever missed, next frame's point-in-polygon + closest-feature push
   self-corrects.

For tight concave wedges, run a few (2–3) **relaxation iterations** of the push-out per frame
so the unit settles instead of vibrating.

### 10.4 Soft wall-avoidance (steering, §7.3)
The avoidance **force** reads the **same** closest-point-on-polyline query. Because
distance-to-polyline (with vertex caps) is continuous across joints, the unit feels one
smooth wall — and at the **gate gap there is no segment, so the field drops to zero**: a
natural doorway. This is also the core herding mechanic — a sheep pressed against the fence
by the dog slides along it straight toward the gate.

### 10.5 One-way gate
The gate `mouth` segment is resolved **only against outward motion** (when
`vel · inwardNormal < 0`): sheep may freely enter, but a swept outward crossing is clamped
back. Combined with penned interior-seeking behaviour (§11.4), escapes are impossible while
entry stays frictionless. **The dog is exempt** from the one-way gate (it may enter to push
stragglers and leave), but still collides with solid fences and obstacles.

---

## 11. Pen system (`PenSystem`, `penGen.ts`)

### 11.1 One geometry → two models
The pen is an **ordered ring of vertices** (`outline`) + `gateEdge`.
- **Containment model:** the **closed** ring (include `last→first`) for `pointInPolygon` — concave-safe.
- **Physics model:** the same edges **minus `gateEdge`** = the solid `fences`. The missing edge **is** the gate.
- **Gate inward normal:** from polygon winding (sign of signed area), so "in vs out" is derived, never hand-set.

### 11.2 Random pen generation (per flock)
Each new flock gets a **freshly generated arbitrary simple polygon**:
- Random vertex count (e.g. 5–9), random center within the pasture (away from edges/water),
  random base radius, per-vertex angle + radius jitter, sorted by angle to stay simple
  (non-self-intersecting). Round pens emerge naturally at high vertex counts.
- Pick a random `gateEdge`; **validate gate width** ≥ a few sheep-widths (regenerate that
  edge or the polygon if too narrow). Validate the polygon is simple and large enough to
  hold the flock.
- Rebuild `fences`, `gate`, `windingCCW`, `aabb`, and the `staticIndex`.

### 11.3 Capture
A sheep whose `pos` tests **inside** the polygon flips `penned = true`, is added to
`pen.contained`, and switches to penned behaviour. (Because the gate edge still closes the
polygon, a sheep that walked through the opening is correctly detected as inside.)

### 11.4 Penned behaviour (hybrid containment)
Penned sheep switch to a calm **interior-seeking wander**: gentle `arrive` toward the pen
centroid + reduced separation, drifting away from the gate; `fear` response is damped so a
late bark doesn't blast them back out. The **one-way gate** (§10.5) is the hard backstop, so
escapes are physically impossible while they still look like they're milling naturally.

### 11.5 Fill & respawn (`Game.ts`)
When `pen.contained.size === sheep.length`, `PenSystem` emits `signals.penFilled`; `Game`
listens and runs the respawn flow:
1. A small celebratory beat — penned sheep play a brief happy bob, a `sparkle` FX pops over
   the pen, the HUD flock counter completes + flashes, an optional soft "woof" — a visual beat,
   not a score popup. (FX/HUD/audio react to the signal.)
2. Penned sheep fade out / leave, then are **returned to the sheep `AgentPool`** (no GC churn).
3. The treat `Emitter` fires a **bonus `Treat`** near the pen (see §13).
4. **Generate a new random pen** (§11.2), then re-point the sheep `Emitter`'s `area` to the
   **far side** of the pasture (away from the new pen) and have it emit a fresh flock from the
   pool. The loop continues endlessly. Spawning is materialized by `SpawnSystem` (§5.2 step 13).

---

## 12. Dog mechanics

### 12.1 Controls
- **Move:** WASD / arrow keys, 8-way, normalized.
- **Sprint:** hold **Shift** — `sprintMult` speed while `stamina > 0`, drains stamina.
- **Bark:** **Space** — see §12.3.

### 12.2 Presence (passive)
Every frame the dog emits a `StressSource{kind:'presence'}` at its position (small radius,
low intensity) so nearby sheep keep a mild distance — gentle, constant herding pressure.

### 12.3 Bark
On Space press, if `barkCooldown == 0` and `stamina ≥ barkCost`:
- Spend `barkCost` stamina; set `barkCooldown`.
- Emit a `StressSource{kind:'bark'}` (large radius, high intensity, short ttl ≈ 0.2s) — the
  "loud sound" sheep fear; strongly flees sheep in radius.
- Trigger the `*_bark` animation flash + a `bark_ring` FX expanding from the dog.
- **Mega-bark** buff multiplies the bark radius and ttl for its duration.

### 12.4 Stamina (`StaminaSystem`) — gentle
- `stamina ∈ [0, staminaMax]`. Sprinting drains `sprintDrain/s`; barking costs `barkCost`.
- Regenerates `regen/s` whenever not sprinting (faster when idle).
- **No fail state:** at 0, sprint/bark are simply unavailable until some regenerates. Treats
  top it up. HUD shows a stamina bar.

---

## 13. Fun layer

### 13.1 Treats (`PickupSystem` + treat `Emitter`)
- **Spawn:** a treat `Emitter` with `period` 12–20s and a `max` cap drips treats around the
  pasture, **plus** the bonus emission on each completed pen (§11.5). The emitter rejects
  candidate positions on water/obstacles/inside the pen; treats come from the treat `AgentPool`.
- **Collect:** when the dog overlaps a treat (`dist < dog.radius + treat.radius`), consume it
  (return it to the pool): always **refill stamina**, and with `buffChance` grant a power-up.
  `PickupSystem` emits `signals.treatCollected` so the HUD/FX react.
- Detouring for a treat means leaving the flock — a small, pleasant tension.

### 13.2 Power-ups / buffs (`BuffSystem`)
Timed, **one active at a time** (a new pickup refreshes/replaces):

| Buff       | Effect                                                        |
| ---------- | ------------------------------------------------------------ |
| `zoomies`  | dog `maxSpeed × zoomiesMult` for the duration (free, no drain)|
| `megabark` | bark radius × and ttl × for the duration                     |
| `calm`     | incoming sheep `fear` scaled down (sheep less skittish)      |

HUD shows the active buff icon + remaining time.

### 13.3 Status HUD (`@getback/game` `render/Hud.ts`)
A minimal, pixel-styled **status** overlay — it shows current state, **not a score** (still no
points, combos, or high score). Screen-space, drawn as the top render layer, positioned in the
480×270 logical space and scaled with the world (nearest-neighbour). It reads the `World`
(read-only) and reacts to `Signal`s; it never feeds back into the simulation. Elements:

| Element            | Shows                                            | Source / behaviour                                                                 |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Stamina meter**  | dog energy for sprint/bark                       | bar of `dog.stamina / staminaMax`; green→amber→red; **dims below `barkCost`** (can't bark) and at empty (can't sprint); small corgi icon beside it |
| **Flock counter**  | how much of the current flock is penned          | sheep icon + `penned / total` (`pen.contained.size` / flock size); a row of `total` pips fills as each sheep is penned. A pip animates on `sheepPenned`; the bar completes + flashes on `penFilled`, then resets for the new flock |
| **Active buff**    | current power-up + time left                     | the buff's atlas icon (`zoomies`/`megabark`/`calm`) + a shrinking radial for `Buff.timeLeft`; hidden when `dog.activeBuff === null` |

**Adapts to the scenario.** Each element is independently toggleable, and by default the HUD
auto-detects from the `World`: the **flock counter is hidden when there is no pen/flock** (e.g.
`examples/only-corgi`), the stamina meter always shows (there's always a dog). `mount()` accepts
an optional `hud` override (e.g. force-hide for a clean recording).

**Styling.** Unobtrusive and ambient to match the calm tone — small, low-contrast, tucked into
a corner (stamina bottom-left, flock counter top-center, buff by the stamina meter), optional
faint panel backing. Built with Pixi `Graphics` (bars) + atlas `Sprite`s (icons/pips).

---

## 14. Configuration (`config.ts`)

Every tunable lives in one file: logical resolution & bounds; flock size; sheep trait
ranges; all steering weights and radii; fear intensities & decay; dog speed/force/sprint;
bark radius/ttl/cooldown/cost; stamina max/drain/regen; buff durations & multipliers; treat
spawn interval/cap/buff-chance; grass cell size/regrow/deplete; ambient-scare interval;
pen-generation parameters (vertex range, radius, gate-width min); damping; `dt` clamp.

Starting defaults (subject to tuning):
- Resolution `480×270`; flock `≈ 18`.
- Sheep: `maxSpeed ≈ 38px/s (±20%)`, `maxForce ≈ 80`, `radius 5`, `personalSpace 12`, `perception 40`, `kNeighbors 6`.
- Weights: separation `1.6`, cohesion `0.9`, follow `0.5`, flee `2.5`, wallAvoid `1.8`, obstacleAvoid `1.6`, bounds `1.4`, wander `0.3`.
- Fear: bark `1.0`, presence `0.25`, ambient `0.8`, decay `1.2/s`.
- Dog: `maxSpeed 70`, `sprintMult 1.6`, `maxForce 400`, `radius 6`.
- Bark: radius `70`, ttl `0.2s`, cooldown `0.8s`, cost `12`.
- Stamina: max `100`, sprintDrain `18/s`, regen `22/s`.
- Buffs: zoomies `4s ×1.8`, megabark `6s` (radius `×1.7`, ttl `×1.5`), calm `6s` (fear `×0.4`).
- Treats: every `12–20s`, max `3`, buffChance `0.5`.
- Grass: cell `16px`, regrow `0.04/s`, deplete `0.5/s`.
- Ambient scare: every `18–35s`.

---

## 15. Testing strategy

Every `packages/*` is Pixi-free and unit-tested with **Vitest** (TDD); the app's render code is
the only untested-by-unit code. By package:

**`@getback/math`**
- `vec2`; `geometry`: closest-point-on-segment (incl. vertex clamping), point-in-polygon
  (convex + concave), winding/signed-area, swept circle-segment intersection.
- `rng`: deterministic sequence for a fixed seed.

**`@getback/signal`**
- `Signal`: add/remove/emit ordering; removed listeners don't fire.

**`@getback/spatial`**
- `grid`: incremental cell move on entity update; radius query returns all neighbours, no false negatives at cell borders.
- `staticIndex`: AABB insert/query correctness (wrapper over `rbush`).

**`@getback/motor`**
- `steering/primitives`: truncate/seek/flee/arrive.
- `steering/Behavior` `combine()`: prioritized truncation respects the `maxForce` budget and order (saturated flee starves wander; budget never exceeded); nodes: `Selector` stops at first `fired`, `Conditional` branches on its predicate, `Sequence` runs all.
- `ai/behaviors`: each leaf in isolation (separation pushes apart, cohesion → k-nearest centroid, follow ignores stationary neighbours, fear multiplies cohesion, wallAvoid radial at a vertex, `intentFollow` steers to `ctx.intent.moveDir` and brakes on zero).
- `ai/predicates`: `isAfraid`/`isPenned`/`thirstIsTop`/`hungerIsTop` thresholds; a built sheep tree picks the expected goal per drive.
- `CollisionSystem`: circle resolution; fence corner cases (vertex push is radial, no tunneling under large dt via CCD, never crosses to wrong side); one-way gate (in allowed, out blocked; dog exempt).
- `PenSystem`: capture via point-in-polygon; fill detection emits `penFilled`; `penGen` always produces a simple polygon with a valid gate width.
- `DriveSystem`: drive rise/decay and fear-from-stress math.
- `world/Emitter`: period/amount/max gating; spawn-area sampling rejects invalid positions.
- `world/Pool`: acquire/release reuse (no growth when balanced) — guards the no-GC-churn path.
- `StaminaSystem`/`BuffSystem`: drain/regen bounds, buff expiry.

Render code (`@getback/game/src/render/*` + `Runner.ts`) is visual and not unit-tested; verified by running an app/example.

### Robustness
- `dt` clamped (`≤ 1/30`); zero-vector normalization guarded; CCD prevents tunneling;
  point-in-polygon is the authoritative side test; relaxation iterations settle wedges.
- Atlas load failure shows an on-screen error instead of a blank canvas.

---

## 16. Out of scope (for now)

- Sound design beyond optional simple bark/ambient cues.
- Multiple/varied dog or sheep breeds.
- Persistence, settings menu, mobile/touch controls.
- Salt-lick attractor, day/night, weather.
- Scoring/progression of any kind.
- swarm's pheromone/stigmergy fields and agent path-`track` history (easy to add later atop the same behavior-tree + Signal infrastructure if we want fear-diffusion or debug trails).

These are intentionally deferred to keep the first build focused on the core herding
simulation and movement quality.
```
