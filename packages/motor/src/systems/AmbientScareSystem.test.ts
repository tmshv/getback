import { describe, it, expect } from "vitest";
import { createAmbientScareState, ambientScareSystem } from "./AmbientScareSystem.js";
import { makeRng } from "@getback/math";
import { createSignals } from "../world/signals.js";
import type { StressSource } from "../scare/StressSource.js";
import { config } from "../config.js";

describe("ambientScareSystem", () => {
  it("does not fire before the interval elapses", () => {
    const state = createAmbientScareState(makeRng(1));
    const stress: StressSource[] = [];
    const signals = createSignals();
    let fired = 0;
    signals.ambientScare.add(() => fired++);
    // tick with dt = 1s (intervalMin = 18s)
    ambientScareSystem(state, stress, 1, signals);
    expect(fired).toBe(0);
    expect(stress.length).toBe(0);
  });

  it("fires and emits ambientScare after the interval", () => {
    const state = createAmbientScareState(makeRng(1));
    const stress: StressSource[] = [];
    const signals = createSignals();
    let fired = 0;
    signals.ambientScare.add(() => fired++);
    // force timer to expire
    state.timer = 0;
    ambientScareSystem(state, stress, 1 / 60, signals);
    expect(fired).toBe(1);
    expect(stress.some((s) => s.kind === "ambient")).toBe(true);
  });

  it("the ambient StressSource covers the whole pasture", () => {
    const state = createAmbientScareState(makeRng(1));
    const stress: StressSource[] = [];
    state.timer = 0;
    ambientScareSystem(state, stress, 1 / 60, createSignals());
    const src = stress.find((s) => s.kind === "ambient")!;
    expect(src.radius).toBeGreaterThan(400); // covers 480×270
    expect(src.intensity).toBe(config.ambient.intensity);
  });

  it("reschedules after firing", () => {
    const state = createAmbientScareState(makeRng(2));
    const stress: StressSource[] = [];
    state.timer = 0;
    ambientScareSystem(state, stress, 1 / 60, createSignals());
    expect(state.timer).toBeGreaterThanOrEqual(config.ambient.intervalMin - 1 / 60);
  });
});
