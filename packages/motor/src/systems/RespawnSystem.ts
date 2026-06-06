import { generatePen } from "../world/penGen.js";
import { buildPen, penContains } from "../world/Pen.js";
import { createSheep, defaultSheepTraits, resetSheep } from "../entities/Sheep.js";
import { config } from "../config.js";
import type { World } from "../world/World.js";
import { rectGeometry } from "../world/Emitter.js";

// When every sheep is penned, the flock has been herded home: fire penFilled,
// release the flock back to the pool (no GC churn), generate a new pen,
// re-point the sheep Emitter to the far side, and emit a fresh flock from the pool.
// Falls back to direct createSheep scatter when no pool/emitter is wired (headless
// examples / legacy tests that do not configure spawn infrastructure).
export function respawnSystem(world: World): void {
  const pen = world.pen;
  const flock = world.sheep;
  if (!pen || flock.length === 0) return;
  if (pen.contained.size < flock.length) return;

  world.signals.penFilled.emit();

  const count = flock.length;
  const rng = world.rng;
  const b = world.bounds;

  // Release all penned sheep back to the pool (if pool is wired).
  const pool = world.sheepPool;
  if (pool) {
    for (const s of flock) pool.release(s);
    // Also sync emitter.active down to zero.
    if (world.sheepEmitter) world.sheepEmitter.active = 0;
  }
  flock.length = 0;

  // Generate a new random pen.
  const m = config.pen.rMax;
  const center = {
    x: rng.range(b.x + m, b.x + b.w - m),
    y: rng.range(b.y + m, b.y + b.h - m),
  };
  const shape = generatePen(rng, {
    center,
    rMin: config.pen.rMin,
    rMax: config.pen.rMax,
    minVerts: config.pen.minVerts,
    maxVerts: config.pen.maxVerts,
    minGateWidth: config.pen.minGateWidth,
  });
  const newPen = buildPen(shape.outline, shape.gateEdge);
  world.pen = newPen;

  if (pool && world.sheepEmitter) {
    // Re-point the emitter to the far side of the pasture (mirror pen centroid
    // through the pasture centre), inset by areaInset.
    const inset = config.spawn.areaInset;
    const pcx = newPen.centroid.x;
    const pcy = newPen.centroid.y;
    const pastureCx = b.x + b.w / 2;
    const pastureCy = b.y + b.h / 2;
    // Mirror: far side centroid is (2*pastureCentre - penCentroid), clamped to inset rect.
    const farX = Math.min(Math.max(2 * pastureCx - pcx, b.x + inset), b.x + b.w - inset);
    const farY = Math.min(Math.max(2 * pastureCy - pcy, b.y + inset), b.y + b.h - inset);
    // Spawn rect: centred on the far point, sized to half the pasture, inset from bounds.
    const hw = (b.w / 2 - inset * 2) / 2;
    const hh = (b.h / 2 - inset * 2) / 2;
    const spawnRect = {
      x: Math.max(b.x + inset, farX - hw),
      y: Math.max(b.y + inset, farY - hh),
      w: hw * 2,
      h: hh * 2,
    };
    world.sheepEmitter.setGeometry(
      rectGeometry(spawnRect),
    );

    // Emit the full flock immediately (emitNow bypasses period timing).
    const positions = world.sheepEmitter.emitNow(count);
    for (const pos of positions) {
      // Re-sample if position lands inside the new pen.
      let finalPos = pos;
      if (penContains(newPen, pos)) {
        for (let t = 0; t < config.spawn.maxTries; t++) {
          const retry = rectGeometry(spawnRect).sample(rng);
          if (!penContains(newPen, retry)) { finalPos = retry; break; }
        }
      }
      const sheep = pool.acquire(finalPos);
      resetSheep(sheep, finalPos);
      flock.push(sheep);
      world.sheepEmitter.active++;
    }
  } else {
    // Fallback: legacy scatter (no pool configured) — keeps headless examples working.
    const margin = config.respawn.scatterMargin;
    for (let i = 0; i < count; i++) {
      let x = b.x + b.w / 2;
      let y = b.y + b.h / 2;
      for (let tries = 0; tries < config.respawn.scatterTries; tries++) {
        x = rng.range(b.x + margin, b.x + b.w - margin);
        y = rng.range(b.y + margin, b.y + b.h - margin);
        if (!penContains(newPen, { x, y })) break;
      }
      flock.push(createSheep({ x, y }, defaultSheepTraits()));
    }
  }
}
