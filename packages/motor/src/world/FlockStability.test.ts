import { describe, it, expect } from "vitest";
import { Game } from "./Game.js";
import { createWorld } from "./World.js";
import { createSheep, defaultSheepTraits } from "../entities/Sheep.js";
import type { Sheep } from "../entities/Sheep.js";

// Regression guard for the "huddle jitter" bug: a clustered, contented flock used
// to twitch in place because cohesion (always seeking the centroid at full speed)
// and separation (pushing apart inside personalSpace) formed a high-frequency
// limit cycle — the blended steering force reversed direction ~16x/second per
// sheep. cohesion's comfort band (config.flock.cohesionComfort) opens a neutral
// gap between the two so a huddled sheep feels no pull and sits still.
//
// We measure direction reversals of the per-frame steering force (a sharp >107°
// flip vs the previous frame) as a proxy for visible jitter. Pre-fix this scenario
// produced ~16 reversals/s/sheep; post-fix it is well under 3.
function reversalRatePerSheep(sheep: Sheep[], seconds: number): number {
  const world = createWorld(sheep, undefined, [], null, null, undefined, []);
  const game = new Game(world);
  const dt = 1 / 60;
  const frames = seconds * 60;
  const warmup = 60;
  const prev = sheep.map(() => ({ x: 0, y: 0 }));
  let reversals = 0;
  for (let f = 0; f < frames; f++) {
    game.update(dt);
    if (f >= warmup) {
      sheep.forEach((s, i) => {
        const fx = s.debug!.force.x, fy = s.debug!.force.y;
        const m1 = Math.hypot(fx, fy), m0 = Math.hypot(prev[i]!.x, prev[i]!.y);
        // Only count when both frames carry a real force; a >107° flip = jitter.
        if (m1 > 1 && m0 > 1 && (fx * prev[i]!.x + fy * prev[i]!.y) / (m1 * m0) < -0.3) reversals++;
        prev[i]!.x = fx; prev[i]!.y = fy;
      });
    }
  }
  return reversals / sheep.length / ((frames - warmup) / 60);
}

function ring(n: number, radius: number): Sheep[] {
  const s: Sheep[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    s.push(createSheep({ x: 240 + Math.cos(a) * radius, y: 135 + Math.sin(a) * radius }, defaultSheepTraits()));
  }
  return s;
}

describe("flock stability (huddle-jitter regression)", () => {
  it("a tightly clustered, contented flock does not twitch in place", () => {
    // 8 sheep packed inside a single huddle — the worst case for the old
    // cohesion/separation tug-of-war.
    const rate = reversalRatePerSheep(ring(8, 18), 12);
    expect(rate).toBeLessThan(3);
  });

  it("a loosely clustered flock is also stable", () => {
    const rate = reversalRatePerSheep(ring(8, 30), 12);
    expect(rate).toBeLessThan(3);
  });

  it("a lone sheep is perfectly still on flat grass", () => {
    const rate = reversalRatePerSheep(ring(1, 0), 8);
    expect(rate).toBe(0);
  });
});
