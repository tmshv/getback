import { Container, Graphics } from "pixi.js";
import type { Texture } from "pixi.js";
import type { ActiveBuff, World } from "@getback/motor";
import { config } from "@getback/motor";

// ── Colours (0xRRGGBB) ───────────────────────────────────────────────────────
const COLOR_GREEN = 0x55cc44;
const COLOR_AMBER = 0xddaa22;
const COLOR_RED   = 0xdd3322;
const THRESH_HIGH = 0.6;
const THRESH_LOW  = 0.2;

/**
 * Bar fill colour for a stamina ratio in [0, 1].
 * green → amber → red as stamina falls.
 */
export function staminaColor(ratio: number): number {
  if (ratio >= THRESH_HIGH) return COLOR_GREEN;
  if (ratio >= THRESH_LOW)  return COLOR_AMBER;
  return COLOR_RED;
}

/**
 * Returns true when the bar should render at reduced opacity —
 * i.e. the dog cannot bark (stamina < barkCost) or cannot sprint (stamina = 0).
 */
export function staminaDimmed(stamina: number, barkCost: number, max: number): boolean {
  void max; // kept for callers that pass it for clarity
  return stamina < barkCost;
}

export type PipState = "filled" | "empty";

/**
 * Array of pip states representing the flock counter.
 * Index 0 is the first pip (leftmost); penned pips come first.
 */
export function pipStates(penned: number, total: number): PipState[] {
  const states: PipState[] = [];
  for (let i = 0; i < total; i++) {
    states.push(i < penned ? "filled" : "empty");
  }
  return states;
}

export interface BuffDisplayData {
  kind:     "zoomies" | "megabark" | "calm";
  progress: number; // timeLeft / totalDuration, clamped [0, 1]
}

/**
 * Derive what the buff indicator should display.
 * Returns null when no buff is active.
 * `totalDuration` defaults to 1 (caller should pass config.buffs[kind].duration).
 */
export function buffDisplay(
  activeBuff: ActiveBuff | null,
  totalDuration = 1,
): BuffDisplayData | null {
  if (!activeBuff) return null;
  const raw = activeBuff.timeLeft / totalDuration;
  const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return { kind: activeBuff.kind, progress };
}

export interface HudOverride {
  stamina?:      boolean;
  flockCounter?: boolean;
}

export interface HudVisibility {
  stamina:      boolean;
  flockCounter: boolean;
}

/** Compute which HUD elements to render, based on world state + optional overrides. */
export function hudVisibility(
  world: { pen: unknown | null },
  override: HudOverride,
): HudVisibility {
  const autoFlockCounter = world.pen !== null;
  return {
    stamina:      override.stamina      ?? true,
    flockCounter: override.flockCounter ?? autoFlockCounter,
  };
}

// ── HudView Pixi class ─────────────────────────────────────────────────────────

// Logical-space positions (480×270 coordinate space).
const STAMINA_X    = 6;
const STAMINA_Y    = 252;  // bottom-left; 270 - 6 - 12 (bar height)
const STAMINA_W    = 60;
const STAMINA_H    = 6;
const FLOCK_X      = 160;
const FLOCK_Y      = 4;    // top-center
const PIP_SIZE     = 5;
const PIP_GAP      = 2;
const BUFF_X       = 70;
const BUFF_Y       = 248;

/** Live Pixi display for the status HUD. Attach `.view` to the HUD layer container. */
export class HudView {
  readonly view: Container;
  private readonly staminaBg:   Graphics;
  private readonly staminaBar:  Graphics;
  private readonly flockPips:   Container;
  private readonly buffIcon:    Container;
  private readonly buffRadial:  Graphics;
  private readonly override: HudOverride;

  // Textures injected by Runner after atlas is loaded.
  buffTextures: Record<string, Texture> = {};

  constructor(override: HudOverride = {}) {
    this.override = override;
    this.view = new Container();

    // Stamina: dark background + colored fill bar.
    this.staminaBg = new Graphics()
      .rect(STAMINA_X - 1, STAMINA_Y - 1, STAMINA_W + 2, STAMINA_H + 2)
      .fill({ color: 0x000000, alpha: 0.45 });
    this.staminaBar = new Graphics();

    // Flock counter: dynamic pip row managed in update().
    this.flockPips = new Container();

    // Buff icon + radial timer.
    this.buffIcon   = new Container();
    this.buffRadial = new Graphics();
    this.buffIcon.addChild(this.buffRadial);

    this.view.addChild(this.staminaBg, this.staminaBar, this.flockPips, this.buffIcon);
  }

  update(world: World): void {
    const dog      = world.dog;
    const pen      = world.pen;
    const vis      = hudVisibility(world, this.override);
    const stMax    = config.stamina.max;
    const barkCost = config.stamina.barkCost;

    // ── Stamina bar ───────────────────────────────────────────────────────
    this.staminaBg.visible  = vis.stamina;
    this.staminaBar.visible = vis.stamina;
    if (vis.stamina && dog) {
      const ratio   = dog.stamina / stMax;
      const color   = staminaColor(ratio);
      const dimmed  = staminaDimmed(dog.stamina, barkCost, stMax);
      const alpha   = dimmed ? 0.45 : 1.0;
      const barW    = Math.max(0, ratio * STAMINA_W);
      this.staminaBar.clear()
        .rect(STAMINA_X, STAMINA_Y, barW, STAMINA_H)
        .fill({ color, alpha });
    }

    // ── Flock counter pips ────────────────────────────────────────────────
    this.flockPips.visible = vis.flockCounter;
    if (vis.flockCounter && pen) {
      const total  = world.sheep.length;
      const penned = pen.contained.size;
      const states = pipStates(penned, total);
      // Rebuild pips if count changed (cheap for small flocks ≤ 20).
      while (this.flockPips.children.length > states.length) {
        this.flockPips.removeChildAt(this.flockPips.children.length - 1);
      }
      for (let i = 0; i < states.length; i++) {
        let pip = this.flockPips.children[i] as Graphics | undefined;
        if (!pip) {
          pip = new Graphics();
          this.flockPips.addChild(pip);
        }
        const state = states[i]!;
        const px = FLOCK_X + i * (PIP_SIZE + PIP_GAP);
        pip.clear()
          .rect(px, FLOCK_Y, PIP_SIZE, PIP_SIZE)
          .fill({ color: state === "filled" ? 0xffffff : 0x555555, alpha: state === "filled" ? 1 : 0.5 });
      }
    }

    // ── Active buff icon + radial ─────────────────────────────────────────
    if (dog?.activeBuff) {
      const { kind } = dog.activeBuff;
      const duration: Record<string, number> = {
        zoomies:  config.buffs.zoomies.duration,
        megabark: config.buffs.megabark.duration,
        calm:     config.buffs.calm.duration,
      };
      const data = buffDisplay(dog.activeBuff, duration[kind] ?? 1);
      this.buffIcon.visible = true;
      this.buffRadial.clear();
      if (data) {
        const angle = -Math.PI / 2;
        const sweep = data.progress * Math.PI * 2;
        this.buffRadial
          .arc(BUFF_X + 4, BUFF_Y + 4, 6, angle, angle + sweep)
          .stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
      }
    } else {
      this.buffIcon.visible = false;
    }
  }
}
