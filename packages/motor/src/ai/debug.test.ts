import { describe, it, expect } from "vitest";
import { classifySheepMode } from "./debug.js";

describe("classifySheepMode", () => {
  it("returns idle with no fired labels", () => {
    expect(classifySheepMode([])).toEqual({ mode: "idle", fleeing: false });
  });

  it("maps a single goal label to its mode", () => {
    expect(classifySheepMode(["graze"]).mode).toBe("graze");
    expect(classifySheepMode(["drink"]).mode).toBe("drink");
    expect(classifySheepMode(["rest"]).mode).toBe("rest");
    expect(classifySheepMode(["penned"]).mode).toBe("penned");
  });

  it("prioritises penned > drink > graze > rest", () => {
    expect(classifySheepMode(["rest", "graze", "drink", "penned"]).mode).toBe("penned");
    expect(classifySheepMode(["rest", "graze", "drink"]).mode).toBe("drink");
    expect(classifySheepMode(["rest", "graze"]).mode).toBe("graze");
  });

  it("reads fleeing as an independent flag, regardless of mode", () => {
    expect(classifySheepMode(["graze", "flee"])).toEqual({ mode: "graze", fleeing: true });
    expect(classifySheepMode(["flee"])).toEqual({ mode: "idle", fleeing: true });
    expect(classifySheepMode(["graze"]).fleeing).toBe(false);
  });
});
