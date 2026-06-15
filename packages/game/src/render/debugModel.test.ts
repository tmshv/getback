import { describe, it, expect } from "vitest";
import { sheepLabel, dogLabel, vectorEnd, grassAmountLabel } from "./debugModel.js";
import { createSheep, defaultSheepTraits, createDog, grantBuff } from "@getback/motor";

describe("vectorEnd", () => {
  it("returns pos + vec * scale", () => {
    expect(vectorEnd({ x: 10, y: 20 }, { x: 4, y: -2 }, 0.5)).toEqual({ x: 12, y: 19 });
  });
});

describe("sheepLabel", () => {
  it("leads with the classified mode and lists drives", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.debug!.fired = ["graze"];
    s.drives.hunger = 0.42;
    const lines = sheepLabel(s);
    expect(lines[0]).toBe("graze");
    expect(lines[1]).toContain("hun 0.42");
    expect(lines[1]).toContain("fear 0.00");
  });

  it("marks fleeing in the mode line", () => {
    const s = createSheep({ x: 0, y: 0 }, defaultSheepTraits());
    s.debug!.fired = ["graze", "flee"];
    expect(sheepLabel(s)[0]).toContain("flee");
  });
});

describe("grassAmountLabel", () => {
  it("renders density as a 0–100 integer amount", () => {
    expect(grassAmountLabel(1)).toBe("100");
    expect(grassAmountLabel(0)).toBe("0");
    expect(grassAmountLabel(0.5)).toBe("50");
    expect(grassAmountLabel(0.874)).toBe("87");
  });
});

describe("dogLabel", () => {
  it("shows rounded stamina", () => {
    const d = createDog({ x: 0, y: 0 });
    d.stamina = 88.4;
    expect(dogLabel(d)[0]).toBe("stamina 88");
  });

  it("adds a buff line when a buff is active", () => {
    const d = createDog({ x: 0, y: 0 });
    grantBuff(d, "zoomies");
    expect(dogLabel(d).some((l) => l.includes("zoomies"))).toBe(true);
  });
});
