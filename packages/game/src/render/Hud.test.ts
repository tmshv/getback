import { describe, it, expect } from "vitest";
import {
  staminaColor,
  staminaDimmed,
  pipStates,
  buffDisplay,
  hudVisibility,
} from "./Hud.js";
import type { ActiveBuff } from "@getback/motor";

// ── staminaColor ──────────────────────────────────────────────────────────────

describe("staminaColor", () => {
  it("returns green at full stamina", () => {
    expect(staminaColor(1.0)).toBe(0x55cc44);
  });

  it("returns amber in the mid range (~0.5)", () => {
    expect(staminaColor(0.5)).toBe(0xddaa22);
  });

  it("returns red at empty", () => {
    expect(staminaColor(0)).toBe(0xdd3322);
  });

  it("returns red below the low threshold (0.2)", () => {
    expect(staminaColor(0.19)).toBe(0xdd3322);
  });

  it("returns amber between low (0.2) and high (0.6) thresholds", () => {
    expect(staminaColor(0.4)).toBe(0xddaa22);
  });

  it("returns green above the high threshold (0.6)", () => {
    expect(staminaColor(0.8)).toBe(0x55cc44);
  });
});

// ── staminaDimmed ─────────────────────────────────────────────────────────────

describe("staminaDimmed", () => {
  // barkCost=12, max=100 → barkRatio = 0.12
  const barkCost = 12;
  const max = 100;

  it("not dimmed when stamina well above barkCost", () => {
    expect(staminaDimmed(80, barkCost, max)).toBe(false);
  });

  it("dimmed when stamina is zero", () => {
    expect(staminaDimmed(0, barkCost, max)).toBe(true);
  });

  it("dimmed when stamina is below barkCost", () => {
    expect(staminaDimmed(10, barkCost, max)).toBe(true);
  });

  it("not dimmed at exactly barkCost", () => {
    expect(staminaDimmed(12, barkCost, max)).toBe(false);
  });
});

// ── pipStates ─────────────────────────────────────────────────────────────────

describe("pipStates", () => {
  it("all empty when 0 penned out of 4", () => {
    expect(pipStates(0, 4)).toEqual(["empty", "empty", "empty", "empty"]);
  });

  it("all filled when all penned", () => {
    expect(pipStates(3, 3)).toEqual(["filled", "filled", "filled"]);
  });

  it("mixed: 2 filled, 2 empty for 2/4", () => {
    expect(pipStates(2, 4)).toEqual(["filled", "filled", "empty", "empty"]);
  });

  it("empty array when total is 0", () => {
    expect(pipStates(0, 0)).toEqual([]);
  });
});

// ── buffDisplay ───────────────────────────────────────────────────────────────

describe("buffDisplay", () => {
  it("returns null when no active buff", () => {
    expect(buffDisplay(null)).toBeNull();
  });

  it("returns kind and 0..1 progress when buff is active", () => {
    const buff: ActiveBuff = { kind: "zoomies", timeLeft: 2 };
    // duration of zoomies = 4s (from config.buffs.zoomies.duration)
    const result = buffDisplay(buff, 4);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("zoomies");
    expect(result!.progress).toBeCloseTo(0.5, 5); // 2/4 = 0.5
  });

  it("progress clamps to [0, 1]", () => {
    const buff: ActiveBuff = { kind: "calm", timeLeft: 99 };
    const result = buffDisplay(buff, 6);
    expect(result!.progress).toBeLessThanOrEqual(1);
    expect(result!.progress).toBeGreaterThanOrEqual(0);
  });
});

// ── hudVisibility ─────────────────────────────────────────────────────────────

describe("hudVisibility", () => {
  const worldWithPen = { pen: { centroid: { x: 0, y: 0 } } };
  const worldNoPen = { pen: null };

  it("shows flock counter when world has a pen and no override", () => {
    const vis = hudVisibility(worldWithPen, {});
    expect(vis.flockCounter).toBe(true);
  });

  it("hides flock counter when world has no pen", () => {
    const vis = hudVisibility(worldNoPen, {});
    expect(vis.flockCounter).toBe(false);
  });

  it("override can force-hide flock counter even when pen exists", () => {
    const vis = hudVisibility(worldWithPen, { flockCounter: false });
    expect(vis.flockCounter).toBe(false);
  });

  it("stamina meter always visible by default", () => {
    const vis = hudVisibility(worldNoPen, {});
    expect(vis.stamina).toBe(true);
  });

  it("override can force-hide stamina meter", () => {
    const vis = hudVisibility(worldNoPen, { stamina: false });
    expect(vis.stamina).toBe(false);
  });
});
