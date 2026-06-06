import { describe, it, expect } from "vitest";
import { densityToFrame } from "./GrassRenderer.js";

describe("densityToFrame", () => {
  it("density 1.0 → grass_lush", () => {
    expect(densityToFrame(1.0)).toBe("grass_lush");
  });

  it("density 0.75 → grass_lush (at threshold)", () => {
    expect(densityToFrame(0.75)).toBe("grass_lush");
  });

  it("density 0.74 → grass_med (just below lush threshold)", () => {
    expect(densityToFrame(0.74)).toBe("grass_med");
  });

  it("density 0.40 → grass_med (at threshold)", () => {
    expect(densityToFrame(0.40)).toBe("grass_med");
  });

  it("density 0.39 → grass_grazed (just below med threshold)", () => {
    expect(densityToFrame(0.39)).toBe("grass_grazed");
  });

  it("density 0.10 → grass_grazed (at grazed threshold)", () => {
    expect(densityToFrame(0.10)).toBe("grass_grazed");
  });

  it("density 0.09 → dirt (below grazed threshold)", () => {
    expect(densityToFrame(0.09)).toBe("dirt");
  });

  it("density 0.0 → dirt", () => {
    expect(densityToFrame(0)).toBe("dirt");
  });
});
