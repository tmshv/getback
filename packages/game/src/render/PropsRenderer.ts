// PropsRenderer — draws the static world the simulation collides with but the
// entity RenderSystem doesn't cover: the pen (fence posts + gate posts), the
// point obstacles (trees, boulders, rocks), water holes, and dropped treats.
// Imports pixi.js; the placement math lives in props.ts (headless-tested).

import { Container, Sprite, Texture } from "pixi.js";
import type { World, Pen, Treat } from "@getback/motor";
import { fencePostPositions, obstacleFrame } from "./props.js";
import { SPRITE_SCALE } from "../config.js";

const FENCE_POST_SPACING = 10; // px between posts along a fence segment

export class PropsRenderer {
  /** Depth-sorted layer shared with entities (posts/trees/rocks/treats). */
  private readonly solid: Container;
  /** Flat ground layer under entities (water ponds). */
  private readonly ground: Container;

  private fenceSprites: Sprite[] = [];
  private lastPen: Pen | null = null;
  private staticBuilt = false;
  private readonly treatSprites = new Map<Treat, Sprite>();

  constructor(solidLayer: Container, groundLayer: Container) {
    this.solid = solidLayer;
    this.ground = groundLayer;
  }

  /** Call once per frame. Static parts rebuild only when they change. */
  sync(world: World): void {
    if (!this.staticBuilt) {
      this.buildStatics(world);
      this.staticBuilt = true;
    }
    if (world.pen !== this.lastPen) {
      this.rebuildPen(world.pen);
      this.lastPen = world.pen;
    }
    this.syncTreats(world.treats);
  }

  // ── Obstacles + water: fixed for the lifetime of a world ──────────────────
  private buildStatics(world: World): void {
    for (const o of world.obstacles) {
      const sprite = new Sprite(Texture.from(obstacleFrame(o)));
      sprite.anchor.set(0.5, 1);
      // Size the art to its collision circle (keep aspect): width ≈ diameter,
      // with a little overhang so the art reads larger than the hitbox.
      const w = Math.max(o.radius * 2.4, 8);
      sprite.scale.set(w / sprite.texture.width);
      sprite.x = o.pos.x;
      sprite.y = o.pos.y + o.radius; // feet at the bottom of the circle
      sprite.zIndex = sprite.y;
      this.solid.addChild(sprite);
    }
    for (const a of world.attractors) {
      if (a.kind !== "water") continue; // shade is invisible (it's under a tree)
      const sprite = new Sprite(Texture.from("water"));
      sprite.anchor.set(0.5, 0.5);
      const w = a.radius * 2.2;
      sprite.scale.set(w / sprite.texture.width);
      sprite.x = a.pos.x;
      sprite.y = a.pos.y;
      this.ground.addChild(sprite);
    }
  }

  // ── Pen: rebuilt on every respawn (the pen object is replaced) ────────────
  private rebuildPen(pen: Pen | null): void {
    for (const s of this.fenceSprites) {
      this.solid.removeChild(s);
      s.destroy();
    }
    this.fenceSprites = [];
    if (!pen) return;

    for (const pos of fencePostPositions(pen.fences, FENCE_POST_SPACING)) {
      const sprite = new Sprite(Texture.from("fence_post"));
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(SPRITE_SCALE);
      sprite.x = pos.x;
      sprite.y = pos.y + 2; // post base slightly below the line for depth feel
      sprite.zIndex = sprite.y;
      this.solid.addChild(sprite);
      this.fenceSprites.push(sprite);
    }
    // Gate: a marker post at each side of the opening.
    for (const p of [pen.gate.mouth.a, pen.gate.mouth.b]) {
      const sprite = new Sprite(Texture.from("gate_post"));
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(SPRITE_SCALE);
      sprite.x = p.x;
      sprite.y = p.y + 2;
      sprite.zIndex = sprite.y;
      this.solid.addChild(sprite);
      this.fenceSprites.push(sprite);
    }
  }

  // ── Treats: small dynamic set, diffed per frame ────────────────────────────
  private syncTreats(treats: readonly Treat[]): void {
    const current = new Set(treats);
    for (const [treat, sprite] of this.treatSprites) {
      if (!current.has(treat)) {
        this.solid.removeChild(sprite);
        sprite.destroy();
        this.treatSprites.delete(treat);
      }
    }
    for (const treat of treats) {
      if (this.treatSprites.has(treat)) continue;
      const sprite = new Sprite(Texture.from("bone"));
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(SPRITE_SCALE);
      sprite.x = treat.pos.x;
      sprite.y = treat.pos.y + treat.radius;
      sprite.zIndex = sprite.y;
      this.solid.addChild(sprite);
      this.treatSprites.set(treat, sprite);
    }
  }
}
