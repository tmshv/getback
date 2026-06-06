import type { Vec2, Rng } from "@getback/math";
import type { Rect } from "./World.js";

/** Describes how spawn positions are sampled. */
export interface Geometry {
  sample(rng: Rng): Vec2;
}

/** Uniform random position inside an axis-aligned rectangle. */
export function rectGeometry(rect: Rect): Geometry {
  return {
    sample(rng: Rng): Vec2 {
      return {
        x: rng.range(rect.x, rect.x + rect.w),
        y: rng.range(rect.y, rect.y + rect.h),
      };
    },
  };
}

/** Always returns the same fixed point. Useful for treat spawns near the pen. */
export function pointGeometry(point: Vec2): Geometry {
  return {
    sample(_rng: Rng): Vec2 {
      return { x: point.x, y: point.y };
    },
  };
}

export interface EmitterOptions {
  geometry: Geometry;
  /** Seconds between automatic emits. */
  period: number;
  /** How many spawn positions to produce per emit. */
  amount: number;
  /** Maximum number of active (live) entities; emit is suppressed when active >= max. */
  max: number;
  /** Seeded Rng; all sampling goes through this for determinism. */
  rng: Rng;
  /** Optional: reject a candidate position — it will be re-sampled (up to 32 tries). */
  exclude?: (pos: Vec2) => boolean;
  /** Maximum re-sample attempts per position when exclude is given. */
  maxTries?: number;
}

/**
 * Declarative, period-based spawner.  Does NOT create entities — it returns
 * an array of Vec2 positions for SpawnSystem (or RespawnSystem) to materialise.
 *
 * `active` is a public counter the caller must keep in sync (increment on spawn,
 * decrement on release) so the Emitter can enforce its `max` cap.
 */
export class Emitter {
  private _elapsed = 0;
  private readonly _opts: EmitterOptions;
  /** Number of currently live (acquired) entities tracked by the owner. */
  active = 0;

  constructor(opts: EmitterOptions) {
    this._opts = opts;
  }

  /** Advance time; returns spawn positions if the period fired. */
  update(dt: number): Vec2[] {
    this._elapsed += dt;
    if (this._elapsed < this._opts.period) return [];
    this._elapsed -= this._opts.period;
    return this._sample();
  }

  /**
   * Emit `count` positions immediately, ignoring accumulated time.
   * Resets the time accumulator.  Used by RespawnSystem to force a
   * full-flock spawn in the same frame as penFilled.
   */
  emitNow(count: number): Vec2[] {
    this._elapsed = 0;
    return this._sampleN(count);
  }

  /** Repoint the geometry (e.g. after respawn moves the flock area). */
  setGeometry(geometry: Geometry): void {
    (this._opts as { geometry: Geometry }).geometry = geometry;
  }

  private _sample(): Vec2[] {
    const { max, amount } = this._opts;
    const slots = max - this.active;
    if (slots <= 0) return [];
    return this._sampleN(Math.min(amount, slots));
  }

  private _sampleN(n: number): Vec2[] {
    const { geometry, rng, exclude, maxTries = 32 } = this._opts;
    const result: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      let pos = geometry.sample(rng);
      if (exclude) {
        for (let t = 1; t < maxTries && exclude(pos); t++) {
          pos = geometry.sample(rng);
        }
      }
      result.push(pos);
    }
    return result;
  }
}
