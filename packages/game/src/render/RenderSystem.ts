import type { Mobile, World, Sheep, Dog } from "@getback/motor";
import { selectFrame } from "./AnimationSystem.js";
import type { EntityKind } from "../atlas/frames.js";
import { SHADOW_OFFSET_Y } from "../config.js";

// ── SpriteLike ───────────────────────────────────────────────────────────────
// A minimal interface so the diff logic is testable without real Pixi Sprites.
// The production factory returns Pixi Sprites (which satisfy this interface).
export interface SpriteLike {
  x:        number;
  y:        number;
  zIndex:   number;
  scaleX:   number;   // +1 or -1; callers set sprite.scale.x in prod
  texture:  string;   // frame name; production impl swaps the actual Texture
  shadowY:  number;
  destroy(): void;
}

// ── SpriteFactory ────────────────────────────────────────────────────────────
// Injected: creates an entity sprite + shadow sprite and returns both.
// Production impl: creates real Pixi Sprites from the loaded spritesheet.
export type SpriteFactory = (frameName: string) => { entity: SpriteLike; shadow: SpriteLike };

// ── ContainerLike ────────────────────────────────────────────────────────────
export interface ContainerLike {
  addChild(...s: SpriteLike[]): void;
  removeChild(...s: SpriteLike[]): void;
}

// ── Internal record per entity ───────────────────────────────────────────────
interface EntityRecord {
  entity: SpriteLike;
  shadow: SpriteLike;
}

// ── RenderSystem ─────────────────────────────────────────────────────────────
export class RenderSystem {
  private readonly sprites = new Map<Mobile, EntityRecord>();
  private readonly factory: SpriteFactory;
  private readonly container: ContainerLike;

  constructor(factory: SpriteFactory, container: ContainerLike) {
    this.factory   = factory;
    this.container = container;
  }

  /**
   * Sync the sprite map with the current world state.
   * @param world    - motor World (read-only from render perspective)
   * @param timers   - anim timer accumulator, keyed by entity identity; caller owns this Map
   * @param dt       - seconds since last frame
   */
  sync(world: World, timers: Map<Mobile, number>, dt: number): void {
    // Collect all current mobiles
    const current = new Set<Mobile>();
    for (const s of world.sheep) current.add(s);
    if (world.dog) current.add(world.dog);

    // Remove departed entities
    for (const [mobile, rec] of this.sprites) {
      if (!current.has(mobile)) {
        this.container.removeChild(rec.entity, rec.shadow);
        rec.entity.destroy();
        rec.shadow.destroy();
        this.sprites.delete(mobile);
        timers.delete(mobile);
      }
    }

    // Add + update entities
    for (const mobile of current) {
      // Advance timer
      const prevTimer = timers.get(mobile) ?? 0;
      const timer     = prevTimer + dt;
      timers.set(mobile, timer);

      // Determine kind
      const kind: EntityKind = world.dog === mobile ? "dog" : "sheep";

      // Compute animation state
      const sheep = kind === "sheep" ? (mobile as Sheep) : null;
      const dog   = kind === "dog"   ? (mobile as Dog)   : null;

      const speed   = Math.hypot(mobile.vel.x, mobile.vel.y);
      const moving  = speed > 2;
      const barking = dog ? dog.barkCooldown > 0 : false;
      const penned  = sheep ? sheep.penned : false;
      const grazing = sheep ? (sheep.drives.hunger > 0.5 && !moving) : false;

      const anim = selectFrame({
        kind,
        moving,
        penned,
        barking,
        grazing,
        facing: mobile.facing,
        timer,
        dt,
      });

      // Create sprite if new
      if (!this.sprites.has(mobile)) {
        const pair = this.factory(anim.frame);
        this.sprites.set(mobile, pair);
        this.container.addChild(pair.entity, pair.shadow);
      }

      const rec = this.sprites.get(mobile)!;

      // Copy position and depth
      rec.entity.x      = mobile.pos.x;
      rec.entity.y      = mobile.pos.y;
      rec.entity.zIndex = mobile.pos.y;
      rec.entity.scaleX = anim.flipX ? -1 : 1;
      rec.entity.texture = anim.frame;

      // Shadow: same x, slightly below entity
      rec.shadow.x      = mobile.pos.x;
      rec.shadow.y      = mobile.pos.y + SHADOW_OFFSET_Y;
      rec.shadow.zIndex = mobile.pos.y - 0.5; // just behind entity
    }
  }
}
