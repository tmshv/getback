# Balance tuning guide

How to change the feel of the sheep/dog simulation. Every knob lives in one file:

**`packages/motor/src/config.ts`**

After editing, verify nothing broke:

```sh
npx vitest run packages/motor      # behaviour + integration tests
npm run typecheck                  # types across all packages
```

Many tests read the config values (not hard-coded numbers), so most tweaks stay
green automatically. A few tests assert specific behaviour at the *old* numbers
(e.g. "fear fully decays in N seconds") — if one fails after a change, it's
usually that test's time budget, not a real regression.

Units: rates are **per second**; distances are **logical px** (the world is
480×270); drives (`hunger`, `thirst`, `fear`) are **0..1**.

---

## Sheep speed

`config.flock`. A sheep's speed depends on what it's DOING. `maxSpeed` (50) is the
base; the mults scale it each frame. Per-sheep traits jitter the base ±20%.

| Want                                      | Change                 | Now | Direction            |
| ----------------------------------------- | ---------------------- | --- | -------------------- |
| Sheep faster/slower overall               | `flock.maxSpeed`       | 50  | ↑ faster             |
| Idle sheep drift more (they mostly stand) | `flock.idleSpeedMult`  | 0.2 | ↑ more drift         |
| Foraging (hungry/thirsty) pace            | `flock.goalSpeedMult`  | 0.3 | ↑ faster to food     |
| Flee speed when scared                    | `flock.alarmSpeedMult` | 1.0 | ↑ (>1 = panic burst) |
| Sheep hit full speed at less fear         | `flock.warnFear`       | 0.4 | ↓ jumpier            |

Idle sheep stand still regardless of `idleSpeedMult` (the settle damper stops
them); the mult only caps a residual nudge.

---

## Hunger & thirst (the forage rhythm: rest → eat/drink → rest)

`config.drives` (rates) + `config.flock` (thresholds). Model: hunger & thirst RISE
while a sheep is idle and FALL only while it is actively foraging (grazing on
grass / drinking in water). A sheep starts foraging when a drive crosses its
`*Threshold` and keeps at it until the drive drops to `*Sated`, then rests again.
Thirst takes priority over hunger. So sheep eat/drink from time to time and rest
in between — they do NOT camp a resource forever.

| Want                                         | Change                              | Now  | Direction          |
| -------------------------------------------- | ----------------------------------- | ---- | ------------------ |
| Sheep get hungry sooner (graze more often)   | `drives.hungerRate`                 | 0.05 | ↑ hungrier faster  |
| Sheep get thirsty sooner (drink more often)  | `drives.thirstRate`                 | 0.03 | ↑ thirstier faster |
| Eating refills hunger faster (shorter graze) | `drives.grazeRate`                  | 0.5  | ↑ eats faster      |
| Drinking refills thirst faster               | `drives.drinkRate`                  | 0.6  | ↑ drinks faster    |
| Sheep get up to graze at a lower hunger      | `flock.hungerThreshold`             | 0.5  | ↓ forage sooner    |
| Sheep get up to drink at a lower thirst      | `flock.thirstThreshold`             | 0.5  | ↓ forage sooner    |
| Graze/drink for longer once started          | `flock.hungerSated` / `thirstSated` | 0.15 | ↓ longer sessions  |

`hungerRate 0.05` ≈ a rested sheep gets hungry (crosses 0.5) in ~10s; `thirstRate
0.03` ≈ ~17s. Lower thresholds / higher rates ⇒ sheep forage more often (more
motion); higher thresholds / lower rates ⇒ longer calm rests between trips. The
`*Sated` gap below the threshold is hysteresis (prevents flapping); widen the gap
(lower `*Sated`) for longer foraging bursts.

### Grass (a FROZEN random field)

`config.grass`. Each cell gets a random density once at world start and **never
changes** — no graze depletion, no regrow (the dynamic `grassSystem` is not run;
re-enable it in `Game.update` to bring depletion back). Sheep still read this field:
graze steers toward greener cells, and a cell's density sets how fast a grazing
sheep there refills hunger.

| Want                            | Change                            | Now       | Direction         |
| ------------------------------- | --------------------------------- | --------- | ----------------- |
| More/less grass overall         | `grass.densityMin` / `densityMax` | 0.2 / 1.0 | ↑ greener pasture |
| Less variation cell-to-cell     | narrow the min↔max gap            | 0.2–1.0   | closer = uniform  |
| (dynamic only) graze-down speed | `grass.depleteRate`               | 0.05      | ↓ slower drain    |
| (dynamic only) regrow speed     | `grass.regrowRate`                | 0.0006    | ↑ faster regrow   |

`depleteRate`/`regrowRate` only matter if you re-enable the dynamic grass system.

---

## Fear, bark & fleeing (the dog's herding power)

`config.scare`, `config.fear`, `config.flee`. Chain: the dog emits stress →
`FearSystem` turns stress into each sheep's `fear` → high fear = full flee speed +
the `flee` behaviour steers away.

| Want                                      | Change                    | Now  | Direction        |
| ----------------------------------------- | ------------------------- | ---- | ---------------- |
| Panic lasts longer after a bark           | `fear.decay`              | 0.45 | ↓ lingers longer |
| Bark scares harder / wider core           | `scare.barkIntensity`     | 1.6  | ↑ stronger       |
| Bark reaches more sheep                   | `scare.barkRadius`        | 100  | ↑ wider          |
| Bark faster repeat                        | `scare.barkCooldown`      | 0.8  | ↓ more often     |
| Bark costs less stamina (spammier)        | `stamina.barkCost`        | 18   | ↓ cheaper        |
| Dog's mere presence pushes harder         | `scare.presenceIntensity` | 0.4  | ↑ scarier nearby |
| Presence reaches further                  | `scare.presenceRadius`    | 30   | ↑ wider          |
| Scared sheep flee harder (vs graze/flock) | `flee.weight`             | 3.5  | ↑ bolts harder   |

