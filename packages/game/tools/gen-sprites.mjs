#!/usr/bin/env node
// tools/gen-sprites.mjs
// Procedural atlas generator — no source artwork required.
// Produces packages/game/public/assets/sprites.{png,json}.
//
// Frame grid reproduced from src/atlas/frames.ts (keep in sync).
// Each frame is 32×32 px; sheet is 6 cols × 9 rows = 192×288 px.

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, "../public/assets");

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

const CELL = 32;           // px per frame (square)
const COLS = 6;
const ROWS = FRAME_GRID.length; // 9

// Colour palette per entity/category row
const ROW_COLORS = [
  "#e07060", // row 0  corgi down   — warm orange-red
  "#e07060", // row 1  corgi up
  "#e07060", // row 2  corgi side
  "#f0f0d0", // row 3  sheep down   — off-white
  "#f0f0d0", // row 4  sheep up
  "#f0f0d0", // row 5  sheep side
  "#60c060", // row 6  terrain
  "#806040", // row 7  props
  "#c0c0ff", // row 8  FX / shadow
];

const canvas = createCanvas(COLS * CELL, ROWS * CELL);
const ctx    = canvas.getContext("2d");

// Transparent background
ctx.clearRect(0, 0, canvas.width, canvas.height);

const frames = {};

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const name = FRAME_GRID[row][col];
    if (!name) continue; // empty slot (row 8 col 5)

    const x = col * CELL;
    const y = row * CELL;

    // Background fill
    ctx.fillStyle = ROW_COLORS[row];
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

    // Walk-frame indicator: a small numbered dot
    const walkMatch = name.match(/walk(\d)/);
    if (walkMatch) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(walkMatch[1], x + CELL / 2, y + CELL / 2);
    }

    // Special marker for bark / graze
    if (name.endsWith("_bark") || name.endsWith("_graze")) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + CELL / 2 - 4, y + CELL / 2 - 4, 8, 8);
    }

    frames[name] = {
      frame:           { x, y, w: CELL, h: CELL },
      rotated:         false,
      trimmed:         false,
      spriteSourceSize:{ x: 0, y: 0, w: CELL, h: CELL },
      sourceSize:      { w: CELL, h: CELL },
    };
  }
}

const json = {
  frames,
  meta: {
    image:  "sprites.png",
    format: "RGBA8888",
    size:   { w: COLS * CELL, h: ROWS * CELL },
    scale:  "1",
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "sprites.json"), JSON.stringify(json, null, 2));

const buf = canvas.toBuffer("image/png");
writeFileSync(join(OUT_DIR, "sprites.png"), buf);

console.log(`gen-sprites: wrote sprites.png (${COLS * CELL}×${ROWS * CELL}) and sprites.json (${Object.keys(frames).length} frames)`);
