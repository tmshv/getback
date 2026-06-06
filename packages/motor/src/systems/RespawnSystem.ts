import { generatePen } from "../world/penGen.js";
import { buildPen, penContains } from "../world/Pen.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import { config } from "../config.js";
import type { World } from "../world/World.js";

// When every sheep is penned, the flock has been herded home: fire penFilled,
// then drop in a fresh scattered flock (same count) and a newly generated pen.
export function respawnSystem(world: World): void {
  const pen = world.pen;
  const flock = world.sheep;
  if (!pen || flock.length === 0) return;
  if (pen.contained.size < flock.length) return; // not all penned yet

  world.signals.penFilled.emit();

  const count = flock.length;
  const rng = world.rng;
  const b = world.bounds;

  // a new pen at a random centre that fits inside the pasture. Assumes
  // rMax <= min(w,h)/2 so the inset range stays valid (true for config defaults).
  const m = config.pen.rMax;
  const center = { x: rng.range(b.x + m, b.x + b.w - m), y: rng.range(b.y + m, b.y + b.h - m) };
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

  // refill with a brand-new flock, scattered outside the new pen
  const fresh: typeof flock = [];
  const margin = config.respawn.scatterMargin;
  for (let i = 0; i < count; i++) {
    let x = b.x + b.w / 2;
    let y = b.y + b.h / 2;
    for (let tries = 0; tries < config.respawn.scatterTries; tries++) {
      x = rng.range(b.x + margin, b.x + b.w - margin);
      y = rng.range(b.y + margin, b.y + b.h - margin);
      if (!penContains(newPen, { x, y })) break;
    }
    fresh.push(createSheep({ x, y }, defaultSheepTraits()));
  }
  world.sheep = fresh;
}
