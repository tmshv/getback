#!/usr/bin/env node
// tools/slice-sheet.mjs
// Slice asset0.png (2880×2880, 6col×9row grid of 480×320 cells, checkerboard
// background) into the Pixi spritesheet atlas shipped with @getback/game.
//
// Requires: asset0.png at REPO_ROOT (or ASSET0 env override).
// Produces: packages/game/public/assets/sprites.{png,json}
//
// The source art does NOT respect the grid strictly: sprites bleed across cell
// boundaries (e.g. the tree's crown crosses into the row above) and tiles are
// not centered. So instead of blind grid-cutting:
//   1. Key out the checkerboard (corner-tone match + flood fill from borders).
//   2. Find CONNECTED COMPONENTS of opaque pixels; assign each component to
//      the grid cell containing its centroid; union the bboxes per cell. That
//      yields the true art rectangle per frame, bleed included.
//   3. Downscale every frame by a UNIFORM 1/16 (aspect-true, no jitter across
//      animation frames) with high-quality area resampling, then a hard alpha
//      threshold so edges stay crisp pixel art.
//   4. Ground tiles (grass_lush/med/grazed, dirt) instead get an interior crop
//      of their art scaled to exactly 16×16 (= motor grass cellSize) with
//      forced full alpha, so the ground never shows holes or seams' corners.
//   5. Shelf-pack the variable-size frames into the atlas.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");      // packages/game/tools → repo root
const ASSET_PATH = process.env["ASSET0"] ?? join(REPO_ROOT, "asset0.png");
const OUT_DIR    = join(__dirname, "../public/assets");

// ── Frame grid (mirror of src/atlas/frames.ts §4.2) ────────────────────────
const FRAME_GRID = [
  ["corgi_down_idle","corgi_down_walk0","corgi_down_walk1","corgi_down_walk2","corgi_down_walk3","corgi_down_bark"],
  ["corgi_up_idle",  "corgi_up_walk0",  "corgi_up_walk1",  "corgi_up_walk2",  "corgi_up_walk3",  "corgi_up_bark"],
  ["corgi_side_idle","corgi_side_walk0","corgi_side_walk1","corgi_side_walk2","corgi_side_walk3","corgi_side_bark"],
  ["sheep_down_idle","sheep_down_walk0","sheep_down_walk1","sheep_down_walk2","sheep_down_walk3","sheep_down_graze"],
  ["sheep_up_idle",  "sheep_up_walk0",  "sheep_up_walk1",  "sheep_up_walk2",  "sheep_up_walk3",  "sheep_up_graze"],
  ["sheep_side_idle","sheep_side_walk0","sheep_side_walk1","sheep_side_walk2","sheep_side_walk3","sheep_side_graze"],
  ["grass_lush","grass_med","grass_grazed","dirt","water","water_edge"],
  ["tree","boulder","rock","fence_post","fence_rail","gate_post"],
  ["bone","bark_ring","dust","shadow","sparkle",""],
];
const GROUND_TILES = new Set(["grass_lush", "grass_med", "grass_grazed", "dirt"]);

// Source sheet geometry
const SRC_COLS = 6;
const SRC_ROWS = 9;
const SRC_W    = 2880;
const SRC_H    = 2880;
const CELL_W   = SRC_W / SRC_COLS; // 480
const CELL_H   = SRC_H / SRC_ROWS; // 320

const SCALE     = 16;  // uniform downscale (art px → game px)
const TILE      = 16;  // ground tile output size = motor grass cellSize
const TOL       = 30;  // colour tolerance for checkerboard key-out
const ALPHA_CUT = 96;  // hard alpha threshold after smooth resample
const PAD       = 1;   // transparent gutter between packed frames

if (!existsSync(ASSET_PATH)) {
  console.error(`slice-sheet: asset0.png not found at ${ASSET_PATH}`);
  console.error("Set ASSET0 env var to the correct path, or run gen-sprites.mjs instead.");
  process.exit(1);
}

// ── Load + key out background ────────────────────────────────────────────────
const srcImg = await loadImage(ASSET_PATH);
const srcCanvas = createCanvas(SRC_W, SRC_H);
const srcCtx    = srcCanvas.getContext("2d");
srcCtx.drawImage(srcImg, 0, 0);
const srcData = srcCtx.getImageData(0, 0, SRC_W, SRC_H);
const px = srcData.data;

