import { describe, it, expect } from "vitest";
import { intentFromKeys, createEdgeTrigger } from "./keyboard.js";

const DIAG = Math.SQRT1_2; // 1/√2 ≈ 0.7071

describe("intentFromKeys — moveDir", () => {
  it("no keys → zero vector", () => {
    const intent = intentFromKeys(new Set());
    expect(intent.moveDir.x).toBe(0);
    expect(intent.moveDir.y).toBe(0);
  });

  it("ArrowRight → unit right", () => {
    const intent = intentFromKeys(new Set(["ArrowRight"]));
    expect(intent.moveDir.x).toBeCloseTo(1, 5);
    expect(intent.moveDir.y).toBe(0);
  });

  it("KeyA → unit left", () => {
    const intent = intentFromKeys(new Set(["KeyA"]));
    expect(intent.moveDir.x).toBeCloseTo(-1, 5);
    expect(intent.moveDir.y).toBe(0);
  });

  it("ArrowUp → unit up (negative y)", () => {
    const intent = intentFromKeys(new Set(["ArrowUp"]));
    expect(intent.moveDir.x).toBe(0);
    expect(intent.moveDir.y).toBeCloseTo(-1, 5);
  });

  it("KeyS → unit down (positive y)", () => {
    const intent = intentFromKeys(new Set(["KeyS"]));
    expect(intent.moveDir.x).toBe(0);
    expect(intent.moveDir.y).toBeCloseTo(1, 5);
  });

  it("diagonal KeyW+KeyD → normalized to length 1", () => {
    const intent = intentFromKeys(new Set(["KeyW", "KeyD"]));
    const len = Math.hypot(intent.moveDir.x, intent.moveDir.y);
    expect(len).toBeCloseTo(1, 5);
    expect(intent.moveDir.x).toBeCloseTo(DIAG, 5);
    expect(intent.moveDir.y).toBeCloseTo(-DIAG, 5);
  });

  it("opposing horizontal keys cancel (KeyA + KeyD → x = 0)", () => {
    const intent = intentFromKeys(new Set(["KeyA", "KeyD"]));
    expect(intent.moveDir.x).toBe(0);
  });

  it("opposing vertical keys cancel (ArrowUp + ArrowDown → y = 0)", () => {
    const intent = intentFromKeys(new Set(["ArrowUp", "ArrowDown"]));
    expect(intent.moveDir.y).toBe(0);
  });

  it("WASD and arrow equivalents produce the same result", () => {
    const wasd = intentFromKeys(new Set(["KeyW", "KeyD"]));
    const arrows = intentFromKeys(new Set(["ArrowUp", "ArrowRight"]));
    expect(wasd.moveDir.x).toBeCloseTo(arrows.moveDir.x, 5);
    expect(wasd.moveDir.y).toBeCloseTo(arrows.moveDir.y, 5);
  });
});

describe("intentFromKeys — sprint + bark flags", () => {
  it("ShiftLeft → sprint true", () => {
    expect(intentFromKeys(new Set(["ShiftLeft"])).sprint).toBe(true);
  });

  it("ShiftRight → sprint true", () => {
    expect(intentFromKeys(new Set(["ShiftRight"])).sprint).toBe(true);
  });

  it("no Shift → sprint false", () => {
    expect(intentFromKeys(new Set(["KeyW"])).sprint).toBe(false);
  });

  it("Space → bark true (raw, no edge trigger)", () => {
    expect(intentFromKeys(new Set(["Space"])).bark).toBe(true);
  });

  it("no Space → bark false", () => {
    expect(intentFromKeys(new Set()).bark).toBe(false);
  });
});

describe("createEdgeTrigger", () => {
  it("fires on the first call when Space is pressed", () => {
    const trigger = createEdgeTrigger();
    expect(trigger(new Set(["Space"]))).toBe(true);
  });

  it("does NOT fire on the second consecutive call (key held)", () => {
    const trigger = createEdgeTrigger();
    trigger(new Set(["Space"])); // first — fires
    expect(trigger(new Set(["Space"]))).toBe(false); // held — no repeat
  });

  it("fires again after Space is released and re-pressed", () => {
    const trigger = createEdgeTrigger();
    trigger(new Set(["Space"])); // press
    trigger(new Set([]));        // release
    expect(trigger(new Set(["Space"]))).toBe(true); // re-press
  });

  it("does not fire when Space is absent", () => {
    const trigger = createEdgeTrigger();
    expect(trigger(new Set(["KeyW"]))).toBe(false);
  });
});
