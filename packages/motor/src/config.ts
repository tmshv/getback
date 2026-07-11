// All movement/flock tunables in one place. Grows in later plans.
export const config = {
  dtClampMax: 1 / 30, // clamp dt to avoid integration blow-ups / tunneling on hitches
  damping: 0.02, // velocity fraction RETAINED per second when no force (snappy coast-to-stop)
  flock: {
    radius: 5,
    maxSpeed: 50,
    maxForce: 200,
    accelGain: 3, // multiplies the blended steering force so sheep reach speed quickly (direction unchanged)
    personalSpace: 12,
    perception: 40,
    cohesionK: 6,
    // Cohesion comfort band: a sheep within `cohesionComfort` of the flock centroid
    // feels no pull (it's already huddled). Must be WIDER than personalSpace (12) so
    // there is a neutral gap between separation's push-out zone and cohesion's pull-in
    // zone — that gap is what kills the in-place huddle jitter. Beyond it, desired
    // speed ramps from 0 to maxSpeed over `cohesionRamp` px so the pull eases in.
    cohesionComfort: 36, // ~3×personalSpace
    cohesionRamp: 40,
    // Cruise speed by what the sheep is DOING (× its trait top speed), applied to
    // maxSpeed each frame so the desired steering speed AND the velocity clamp move
    // together. A content sheep stands still (no goal force → the settle damper
    // stops it), so idleSpeedMult is only a cap on any residual nudge. A hungry or
    // thirsty sheep ambles to food/water at goalSpeedMult. Fear ramps the cap up
    // toward alarmSpeedMult (flee fast) as it approaches warnFear.
    idleSpeedMult: 0.2,
    goalSpeedMult: 0.3,
    alarmSpeedMult: 1.0,
    warnFear: 0.4, // fear at/above which the sheep is at full alarm speed
    // Foraging cycle (hysteresis): a content sheep starts grazing/drinking once a
    // drive crosses its *Threshold, and keeps at it until the drive falls to *Sated,
    // then goes back to standing idle. The gap prevents flapping at the threshold.
    // Drives only fall while actively foraging (see DriveSystem), so an idle sheep's
    // hunger/thirst keep rising — it periodically gets up to eat/drink, then rests.
    hungerThreshold: 0.5,
    hungerSated: 0.15,
    thirstThreshold: 0.5,
    thirstSated: 0.0, // drink to empty so a water trip lasts a long time (less camping)
    moveThreshold: 2, // px/s: a neighbour faster than this counts as "moving" for follow
    weights: { separation: 1.6, cohesion: 0.9, follow: 0.5 },
    // "Settle when content": a contented sheep (low hunger/thirst/fear) whose net
    // steering force is below `forceThreshold` brakes to a full stop instead of
    // drifting on micro-jitter. brakeGain is a stop-gain like the dog's.
    // speedMax: only brake slow residual drift; a sheep with real momentum (e.g.
    // mid-flee) keeps its motion and coasts via damping instead of stutter-stopping.
    settle: { hungerMax: 0.4, thirstMax: 0.4, fearMax: 0.15, speedMax: 14, forceThreshold: 14, brakeGain: 14 },
  },
  // Grass: each cell gets a random starting density in [densityMin, densityMax] at
  // world build. Grazing sheep then wear it DOWN at `depleteRate`/s (only while
  // actively grazing); there is NO regrow, so the pasture is finite and thins where
  // the herd feeds. (`regrowRate` is unused unless regrow is re-enabled in
  // GrassSystem.) depleteRate 0.2/s ≈ 5s of grazing to strip a full cell, so a
  // graze visibly thins the patch the sheep is feeding on.
  grass: { cellSize: 16, regrowRate: 0.0006, depleteRate: 0.2, densityMin: 0.2, densityMax: 1.0 },
  // thirstRate is low so sheep only trek to water occasionally (they graze out in
  // the pasture most of the time instead of camping the water hole).
  drives: { hungerRate: 0.05, grazeRate: 0.5, thirstRate: 0.01, drinkRate: 0.6 },
  graze: { weight: 1.0 }, // the goal sub-selector occupies this one blend slot (drink/graze/rest are mutually exclusive)
  obstacleAvoid: { weight: 1.6, avoidRadius: 18 },
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24, settleRadius: 30, settleWeight: 0.6 },
  respawn: { scatterMargin: 20, scatterTries: 20 }, // fresh-flock placement when a pen fills
  // accelGain multiplies the velocity-error move force so the dog snaps to top
  // speed (maxForce clamps the burst); stopGain does the same for braking.
  dog: { radius: 6, maxSpeed: 95, maxForce: 1200, sprintMult: 1.6, stopGain: 40, accelGain: 8 },
  // presenceIntensity reaches warnFear (0.4) so a sheep right next to the dog goes
  // to full alarm speed — the dog's presence herds firmly, not just gently. The
  // bark is a strong, wide scare: intensity >1 saturates fear (clamped to 1) across
  // an inner core and stays high out to a larger radius.
  scare: { presenceRadius: 30, presenceIntensity: 0.4, barkRadius: 100, barkIntensity: 1.6, barkCooldown: 0.8 },
  stamina: { max: 100, sprintDrain: 22, regen: 8, barkCost: 18 },
  flee: { weight: 3.5 }, // a scared sheep prioritises fleeing over grazing/flocking
  fear: { decay: 0.45 }, // fear units shed per second when no stress is near (lingers ~2.5× longer than before)
  bounds: { x: 0, y: 0, w: 480, h: 270 },
  attractor: {
    trunkRadius: 7,      // solid tree trunk
    shadeRadius: 28,     // restful shade canopy, larger than trunk
    waterRadius: 22,     // default water hole radius
    // The seek force drops to zero once a sheep reaches the inner "satisfied" core
    // (radius × satisfiedFraction) — it parks comfortably INSIDE the attractor
    // (where DriveSystem quenches thirst / it rests in shade) rather than fighting
    // a crowd over the exact centre. The core is kept well inside the full radius
    // so the sheep settles within the quench zone, not on its rim. Outside the
    // core, desired speed ramps from 0 up over `approachRamp` px.
    approachRamp: 40,
    satisfiedFraction: 0.5,
  },
  traits: {
    maxSpeedJitter: 0.2,   // ±20% of flock.maxSpeed
    boldnessMin: 0.3,
    boldnessMax: 0.9,
    sociabilityMin: 0.4,
    sociabilityMax: 1.0,
  },
  spawn: {
    flockSize: 18,
    period: Infinity,   // sentinel: periodic auto-emit disabled; RespawnSystem uses emitNow()
    areaInset: 30,
    poolInitialSize: 0,
    maxTries: 32,
  },
  treats: {
    periodMin: 12,
    periodMax: 20,
    max: 3,
    buffChance: 1.0, // the bone always grants a buff so a pickup always has a real effect
    radius: 4,
  },
  buffs: {
    zoomies:  { duration: 12,  mult: 1.8 },
    megabark: { duration: 12,  radiusMult: 1.7, ttlMult: 1.5 },
    calm:     { duration: 12,  fearMult: 0.4 },
  },
  ambient: {
    intervalMin: 18,
    intervalMax: 35,
    intensity: 0.8,
    radius: 9999, // effectively covers the whole 480×270 pasture
  },
} as const;
