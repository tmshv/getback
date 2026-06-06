import type { GrassField } from "@getback/motor";
import { GRASS_THRESHOLD } from "../config.js";

// ── Pure density→frame mapping (TDD) ─────────────────────────────────────────

/**
 * Maps a grass density value in [0..1] to an atlas frame name.
 * Thresholds are defined in config.ts.
 */
export function densityToFrame(density: number): string {
  if (density >= GRASS_THRESHOLD.LUSH)   return "grass_lush";
  if (density >= GRASS_THRESHOLD.MED)    return "grass_med";
  if (density >= GRASS_THRESHOLD.GRAZED) return "grass_grazed";
  return "dirt";
}

// ── GrassRenderer (Pixi — manual verify) ─────────────────────────────────────
// Renders the grass field as a grid of sprites, one per cell.
// Each frame, densityToFrame() picks the tile; Sprite.texture is swapped.
//
// NOTE: This class imports Pixi types. It is NOT covered by unit tests.
// Correctness is verified visually when Runner.ts mounts a world.

import { Sprite, Container, Texture } from "pixi.js";

export class GrassRenderer {
  private readonly tiles: Sprite[][] = [];
  private readonly container: Container;
  private initialized = false;

  constructor(container: Container) {
    this.container = container;
  }

  /** Call once after the spritesheet is loaded. */
  init(field: GrassField): void {
    if (this.initialized) return;
    this.initialized = true;

    for (let row = 0; row < field.rows; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < field.cols; col++) {
        const density = field.density[row * field.cols + col] ?? 1;
        const frame   = densityToFrame(density);
        const sprite  = new Sprite(Texture.from(frame));
        sprite.x      = col * field.cellSize;
        sprite.y      = row * field.cellSize;
        sprite.width  = field.cellSize;
        sprite.height = field.cellSize;
        this.container.addChild(sprite);
        this.tiles[row]![col] = sprite;
      }
    }
  }

  /** Call each frame to update tile textures to match current grass density. */
  update(field: GrassField): void {
    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        const density = field.density[row * field.cols + col] ?? 1;
        const frame   = densityToFrame(density);
        const sprite  = this.tiles[row]?.[col];
        if (sprite) {
          sprite.texture = Texture.from(frame);
        }
      }
    }
  }
}
