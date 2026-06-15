// DebugOverlay.ts — schematic gizmo layer drawn from world state each tick.
// Imports pixi.js → [manual verify]; the data/formatting it relies on
// (debugModel.ts, classifySheepMode) is unit-tested separately.
//
// Toggled by Runner through three states (off / overlay / schematic); this class
// only knows how to DRAW. It recycles a Graphics buffer + a Text pool so a redraw
// every frame stays allocation-free.

import { Container, Graphics, Text } from "pixi.js";
import type { Vec2 } from "@getback/math";
import type { World, Sheep, Dog, Mobile, Direction } from "@getback/motor";
import { DEBUG } from "../config.js";
import { sheepLabel, dogLabel, vectorEnd, grassAmountLabel } from "./debugModel.js";

const C  = DEBUG.COLORS;
const LW = DEBUG.LINE_WIDTH;

const FACING_UNIT: Record<Direction, Vec2> = {
  down:  { x: 0, y: 1 },
  up:    { x: 0, y: -1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class DebugOverlay {
  readonly view = new Container();
  private readonly g = new Graphics();
  private readonly labels: Text[] = [];
  private used = 0;
  // Per-cell grass-resource numbers: one persistent Text per grid cell, parked at
  // its cell centre. Cached text strings skip the (re-layout) cost when a cell's
  // rounded amount is unchanged frame to frame.
  private readonly cells = new Container();
  private readonly cellLabels: Text[] = [];
  private readonly cellText: string[] = [];

  constructor() {
    // Grass numbers behind the gizmo graphics so vectors/rings stay readable.
    this.view.addChild(this.cells, this.g);
  }

  draw(world: World): void {
    const g = this.g;
    g.clear();
    this.used = 0;

    this.drawGrass(world.grass);

    // ── Static world gizmos ──────────────────────────────────────────────────
    for (const o of world.obstacles) {
      g.circle(o.pos.x, o.pos.y, o.radius).stroke({ width: LW, color: C.world, alpha: 0.9 });
    }
    for (const a of world.attractors) {
      g.circle(a.pos.x, a.pos.y, a.radius).stroke({ width: LW, color: C.world, alpha: 0.45 });
    }
    if (world.pen) {
      for (const f of world.pen.fences) {
        g.moveTo(f.a.x, f.a.y).lineTo(f.b.x, f.b.y).stroke({ width: LW, color: C.world });
      }
      const m = world.pen.gate.mouth;
      g.moveTo(m.a.x, m.a.y).lineTo(m.b.x, m.b.y).stroke({ width: LW, color: C.neighbor, alpha: 0.8 });
      g.circle(world.pen.centroid.x, world.pen.centroid.y, 1).fill({ color: C.world });
    }

    // ── Agents ───────────────────────────────────────────────────────────────
    for (const s of world.sheep) this.drawSheep(g, s);
    if (world.dog) this.drawDog(g, world.dog);

    // Hide any labels left over from a frame with more agents.
    for (let i = this.used; i < this.labels.length; i++) this.labels[i]!.visible = false;
  }

  // One number per grass cell (0–100 resource amount), centred in the cell.
  private drawGrass(grass: World["grass"]): void {
    const { cols, rows, cellSize, density } = grass;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        let t = this.cellLabels[i];
        if (!t) {
          t = new Text({
            text: "",
            style: { fontFamily: "monospace", fontSize: DEBUG.FONT_SIZE, fill: C.grass, align: "center" },
          });
          t.resolution = 4;
          t.alpha = 0.6;
          t.anchor.set(0.5);
          t.x = cx * cellSize + cellSize / 2;
          t.y = cy * cellSize + cellSize / 2;
          this.cellLabels[i] = t;
          this.cellText[i] = "";
          this.cells.addChild(t);
        }
        const str = grassAmountLabel(density[i]!);
        if (this.cellText[i] !== str) {
          t.text = str;
          this.cellText[i] = str;
        }
      }
    }
  }

  private drawSheep(g: Graphics, s: Sheep): void {
    g.circle(s.pos.x, s.pos.y, s.traits.perception).stroke({ width: LW, color: C.perception, alpha: 0.22 });
    g.circle(s.pos.x, s.pos.y, s.traits.personalSpace).stroke({ width: LW, color: C.personal, alpha: 0.4 });
    for (const n of s.neighbors) {
      g.moveTo(s.pos.x, s.pos.y).lineTo(n.pos.x, n.pos.y).stroke({ width: LW, color: C.neighbor, alpha: 0.3 });
    }
    this.drawMobile(g, s, sheepLabel(s));
  }

  private drawDog(g: Graphics, d: Dog): void {
    this.drawMobile(g, d, dogLabel(d));
  }

  // Shared per-mobile gizmos: collision circle, velocity + force vectors,
  // facing tick, and the text tag.
  private drawMobile(g: Graphics, m: Mobile, lines: string[]): void {
    g.circle(m.pos.x, m.pos.y, m.radius).stroke({ width: LW, color: C.box });
    this.vector(g, m.pos, m.vel, DEBUG.VELOCITY_SCALE, C.velocity);
    if (m.debug) this.vector(g, m.pos, m.debug.force, DEBUG.FORCE_SCALE, C.force);
    const u = FACING_UNIT[m.facing];
    g.moveTo(m.pos.x, m.pos.y)
      .lineTo(m.pos.x + u.x * (m.radius + 2), m.pos.y + u.y * (m.radius + 2))
      .stroke({ width: LW, color: C.facing });
    this.label(lines, m.pos.x + m.radius + 1, m.pos.y - m.radius - 1);
  }

  private vector(g: Graphics, pos: Vec2, vec: Vec2, scale: number, color: number): void {
    if (vec.x === 0 && vec.y === 0) return;
    const e = vectorEnd(pos, vec, scale);
    g.moveTo(pos.x, pos.y).lineTo(e.x, e.y).stroke({ width: LW, color });
  }

  private label(lines: string[], x: number, y: number): void {
    let t = this.labels[this.used];
    if (!t) {
      t = new Text({
        text: "",
        style: { fontFamily: "monospace", fontSize: DEBUG.FONT_SIZE, fill: C.text, lineHeight: DEBUG.FONT_SIZE + 1 },
      });
      t.resolution = 4; // rasterise sharper than logical px (the stage upscales)
      this.labels.push(t);
      this.view.addChild(t);
    }
    t.text = lines.join("\n");
    t.x = x;
    t.y = y;
    t.visible = true;
    this.used++;
  }
}
