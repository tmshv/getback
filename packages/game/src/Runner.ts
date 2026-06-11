// Runner.ts — boots Pixi, loads the atlas, drives the render+simulation loop.
// This file imports pixi.js; it must NEVER be imported by @getback/motor.
//
// [manual verify]: run an example app that calls mount() and confirm the
// canvas appears, sprites render, and the simulation updates.

import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
  TextureSource,
} from "pixi.js";

import { Game } from "@getback/motor";
import type { World, Mobile, DogIntent } from "@getback/motor";

import { LOGICAL_W, LOGICAL_H, LAYER, SPRITE_SCALE, SHADOW_SCALE_Y, DEBUG } from "./config.js";
import { computeLetterbox } from "./render/letterbox.js";
import { RenderSystem } from "./render/RenderSystem.js";
import type { SpriteLike, SpriteFactory, ContainerLike } from "./render/RenderSystem.js";
import { GrassRenderer } from "./render/GrassRenderer.js";
import { PropsRenderer } from "./render/PropsRenderer.js";
import { HudView } from "./render/Hud.js";
import type { HudOverride } from "./render/Hud.js";
import { FxSystem } from "./render/Fx.js";
import { DebugOverlay } from "./render/DebugOverlay.js";

export interface MountOptions {
  /** HTMLElement to append the Pixi canvas to. Default: document.body */
  container?: HTMLElement;
  /** Called each tick to feed the dog's intent; omitted → neutral intent */
  input?: () => DogIntent;
  /** Path to sprites.json (default: "./assets/sprites.json") */
  atlasPath?: string;
  /** Optional HUD visibility overrides; auto-detected from world when omitted */
  hud?: HudOverride;
}

// ── Production SpriteLike adapter ────────────────────────────────────────────
// Wraps a Pixi Sprite to satisfy the SpriteLike interface. RenderSystem speaks
// in unit scale (scaleX = ±1 for facing flips); the adapter composes that with
// the sprite's base display scale (native-res art drawn down to world size).
class PixiSpriteLike implements SpriteLike {
  constructor(
    public readonly sprite: Sprite,
    private readonly baseScale: number = 1,
  ) {}

  get x()       { return this.sprite.x; }
  set x(v)      { this.sprite.x = v; }

  get y()       { return this.sprite.y; }
  set y(v)      { this.sprite.y = v; }

  get zIndex()  { return this.sprite.zIndex; }
  set zIndex(v) { this.sprite.zIndex = v; }

  get scaleX()  { return this.sprite.scale.x / this.baseScale; }
  set scaleX(v) { this.sprite.scale.x = v * this.baseScale; }

  get texture() { return this.sprite.texture.label ?? ""; }
  set texture(name: string) {
    const t = Texture.from(name);
    if (this.sprite.texture !== t) this.sprite.texture = t;
  }

  get shadowY() { return this.sprite.y; }
  set shadowY(v) { this.sprite.y = v; }

  destroy() { this.sprite.destroy(); }
}

// ── Production container adapter ─────────────────────────────────────────────
class PixiContainerLike implements ContainerLike {
  constructor(private readonly c: Container) {}

  addChild(...sprites: SpriteLike[]) {
    for (const s of sprites) {
      const raw = (s as PixiSpriteLike & { sprite?: Sprite })["sprite"];
      if (raw) this.c.addChild(raw);
    }
  }

  removeChild(...sprites: SpriteLike[]) {
    for (const s of sprites) {
      const raw = (s as PixiSpriteLike & { sprite?: Sprite })["sprite"];
      if (raw) this.c.removeChild(raw);
    }
  }
}

// ── mount() — public entry point ─────────────────────────────────────────────
/**
 * Boot Pixi, load the atlas, and start the game loop.
 * Returns the Pixi `Application` so callers can inspect or stop it.
 * Called by a runnable app's main.ts:
 *
 *   import { mount } from "@getback/game";
 *   const world = createWorld([...sheep], ...);
 *   const { app } = await mount(world, { input: () => intent, container: el });
 */