Notes:
- `fear` is clamped to 1; `barkIntensity > 1` saturates a larger inner core to
  max fear (gentler falloff = more sheep panic).
- A sheep reaches **full flee speed** at `fear ≥ flock.warnFear` (0.4). Keep
  `presenceIntensity ≥ warnFear` if you want the dog's presence alone to send
  nearby sheep to top speed.
- `fear.decay 0.45` ≈ fear from a bark lingers ~1–2s. Drop toward 0.3 for a longer
  panic; raise toward 1.0 to make sheep shrug it off quickly.

---

## Flocking shape (how tight the herd packs)

`config.flock`. Three boid forces are blended: `separation` (push apart),
`cohesion` (pull together), `follow` (match moving neighbours).

| Want                                | Change                     | Now | Direction                |
| ----------------------------------- | -------------------------- | --- | ------------------------ |
| Herd packs tighter                  | `flock.cohesionComfort`    | 36  | ↓ tighter huddle         |
| Sheep keep more personal space      | `flock.personalSpace`      | 12  | ↑ more spread            |
| Stronger pull-together              | `flock.weights.cohesion`   | 0.9 | ↑ tighter                |
| Stronger push-apart                 | `flock.weights.separation` | 1.6 | ↑ looser                 |
| More contagious "follow the leader" | `flock.weights.follow`     | 0.5 | ↑ more streaming         |
| Sheep notice neighbours further     | `flock.perception`         | 40  | ↑ bigger flock awareness |

**Gotcha:** keep `cohesionComfort` clearly **larger than** `personalSpace` (≈2–3×).
The neutral gap between "too close → push" and "too far → pull" is what stops the
huddle from jittering in place. If they twitch when bunched, widen the gap.

### Settle (content sheep stop cleanly)

`config.flock.settle` — brakes a calm, low-force sheep to a full stop.

| Want                                  | Change                           | Now  | Direction               |
| ------------------------------------- | -------------------------------- | ---- | ----------------------- |
| Sheep settle from higher speeds       | `settle.speedMax`                | 14   | ↑ brakes sooner         |
| Treat slightly-needy sheep as content | `settle.hungerMax` / `thirstMax` | 0.4  | ↑ settles when hungrier |
| Tolerate more fear before settling    | `settle.fearMax`                 | 0.15 | ↑                       |

---

## Dog (the player)

`config.dog`.

| Want                  | Change           | Now | Direction       |
| --------------------- | ---------------- | --- | --------------- |
| Dog faster            | `dog.maxSpeed`   | 95  | ↑ faster        |
| Sprint boost size     | `dog.sprintMult` | 1.6 | ↑ faster sprint |
| Snappier acceleration | `dog.accelGain`  | 8   | ↑ snappier      |
| Snappier stop         | `dog.stopGain`   | 40  | ↑ harder brake  |

`stopGain` is auto-capped to `1/dt` internally, so a clean stop never overshoots
into the arrow flicker even at low frame rates — raise it freely.

## Stamina (limits sprint & bark spam)

`config.stamina`.

| Want                      | Change                | Now | Direction         |
| ------------------------- | --------------------- | --- | ----------------- |
| Sprint lasts longer       | `stamina.sprintDrain` | 22  | ↓ lasts longer    |
| Recovers faster           | `stamina.regen`       | 8   | ↑ faster recovery |
| Bark cheaper (more barks) | `stamina.barkCost`    | 18  | ↓ cheaper         |
| Bigger pool               | `stamina.max`         | 100 | ↑                 |

---

## Quick recipes (common asks)

| Ask                                   | Turn these                                                        |
| ------------------------------------- | ----------------------------------------------------------------- |
| "Sheep too restless / always moving"  | ↑ `hungerThreshold`/`thirstThreshold`, ↓ `goalSpeedMult`          |
| "Sheep too lazy / never eat or drink" | ↓ thresholds, ↑ `hungerRate`/`thirstRate`                         |
| "Bark feels weak"                     | ↓ `fear.decay`, ↑ `barkIntensity` / `barkRadius`, ↑ `flee.weight` |
| "Dog can't herd them"                 | ↑ `presenceIntensity` / `presenceRadius`, ↑ `flee.weight`         |
| "Herd too scattered"                  | ↓ `cohesionComfort`, ↑ `weights.cohesion`                         |
| "Herd jitters when bunched"           | ↑ `cohesionComfort` (keep ≥ 2× `personalSpace`)                   |
| "Panic ends too fast"                 | ↓ `fear.decay` (toward 0.3)                                       |
| "Pasture too sparse / too lush"       | `grass.densityMin` / `densityMax`                                 |

---

## Other groups (less commonly tuned)

- `config.traits` — per-sheep randomisation: `maxSpeedJitter` (±speed), `boldness*`/`sociability*` ranges.
- `config.buffs` — bone pickups: `zoomies.mult` (dog speed), `megabark.radiusMult`, `calm.fearMult` (×fear while active).
- `config.treats` — bone spawn: `periodMin/Max` (seconds between), `max` on field at once.
- `config.ambient` — random pasture-wide spooks: `intervalMin/Max` (seconds), `intensity`.
- `config.spawn` — `flockSize` (sheep per flock).
- `config.pen` — pen geometry + settle pull.
- `config.attractor` — water/shade radii, `satisfiedFraction` (how far inside an attractor a sheep parks).
