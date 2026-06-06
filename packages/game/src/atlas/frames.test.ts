import { describe, it, expect } from "vitest";
import { FRAME_GRID, frameName, frameFlipX, FRAME_NAMES } from "./frames.js";

describe("FRAME_GRID", () => {
  it("has 9 rows", () => {
    expect(FRAME_GRID.length).toBe(9);
  });

  it("has 6 columns in every row", () => {
    for (const row of FRAME_GRID) {
      expect(row.length).toBe(6);
    }
  });

  it("row 0 is corgi down frames", () => {
    expect(FRAME_GRID[0]).toEqual([
      "corgi_down_idle",
      "corgi_down_walk0",
      "corgi_down_walk1",
      "corgi_down_walk2",
      "corgi_down_walk3",
      "corgi_down_bark",
    ]);
  });

  it("row 3 is sheep down frames", () => {
    expect(FRAME_GRID[3]).toEqual([
      "sheep_down_idle",
      "sheep_down_walk0",
      "sheep_down_walk1",
      "sheep_down_walk2",
      "sheep_down_walk3",
      "sheep_down_graze",
    ]);
  });

  it("row 6 is terrain frames", () => {
    expect(FRAME_GRID[6]).toEqual([
      "grass_lush",
      "grass_med",
      "grass_grazed",
      "dirt",
      "water",
      "water_edge",
    ]);
  });

  it("row 7 is prop frames", () => {
    expect(FRAME_GRID[7]).toEqual([
      "tree",
      "boulder",
      "rock",
      "fence_post",
      "fence_rail",
      "gate_post",
    ]);
  });

  it("row 8 is fx/shadow frames (last slot empty string)", () => {
    expect(FRAME_GRID[8]).toEqual([
      "bone",
      "bark_ring",
      "dust",
      "shadow",
      "sparkle",
      "",
    ]);
  });
});

describe("FRAME_NAMES", () => {
  it("is a flat array of all non-empty frame names", () => {
    // 9 rows × 6 cols = 54 total slots; 1 empty → 53 names
    expect(FRAME_NAMES.length).toBe(53);
  });

  it("contains expected names", () => {
    expect(FRAME_NAMES).toContain("corgi_down_idle");
    expect(FRAME_NAMES).toContain("sheep_side_graze");
    expect(FRAME_NAMES).toContain("shadow");
    expect(FRAME_NAMES).toContain("sparkle");
  });
});

describe("frameName", () => {
  it("returns corgi_down_idle for dog / idle / down", () => {
    expect(frameName("dog", "idle", "down")).toBe("corgi_down_idle");
  });

  it("returns corgi_up_walk2 for dog / walk2 / up", () => {
    expect(frameName("dog", "walk2", "up")).toBe("corgi_up_walk2");
  });

  it("returns corgi_down_bark for dog / bark / down", () => {
    expect(frameName("dog", "bark", "down")).toBe("corgi_down_bark");
  });

  it("maps right-facing dog to side row (mirrored at render time)", () => {
    expect(frameName("dog", "idle", "right")).toBe("corgi_side_idle");
  });

  it("maps left-facing dog to side row (mirrored at render time)", () => {
    expect(frameName("dog", "idle", "left")).toBe("corgi_side_idle");
  });

  it("returns sheep_side_walk1 for sheep / walk1 / right", () => {
    expect(frameName("sheep", "walk1", "right")).toBe("sheep_side_walk1");
  });

  it("returns sheep_down_graze for sheep / graze / down", () => {
    expect(frameName("sheep", "graze", "down")).toBe("sheep_down_graze");
  });

  it("returns sheep_up_idle for sheep / idle / up", () => {
    expect(frameName("sheep", "idle", "up")).toBe("sheep_up_idle");
  });
});

describe("frameFlipX", () => {
  it("returns false for right-facing (natural side orientation)", () => {
    expect(frameFlipX("right")).toBe(false);
  });

  it("returns true for left-facing (mirror the side sprite)", () => {
    expect(frameFlipX("left")).toBe(true);
  });

  it("returns false for up or down (no horizontal flip needed)", () => {
    expect(frameFlipX("up")).toBe(false);
    expect(frameFlipX("down")).toBe(false);
  });
});