export async function mount(world: World, opts: MountOptions = {}): Promise<{ app: Application }> {
  const atlasPath = opts.atlasPath ?? "./assets/sprites.json";

  // ── 1. Texture filtering (before any texture load): the atlas ships the
  // artist's native-resolution pixels; smooth filtering + mipmaps draw them
  // down to world size without adding pixelation.
  TextureSource.defaultOptions.scaleMode = "linear";
  TextureSource.defaultOptions.autoGenerateMipmaps = true;

  // ── 2. Boot Pixi Application ───────────────────────────────────────────────
  const app = new Application();
  await app.init({
    width:       LOGICAL_W,
    height:      LOGICAL_H,
    roundPixels: true,
    backgroundColor: 0x3a7d44,  // pasture green fallback
    autoStart:   false,         // we drive the ticker manually
  });

  // ── 3. Mount canvas ────────────────────────────────────────────────────────
  const mountTarget: HTMLElement = opts.container ?? document.body;
  mountTarget.appendChild(app.canvas);

  // ── 4. Apply integer letterbox on resize ──────────────────────────────────
  function applyLetterbox() {
    const { scale, offsetX, offsetY } = computeLetterbox(
      window.innerWidth, window.innerHeight, LOGICAL_W, LOGICAL_H,
    );
    app.stage.scale.set(scale);
    app.stage.position.set(offsetX, offsetY);
    app.renderer.resize(window.innerWidth, window.innerHeight);
  }
  applyLetterbox();
  window.addEventListener("resize", applyLetterbox);

  // ── 5. Build layer containers ─────────────────────────────────────────────
  const terrainLayer  = new Container();
  const propsLayer    = new Container();
  const entitiesLayer = new Container();
  const fxLayer       = new Container();
  const debugLayer    = new Container();
  const hudLayer      = new Container();

  terrainLayer.zIndex  = LAYER.TERRAIN;
  propsLayer.zIndex    = LAYER.PROPS;
  entitiesLayer.zIndex = LAYER.ENTITIES;
  fxLayer.zIndex       = LAYER.FX;
  debugLayer.zIndex    = LAYER.DEBUG;
  hudLayer.zIndex      = LAYER.HUD;

  debugLayer.visible = false; // off until toggled
  entitiesLayer.sortableChildren = true;

  app.stage.sortableChildren = true;
  app.stage.addChild(terrainLayer, propsLayer, entitiesLayer, fxLayer, debugLayer, hudLayer);

  // ── 6. Load atlas ─────────────────────────────────────────────────────────
  await Assets.load(atlasPath);

  // ── 7. Initialize GrassRenderer + PropsRenderer ───────────────────────────
  const grassRenderer = new GrassRenderer(terrainLayer);
  grassRenderer.init(world.grass);

  // Static world: pen fences, obstacles, water, treats. Solid props live in
  // the sortable entities layer so sheep/dog depth-sort against them.
  const propsRenderer = new PropsRenderer(entitiesLayer, propsLayer);

  // ── 8. Build production SpriteFactory ────────────────────────────────────
  const shadowTexture = Texture.from("shadow");

  const factory: SpriteFactory = (frameName: string) => {
    const entitySprite = new Sprite(Texture.from(frameName));
    entitySprite.anchor.set(0.5, 1); // feet-anchored
    entitySprite.scale.set(SPRITE_SCALE);

    const shadowSprite = new Sprite(shadowTexture);
    shadowSprite.anchor.set(0.5, 0.5);
    shadowSprite.scale.set(SPRITE_SCALE, SPRITE_SCALE * SHADOW_SCALE_Y); // flatten into ellipse
    // The creature frames already carry painted feet shadows; this contact
    // shadow only grounds the sprite, so keep it faint.
    shadowSprite.alpha = 0.25;

    return {
      entity: new PixiSpriteLike(entitySprite, SPRITE_SCALE),
      shadow: new PixiSpriteLike(shadowSprite, SPRITE_SCALE),
    };
  };

  // ── 9. Build RenderSystem ─────────────────────────────────────────────────
  const containerLike = new PixiContainerLike(entitiesLayer);
  const renderSystem  = new RenderSystem(factory, containerLike);
  const animTimers    = new Map<Mobile, number>();

  // ── 10. FX layer — above entities ─────────────────────────────────────────
  const fxSystem = new FxSystem(world.signals);
  fxLayer.addChild(fxSystem.view);

  // ── 11. HUD layer — top ───────────────────────────────────────────────────
  const hudView = new HudView(opts.hud ?? {});
  hudLayer.addChild(hudView.view);

  // ── 11b. Debug overlay — backtick cycles off → overlay → schematic ────────
  const debugOverlay = new DebugOverlay();
  debugLayer.addChild(debugOverlay.view);
  const artLayers = [terrainLayer, propsLayer, entitiesLayer, fxLayer];
  let debugState = 0; // 0 off · 1 gizmos over art · 2 gizmos only (art hidden)
  function applyDebugState() {
    debugLayer.visible = debugState !== 0;
    for (const l of artLayers) l.visible = debugState !== 2;
  }
  window.addEventListener("keydown", (e) => {
    if (e.code !== DEBUG.TOGGLE_KEY) return;
    debugState = (debugState + 1) % 3;
    applyDebugState();
  });

  // ── 12. Build Game and wire Ticker ───────────────────────────────────────
  const game = new Game(world);

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    game.update(dt, opts.input?.());
    grassRenderer.update(world.grass);
    propsRenderer.sync(world);
    renderSystem.sync(world, animTimers, dt);
    fxSystem.update(dt);
    hudView.update(world);
    if (debugState !== 0) debugOverlay.draw(world);
  });

  app.ticker.start();
  return { app };
}
