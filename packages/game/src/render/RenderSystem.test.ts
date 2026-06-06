import { describe, it, expect, beforeEach } from "vitest";
import { RenderSystem } from "./RenderSystem.js";
import type { SpriteLike, SpriteFactory } from "./RenderSystem.js";
import type { Mobile } from "@getback/motor";
import type { World } from "@getback/motor";
import { createWorld, createSheep, defaultSheepTraits, createDog } from "@getback/motor";

// ── Fake sprite factory (no Pixi) ────────────────────────────────────────────
function makeFakeSprite(): SpriteLike {
  return { x: 0, y: 0, zIndex: 0, scaleX: 1, texture: "", shadowY: 0, destroyed: false,
    destroy() { (this as any).destroyed = true; } } as SpriteLike;
}

const fakePairs: Array<{ entity: SpriteLike; shadow: SpriteLike }> = [];

const fakeFactory: SpriteFactory = (_name: string) => {
  const pair = { entity: makeFakeSprite(), shadow: makeFakeSprite() };
  fakePairs.push(pair);
  return pair;
};

// ── ContainerLike stub ───────────────────────────────────────────────────────
interface ContainerLike {
  addChild(...s: SpriteLike[]): void;
  removeChild(...s: SpriteLike[]): void;
}

function makeContainer(): ContainerLike & { children: SpriteLike[] } {
  const children: SpriteLike[] = [];
  return {
    children,
    addChild(...s: SpriteLike[]) { children.push(...s); },
    removeChild(...s: SpriteLike[]) {
      for (const sp of s) {
        const i = children.indexOf(sp);
        if (i >= 0) children.splice(i, 1);
      }
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sheep(x: number, y: number) {
  const s = createSheep({ x, y }, defaultSheepTraits());
  return s;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("RenderSystem — diff", () => {
  let container: ReturnType<typeof makeContainer>;
  let rs: RenderSystem;
  let timers: Map<Mobile, number>;

  beforeEach(() => {
    fakePairs.length = 0;
    container = makeContainer();
    rs = new RenderSystem(fakeFactory, container);
    timers = new Map();
  });

  it("creates a sprite pair for a new sheep on first sync", () => {
    const s = sheep(100, 200);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs.length).toBe(1);
    expect(container.children).toContain(fakePairs[0]!.entity);
    expect(container.children).toContain(fakePairs[0]!.shadow);
  });

  it("does not create a duplicate sprite for the same entity on subsequent syncs", () => {
    const s = sheep(100, 200);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs.length).toBe(1);
  });

  it("destroys sprite pair when entity is removed from the world", () => {
    const s = sheep(100, 200);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    const pair = fakePairs[0]!;

    world.sheep.length = 0; // entity removed
    rs.sync(world, timers, 1 / 60);

    expect((pair.entity as any).destroyed).toBe(true);
    expect((pair.shadow as any).destroyed).toBe(true);
    expect(container.children).not.toContain(pair.entity);
  });

  it("copies entity pos to sprite x/y", () => {
    const s = sheep(123, 456);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.x).toBe(123);
    expect(fakePairs[0]!.entity.y).toBe(456);
  });

  it("sets zIndex from entity y (depth sort)", () => {
    const s = sheep(0, 99);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.zIndex).toBe(99);
  });

  it("sets scaleX=-1 for left-facing entity (flipX)", () => {
    const s = sheep(50, 50);
    s.facing = "left";
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.scaleX).toBe(-1);
  });

  it("sets scaleX=+1 for right-facing entity (no flip)", () => {
    const s = sheep(50, 50);
    s.facing = "right";
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs[0]!.entity.scaleX).toBe(1);
  });

  it("creates sprite for dog when world.dog is set", () => {
    const dog = createDog({ x: 240, y: 135 });
    const world = createWorld([], undefined, [], null, dog) as World;
    rs.sync(world, timers, 1 / 60);
    expect(fakePairs.length).toBe(1);
    expect(fakePairs[0]!.entity.x).toBe(240);
  });

  it("advances anim timer per entity by dt", () => {
    const s = sheep(50, 50);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 0.1);
    expect(timers.get(s)).toBeCloseTo(0.1);
    rs.sync(world, timers, 0.05);
    expect(timers.get(s)).toBeCloseTo(0.15);
  });

  it("removes timer when entity departs", () => {
    const s = sheep(50, 50);
    const world = createWorld([s]) as World;
    rs.sync(world, timers, 0.1);
    expect(timers.has(s)).toBe(true);
    world.sheep.length = 0;
    rs.sync(world, timers, 0);
    expect(timers.has(s)).toBe(false);
  });
});