function sampleAt(x, y) {
  const i = (y * SRC_W + x) * 4;
  return [px[i], px[i+1], px[i+2]];
}
const corners = [sampleAt(0,0), sampleAt(SRC_W-1,0), sampleAt(0,SRC_H-1), sampleAt(SRC_W-1,SRC_H-1)];
const tones = [corners[0]];
for (const s of corners.slice(1)) {
  const distinct = tones.every(t =>
    Math.abs(s[0]-t[0]) > TOL || Math.abs(s[1]-t[1]) > TOL || Math.abs(s[2]-t[2]) > TOL);
  if (distinct && tones.length < 2) tones.push(s);
}
console.log(`slice-sheet: detected ${tones.length} checker tone(s):`, tones.map(t => `rgb(${t.join(",")})`));

function isChecker(r, g, b) {
  return tones.some(t =>
    Math.abs(r-t[0]) <= TOL && Math.abs(g-t[1]) <= TOL && Math.abs(b-t[2]) <= TOL);
}

{
  const visited = new Uint8Array(SRC_W * SRC_H);
  const queue = [];
  for (let x = 0; x < SRC_W; x++) queue.push(x, 0, x, SRC_H - 1);
  for (let y = 1; y < SRC_H - 1; y++) queue.push(0, y, SRC_W - 1, y);
  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi++], y = queue[qi++];
    if (x < 0 || x >= SRC_W || y < 0 || y >= SRC_H) continue;
    const idx = y * SRC_W + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const pi = idx * 4;
    if (!isChecker(px[pi], px[pi+1], px[pi+2])) continue;
    px[pi+3] = 0;
    queue.push(x+1, y, x-1, y, x, y+1, x, y-1);
  }
  srcCtx.putImageData(srcData, 0, 0);
}

// ── Connected components → per-cell union bbox ───────────────────────────────
// Each opaque component is assigned to the grid cell holding its centroid;
// per-cell bboxes are unioned. Tiny specks (< 24 px) are dropped as noise.
const compId = new Int32Array(SRC_W * SRC_H).fill(-1);
const cellBox = new Map(); // "row,col" -> {minX,minY,maxX,maxY}
{
  const stack = [];
  let nextId = 0;
  for (let sy = 0; sy < SRC_H; sy++) {
    for (let sx = 0; sx < SRC_W; sx++) {
      const sIdx = sy * SRC_W + sx;
      if (compId[sIdx] !== -1 || px[sIdx*4+3] === 0) continue;
      // BFS this component
      let minX = sx, maxX = sx, minY = sy, maxY = sy, area = 0, sumX = 0, sumY = 0;
      compId[sIdx] = nextId;
      stack.push(sx, sy);
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        area++; sumX += x; sumY += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const nbs = [x+1,y, x-1,y, x,y+1, x,y-1];
        for (let k = 0; k < 8; k += 2) {
          const nx = nbs[k], ny = nbs[k+1];
          if (nx < 0 || nx >= SRC_W || ny < 0 || ny >= SRC_H) continue;
          const nIdx = ny * SRC_W + nx;
          if (compId[nIdx] !== -1 || px[nIdx*4+3] === 0) continue;
          compId[nIdx] = nextId;
          stack.push(nx, ny);
        }
      }
      nextId++;
      if (area < 24) continue; // dust/noise
      const col = Math.min(SRC_COLS - 1, Math.floor((sumX / area) / CELL_W));
      const row = Math.min(SRC_ROWS - 1, Math.floor((sumY / area) / CELL_H));
      const key = `${row},${col}`;
      const bb = cellBox.get(key);
      if (!bb) cellBox.set(key, { minX, minY, maxX, maxY });
      else {
        bb.minX = Math.min(bb.minX, minX); bb.maxX = Math.max(bb.maxX, maxX);
        bb.minY = Math.min(bb.minY, minY); bb.maxY = Math.max(bb.maxY, maxY);
      }
    }
  }
}

// ── Build each frame image ───────────────────────────────────────────────────
function thresholdAlpha(ctx, w, h) {
  const id = ctx.getImageData(0, 0, w, h);
  const p = id.data;
  for (let i = 3; i < p.length; i += 4) p[i] = p[i] >= ALPHA_CUT ? 255 : 0;
  ctx.putImageData(id, 0, 0);
}

