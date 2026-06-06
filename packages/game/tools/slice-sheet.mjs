#!/usr/bin/env node
// tools/slice-sheet.mjs
// Slice asset0.png (2880×2880, 6col×9row, checkerboard background) into the
// Pixi spritesheet atlas.
//
// Requires: asset0.png at REPO_ROOT (or ASSET0 env override).
// Produces: packages/game/public/assets/sprites.{png,json}
//
// Key-out algorithm:
//   1. Sample the two checker tones from the four corners.
//   2. Flood-fill from every border pixel that matches within tolerance.
//   3. Set matched pixels to alpha=0.

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

// Source sheet geometry
const SRC_COLS = 6;
const SRC_ROWS = 9;
const SRC_W    = 2880;
const SRC_H    = 2880;
const CELL_W   = SRC_W / SRC_COLS; // 480
const CELL_H   = SRC_H / SRC_ROWS; // 320

// Output frame size (nearest-neighbour downscale to 32×32)
const FRAME = 32;
const TOL   = 30; // colour tolerance for checkerboard key-out

if (!existsSync(ASSET_PATH)) {
  console.error(`slice-sheet: asset0.png not found at ${ASSET_PATH}`);
  console.error("Set ASSET0 env var to the correct path, or run gen-sprites.mjs instead.");
  process.exit(1);
}

// ── Load source sheet ────────────────────────────────────────────────────────
const srcImg = await loadImage(ASSET_PATH);
const srcCanvas = createCanvas(SRC_W, SRC_H);
const srcCtx    = srcCanvas.getContext("2d");
srcCtx.drawImage(srcImg, 0, 0);
const srcData = srcCtx.getImageData(0, 0, SRC_W, SRC_H);
const px = srcData.data; // Uint8ClampedArray, RGBA

// ── Identify checker tones from corners ─────────────────────────────────────
function sampleAt(x, y) {
  const i = (y * SRC_W + x) * 4;
  return [px[i], px[i+1], px[i+2]];
}
const samples = [
  sampleAt(0, 0),
  sampleAt(SRC_W - 1, 0),
  sampleAt(0, SRC_H - 1),
  sampleAt(SRC_W - 1, SRC_H - 1),
];
// Deduplicate into at most 2 checker tones (corners alternate)
const tones = [samples[0]];
for (const s of samples.slice(1)) {
  const distinct = tones.every(t =>
    Math.abs(s[0] - t[0]) > TOL || Math.abs(s[1] - t[1]) > TOL || Math.abs(s[2] - t[2]) > TOL
  );
  if (distinct && tones.length < 2) tones.push(s);
}
console.log(`slice-sheet: detected ${tones.length} checker tone(s):`, tones.map(t => `rgb(${t.join(",")})`));

function isChecker(r, g, b) {
  return tones.some(t =>
    Math.abs(r - t[0]) <= TOL &&
    Math.abs(g - t[1]) <= TOL &&
    Math.abs(b - t[2]) <= TOL,
  );
}

// ── Flood-fill key-out from borders ─────────────────────────────────────────
// Mark pixels transparent if they are checker-coloured and reachable from border.
const visited = new Uint8Array(SRC_W * SRC_H);
const queue   = [];

for (let x = 0; x < SRC_W; x++) {
  queue.push(x, 0);
  queue.push(x, SRC_H - 1);
}
for (let y = 1; y < SRC_H - 1; y++) {
  queue.push(0, y);
  queue.push(SRC_W - 1, y);
}

let qi = 0;
while (qi < queue.length) {
  const x = queue[qi++];
  const y = queue[qi++];
  if (x < 0 || x >= SRC_W || y < 0 || y >= SRC_H) continue;
  const idx = y * SRC_W + x;
  if (visited[idx]) continue;
  visited[idx] = 1;
  const pi = idx * 4;
  if (!isChecker(px[pi], px[pi+1], px[pi+2])) continue;
  px[pi+3] = 0; // set transparent
  queue.push(x+1, y, x-1, y, x, y+1, x, y-1);
}

// ── Cut cells, downscale, pack ───────────────────────────────────────────────
const OUT_COLS = SRC_COLS;
const OUT_ROWS = SRC_ROWS;
const sheetCanvas = createCanvas(OUT_COLS * FRAME, OUT_ROWS * FRAME);
const sheetCtx    = sheetCanvas.getContext("2d");
sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);

const frames = {};

for (let row = 0; row < OUT_ROWS; row++) {
  for (let col = 0; col < OUT_COLS; col++) {
    const name = FRAME_GRID[row][col];
    if (!name) continue;

    // Copy keyed cell to a temp canvas at source resolution
    const cellCanvas = createCanvas(CELL_W, CELL_H);
    const cellCtx    = cellCanvas.getContext("2d");
    cellCtx.putImageData(srcData, -(col * CELL_W), -(row * CELL_H), col * CELL_W, row * CELL_H, CELL_W, CELL_H);

    // Downscale to FRAME×FRAME using nearest-neighbour (imageSmoothingEnabled=false)
    const dx = col * FRAME;
    const dy = row * FRAME;
    sheetCtx.imageSmoothingEnabled = false;
    sheetCtx.drawImage(cellCanvas, 0, 0, CELL_W, CELL_H, dx, dy, FRAME, FRAME);

    frames[name] = {
      frame:           { x: dx, y: dy, w: FRAME, h: FRAME },
      rotated:         false,
      trimmed:         false,
      spriteSourceSize:{ x: 0, y: 0, w: FRAME, h: FRAME },
      sourceSize:      { w: FRAME, h: FRAME },
    };
  }
}

const json = {
  frames,
  meta: {
    image:  "sprites.png",
    format: "RGBA8888",
    size:   { w: OUT_COLS * FRAME, h: OUT_ROWS * FRAME },
    scale:  "1",
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "sprites.json"), JSON.stringify(json, null, 2));

const buf = sheetCanvas.toBuffer("image/png");
writeFileSync(join(OUT_DIR, "sprites.png"), buf);

console.log(`slice-sheet: wrote sprites.png (${OUT_COLS * FRAME}×${OUT_ROWS * FRAME}) and sprites.json (${Object.keys(frames).length} frames)`);
