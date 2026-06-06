# GetBack — Implementation Roadmap

Execution order of all plans. Each plan is a self-contained, working, tested slice; execute top to bottom with the subagent-driven-development workflow (branch → tasks → reviews → merge `--no-ff`). Spec: [`docs/specs/20260604-getback-corgi-herding.md`](../specs/20260604-getback-corgi-herding.md).

**Status legend:** ✅ merged · 📝 planned (written, not yet executed)

## Phase 1 — Headless motor (the simulation)

| #  | Plan                                                                           | What it delivers                                                        | Status |
| -- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------ |
| 1  | [foundations](20260605-foundations.md)                                         | monorepo, math/signal/spatial libs                                      | ✅     |
| 2  | [motor-movement-steering](20260605-motor-movement-steering.md)                 | Mobile, semi-implicit Euler, steering primitives, blend tree            | ✅     |
| 3  | [motor-grass-foraging](20260605-motor-grass-foraging.md)                       | grass field, hunger drive, graze gradient-follow                        | ✅     |
| 4  | [motor-obstacles-collision](20260605-motor-obstacles-collision.md)             | circle obstacles, push-out + slide, avoidance                           | ✅     |
| 5  | [motor-pen-capture](20260605-motor-pen-capture.md)                             | pen geometry, generation, containment capture                           | ✅     |
| 6  | [motor-fence-collision](20260605-motor-fence-collision.md)                     | corner-safe fences, swept CCD, one-way gate                             | ✅     |
| 7  | [motor-dog-intent](20260605-motor-dog-intent.md)                               | Dog, intent-follow control, presence pressure                          | ✅     |
| 8  | [motor-bark-flee](20260605-motor-bark-flee.md)                                 | bark stress source, flee behavior                                       | ✅     |
| 9  | [motor-stamina](20260606-motor-stamina.md)                                     | stamina gating sprint/bark                                              | ✅     |
| 10 | [motor-fear](20260606-motor-fear.md)                                           | fear drive, fear-boosted cohesion bunching                              | ✅     |
| 11 | [motor-respawn](20260606-motor-respawn.md)                                     | GameSignals + RespawnSystem (endless loop)                             | ✅     |
| 12 | [motor-herding-feel](20260606-motor-herding-feel.md)                           | penned-calm (selector/conditional nodes), dog blocked by fences        | 📝     |
| 13 | [motor-attractors-drives](20260606-motor-attractors-drives.md)                 | water/shade attractors, thirst & rest, trait variation                 | 📝     |
| 14 | [motor-spawn-infra](20260607-motor-spawn-infra.md)                             | Emitter + AgentPool + SpawnSystem, pool-based respawn                  | 📝     |
| 15 | [motor-treats-buffs-scares](20260608-motor-treats-buffs-scares.md)             | treats, PickupSystem, BuffSystem, ambient scares, richer signals       | 📝     |

## Phase 2 — Render layer & playable targets (PixiJS enters here)

| #  | Plan                                                                           | What it delivers                                                        | Status |
| -- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------ |
| 16 | [game-atlas-render](20260609-game-atlas-render.md)                             | `@getback/game`: atlas pipeline, RenderSystem, AnimationSystem, mount() | 📝     |
| 17 | [game-input-hud-app](20260610-game-input-hud-app.md)                           | keyboard input, HUD, FX, `apps/getback` (the playable game)            | 📝     |
| 18 | [examples](20260611-examples.md)                                               | `examples/{one-sheep,several-sheep,only-corgi}`                         | 📝     |

## Notes for the executor

- **Phase 1 stays Pixi-free.** The motor and `math`/`signal`/`spatial` are headless and fully unit-tested. PixiJS appears only in Phase 2 (`@getback/game`, `apps/*`, `examples/*`).
- **Cross-plan dependencies are forward-only.** A plan reuses what earlier plans merged — when a plan edits `Game.ts`'s update pipeline or a shared signature (e.g. `driveSystem` gains an `attractors` arg in Plan 13), reconcile its snippets against the *then-current* merged code; the plans assume sequential execution.
- **Render plans mark each step `[TDD]` / `[smoke]` / `[manual verify]`.** Pure logic (frame resolver, AnimationSystem, RenderSystem diff via injected factory, letterbox math, input mapping, HUD derivations) is TDD; Pixi wiring is smoke/manual.
- After Phase 2: remaining work is tuning, optional audio, and polish — not new subsystems.
