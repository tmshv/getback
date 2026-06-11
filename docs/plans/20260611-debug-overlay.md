# Debug overlay: schematic view of the simulation

## Problem

There is no way to *see* the simulation's internal state. The shipped render shows
final art only — you can't tell which mode a sheep is in, where its velocity/steering
force points, what its drives are, or how the static field (obstacles, attractors, pen)
relates to behavior. Tuning herding feel and debugging behavior is guesswork.

## Goal

A backtick-toggled debug view, available in `apps/getback` **and** every `examples/*`
(everything boots through `mount()`), that overlays — or fully replaces — the art with a
schematic of bounding boxes, vectors, rings, neighbor links, world gizmos, and per-entity
numeric readouts (mode + drives/stamina).

## Approach (decided)

A read-only `DebugOverlay` render layer driven each tick from `world`, plus a thin slice of
**motor instrumentation** so the overlay reads the *real* per-frame state instead of
re-deriving it (which would drift — see below).

### Three states, one key (backtick `` ` ``)

| state | art layers (terrain/props/entities/FX) | debug layer | what you see                         |
| ----- | -------------------------------------- | ----------- | ------------------------------------ |
| 0 off       | shown                            | hidden      | the normal game, untouched           |
| 1 overlay   | shown                            | shown       | gizmos drawn over the real art       |
| 2 schematic | **hidden**                       | shown       | art gone — only boxes/vectors/labels |

HUD and the pasture-green background stay in all states. State 2 hides the four art layers
(`terrainLayer`, `propsLayer`, `entitiesLayer`, `fxLayer`) by setting `.visible = false`.

### What the overlay draws

Per mobile (sheep + dog):
- collision circle (`radius`)
- **velocity** vector (read live from `vel`)
- **steering-force** vector (from a snapshot — `force` is zeroed by `MovementSystem` after
  integration, so the overlay can't read it live)
- facing tick
- text tag (see numbers below)

Per sheep also:
- perception ring + personal-space ring (`traits.perception`, `traits.personalSpace`)
- neighbor links (line to each entry in `neighbors[]`)
- text tag: `mode` (+ `flee` flag) and drives `hun / thi / fear` (0–1)

Per dog text tag: `stamina`, active buff + time left, bark cooldown.

World gizmos (states 1 & 2): obstacle circles, water/shade attractor radii, pen outline +
gate edge.

### Why motor instrumentation (the mode + force)

- **Mode is not re-derivable from predicates.** The goal cascade is
  `selector([conditional(thirstIsTop, drink), conditional(hungerIsTop, graze), rest])`, and
  `drink`/`graze` can *skip* (no water, low hunger) so `rest` wins even when a predicate is
  true. Only the tree knows which branch actually fired. So we **tag** the mode leaves and
  record what fired, rather than guessing from `drives`.
- **Force is gone by overlay time**, so steering force is snapshotted right after the tree runs.

Instrumentation is transparent (same status, same force out) so all existing motor tests are
unaffected — it only writes a side-channel debug record.

## Architecture

```
motor (headless, +tiny debug side-channel)
 ├─ Mobile.debug?: { fired: string[]; force: Vec2 }   // optional, ignored by sim
 ├─ steering/combinators: tag(label, node)            // records label on fire
 ├─ ai/trees: wrap mode leaves — tag("penned"|"drink"|"graze"|"rest"|"flee", …)
 ├─ SteeringSystem: reset s.debug.fired, run tree, snapshot s.debug.force = {...s.force}
 └─ debug/classifySheepMode(fired): { mode, fleeing }  // pure

game (render)
 ├─ render/debugModel.ts   : entity → label lines + vector endpoints (pure, TDD)
 ├─ render/DebugOverlay.ts : Pixi Graphics+Text, draws from world each tick (manual)
 ├─ config.ts              : DEBUG block (key, colors, vector scale)
 └─ Runner.mount()         : debugLayer (zIndex above FX, below HUD) + backtick cycle
```

`DebugOverlay`/`mount` wiring imports pixi → manual-verify, matching repo convention. The
mode classifier, the `tag` combinator, and `debugModel` formatters are pure → TDD.

---

## Tasks

### Task 1: Motor debug side-channel (TDD)
- [ ] Add optional `debug?: { fired: string[]; force: Vec2 }` to `Mobile` (`types.ts`); init in
      `createSheep`, clear in `resetSheep`
- [ ] Add `tag(label: string, node: BehaviorNode): BehaviorNode` to `steering/combinators.ts`:
      runs `node`, and on `"fired"` pushes `label` into `e.debug?.fired`; returns the inner
      status and leaves `out` untouched otherwise. Tests: transparent status/force; records on
      fire; no-op when `e.debug` absent
- [ ] Add `classifySheepMode(fired: readonly string[]): { mode: "penned"|"drink"|"graze"|"rest"|"idle"; fleeing: boolean }`
      (new `debug.ts`): priority penned > drink > graze > rest, `idle` if none; `fleeing = fired.includes("flee")`. Tests cover each branch + tie priority

### Task 2: Wire tags into the sheep tree + snapshot (TDD)
- [ ] In `buildSheepTree`, wrap the mode leaves: `tag("penned", …)`, `tag("drink", …)`,
      `tag("graze", …)`, `tag("rest", …)`, `tag("flee", fleeStress())`
- [ ] In `steeringSystem`, before `run`: `if (s.debug) s.debug.fired.length = 0`; after `run`:
      snapshot `s.debug.force = { x: s.force.x, y: s.force.y }`
- [ ] Test: a penned sheep reports `fired` containing `"penned"`; a hungry sheep on grass
      reports `"graze"`; force snapshot equals post-steer force
- [ ] Export `classifySheepMode` + types from `@getback/motor`

### Task 3: Game pure debug model (TDD)
- [ ] `render/debugModel.ts`: `sheepLabel(sheep)`, `dogLabel(dog)` → string lines (mode, flee,
      drives / stamina+buff+cooldown), and `vectorEnd(pos, vec, scale)` → endpoint. Pure, tested
- [ ] Add `DEBUG` block to `packages/game/src/config.ts`: toggle key, vector scale, ring/line
      colors, label font size

### Task 4: DebugOverlay + mount wiring (manual verify)
- [ ] `render/DebugOverlay.ts`: owns a `Container`; `draw(world)` clears and redraws all gizmos
      (per-mobile circle/vectors/facing/label, per-sheep rings + neighbor links, world gizmos)
- [ ] In `mount()`: add `debugLayer` (zIndex between `FX` and `HUD`); construct `DebugOverlay`;
      add a backtick key handler cycling state 0→1→2→0; on each state set art-layer `.visible`
      and `debugLayer.visible`; call `overlay.draw(world)` in the ticker when not state 0
- [ ] Add `DEBUG` (HUD layer index unchanged) and a new `LAYER.DEBUG = 3.5`-style ordering, or
      insert between FX(3) and HUD(4)

### Task 5: Verify
- [ ] `npm run typecheck` + `npm test` green (existing motor tests unaffected by tags)
- [ ] Run `examples/one-sheep` (`npm run dev`): press backtick — confirm off → overlay →
      schematic; the single sheep shows mode + drives, velocity/force vectors, perception ring,
      neighbor links (with `several-sheep`), and world gizmos (pen, water/shade, obstacles)
- [ ] Run `apps/getback`: same toggle works in the full game

## Verification
- Unit: `tag`, `classifySheepMode`, `debugModel` formatters, force snapshot (Tasks 1–3).
- Manual: live toggle through the three states in `examples/*` and `apps/getback` (Tasks 4–5).
