import { Container, Graphics } from "pixi.js";
import type { Vec2 } from "@getback/math";
import type { GameSignals } from "@getback/motor";

// ── Pure FX data types ────────────────────────────────────────────────────────

export interface BarkRingFx {
  kind:      "barkRing";
  pos:       Vec2;
  age:       number;
  lifetime:  number;
  radius:    number;
  maxRadius: number;
}

export interface DustPuffFx {
  kind:     "dustPuff";
  pos:      Vec2;
  age:      number;
  lifetime: number;
}

export interface SparkleFx {
  kind:     "sparkle";
  pos:      Vec2;
  age:      number;
  lifetime: number;
}

export type FxInstance = BarkRingFx | DustPuffFx | SparkleFx;

// ── Spawn factories ───────────────────────────────────────────────────────────

const BARK_RING_LIFETIME  = 0.35; // seconds
const BARK_RING_MAX_R     = 50;   // px at full expansion
const DUST_PUFF_LIFETIME  = 0.4;
const SPARKLE_LIFETIME    = 0.55;

export function createBarkRing(pos: Vec2): BarkRingFx {
  return { kind: "barkRing", pos: { x: pos.x, y: pos.y }, age: 0, lifetime: BARK_RING_LIFETIME, radius: 0, maxRadius: BARK_RING_MAX_R };
}

export function createDustPuff(pos: Vec2): DustPuffFx {
  return { kind: "dustPuff", pos: { x: pos.x, y: pos.y }, age: 0, lifetime: DUST_PUFF_LIFETIME };
}

export function createSparkle(pos: Vec2): SparkleFx {
  return { kind: "sparkle", pos: { x: pos.x, y: pos.y }, age: 0, lifetime: SPARKLE_LIFETIME };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** Advance an FX instance by `dt` seconds; updates derived fields (e.g. ring radius). */
export function ageFx(fx: FxInstance, dt: number): void {
  fx.age += dt;
  if (fx.kind === "barkRing") {
    const t = Math.min(fx.age / fx.lifetime, 1);
    fx.radius = t * fx.maxRadius;
  }
}

export function isFxAlive(fx: FxInstance): boolean {
  return fx.age < fx.lifetime;
}

// ── FxSystem Pixi class ─────────────────────────────────────────────────────────

/**
 * Pixi rendering system for particle FX.
 * Subscribe to signals in the constructor; call update(dt) each frame.
 * Attach `.view` to the FX layer (above entities, below HUD).
 */
export class FxSystem {
  readonly view: Container;
  private readonly gfx:      Graphics;
  private readonly instances: FxInstance[] = [];

  constructor(signals: GameSignals) {
    this.view = new Container();
    this.gfx  = new Graphics();
    this.view.addChild(this.gfx);

    signals.barked.add((pos: Vec2) => {
      this.instances.push(createBarkRing(pos));
      this.instances.push(createDustPuff(pos));
    });

    signals.penFilled.add(() => {
      // Sparkle burst at a fixed pasture centre when pen fills.
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = 20;
        this.instances.push(
          createSparkle({ x: 240 + Math.cos(angle) * r, y: 135 + Math.sin(angle) * r }),
        );
      }
    });

    signals.treatCollected.add((pos: Vec2) => {
      this.instances.push(createSparkle(pos));
    });
  }

  update(dt: number): void {
    // Age all instances; remove expired ones.
    for (let i = this.instances.length - 1; i >= 0; i--) {
      ageFx(this.instances[i]!, dt);
      if (!isFxAlive(this.instances[i]!)) this.instances.splice(i, 1);
    }

    // Redraw all living instances.
    this.gfx.clear();
    for (const fx of this.instances) {
      const t = Math.min(fx.age / fx.lifetime, 1);
      const alpha = 1 - t; // fade out uniformly

      if (fx.kind === "barkRing") {
        this.gfx
          .circle(fx.pos.x, fx.pos.y, fx.radius)
          .stroke({ color: 0xffffff, width: 1.5, alpha: alpha * 0.9 });
      } else if (fx.kind === "dustPuff") {
        const r = 3 + t * 5;
        this.gfx
          .circle(fx.pos.x, fx.pos.y, r)
          .fill({ color: 0xd4b483, alpha: alpha * 0.6 });
      } else if (fx.kind === "sparkle") {
        const r = 2 + t * 4;
        this.gfx
          .circle(fx.pos.x, fx.pos.y, r)
          .fill({ color: 0xffee88, alpha: alpha * 0.8 });
      }
    }
  }
}