const built = []; // { name, canvas, w, h, gridRow }
for (let row = 0; row < SRC_ROWS; row++) {
  for (let col = 0; col < SRC_COLS; col++) {
    const name = FRAME_GRID[row][col];
    if (!name) continue;
    const bb = cellBox.get(`${row},${col}`);
    if (!bb) { console.warn(`slice-sheet: no art found for ${name} (cell ${row},${col})`); continue; }
    const bw = bb.maxX - bb.minX + 1;
    const bh = bb.maxY - bb.minY + 1;

    if (GROUND_TILES.has(name)) {
      // Interior crop (inset 12%) → exact TILE×TILE, fully opaque.
      const inset = Math.floor(Math.min(bw, bh) * 0.12);
      const c = createCanvas(TILE, TILE);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(srcCanvas,
        bb.minX + inset, bb.minY + inset, bw - 2*inset, bh - 2*inset,
        0, 0, TILE, TILE);
      const id = ctx.getImageData(0, 0, TILE, TILE);
      for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255;
      ctx.putImageData(id, 0, 0);
      built.push({ name, canvas: c, w: TILE, h: TILE, gridRow: row });
    } else {
      const w = Math.max(1, Math.round(bw / SCALE));
      const h = Math.max(1, Math.round(bh / SCALE));
      const c = createCanvas(w, h);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(srcCanvas, bb.minX, bb.minY, bw, bh, 0, 0, w, h);
      thresholdAlpha(ctx, w, h);
      built.push({ name, canvas: c, w, h, gridRow: row });
    }
  }
}

// ── Shelf-pack (one shelf per source grid row keeps the atlas readable) ──────
const shelves = new Map(); // gridRow -> frames[]
for (const f of built) {
  if (!shelves.has(f.gridRow)) shelves.set(f.gridRow, []);
  shelves.get(f.gridRow).push(f);
}
let atlasW = 0, atlasH = PAD;
for (const fs of shelves.values()) {
  const shelfW = fs.reduce((s, f) => s + f.w + PAD, PAD);
  const shelfH = Math.max(...fs.map(f => f.h));
  atlasW = Math.max(atlasW, shelfW);
  atlasH += shelfH + PAD;
}
const sheetCanvas = createCanvas(atlasW, atlasH);
const sheetCtx = sheetCanvas.getContext("2d");
sheetCtx.clearRect(0, 0, atlasW, atlasH);
sheetCtx.imageSmoothingEnabled = false;

const frames = {};
let y = PAD;
for (const fs of [...shelves.keys()].sort((a, b) => a - b).map(k => shelves.get(k))) {
  let x = PAD;
  const shelfH = Math.max(...fs.map(f => f.h));
  for (const f of fs) {
    // bottom-align within the shelf so feet lines stay visually tidy
    const fy = y + shelfH - f.h;
    sheetCtx.drawImage(f.canvas, x, fy);
    frames[f.name] = {
      frame:            { x, y: fy, w: f.w, h: f.h },
      rotated:          false,
      trimmed:          false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize:       { w: f.w, h: f.h },
    };
    x += f.w + PAD;
  }
  y += shelfH + PAD;
}

// Frames missing from the source art fall back to a stand-in (same rect, two
// names) so every name in the §4.2 contract resolves to a texture.
const ALIASES = { sheep_up_graze: "sheep_up_idle" };
for (const [missing, standIn] of Object.entries(ALIASES)) {
  if (!frames[missing] && frames[standIn]) {
    frames[missing] = frames[standIn];
    console.log(`slice-sheet: aliased ${missing} -> ${standIn}`);
  }
}

const json = {
  frames,
  meta: {
    image:  "sprites.png",
    format: "RGBA8888",
    size:   { w: atlasW, h: atlasH },
    scale:  "1",
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "sprites.json"), JSON.stringify(json, null, 2));
writeFileSync(join(OUT_DIR, "sprites.png"), sheetCanvas.toBuffer("image/png"));

console.log(`slice-sheet: wrote sprites.png (${atlasW}×${atlasH}) and sprites.json (${Object.keys(frames).length} frames)`);
