import { describe, it, expect } from "vitest";
import { directionFromVelocity } from "./direction.js";

describe("directionFromVelocity", () => {
  it("picks the dominant axis (screen y points down)", () => {
    expect(directionFromVelocity({ x: 5, y: 0 }, "down")).toBe("right");
    expect(directionFromVelocity({ x: -5, y: 0 }, "down")).toBe("left");
    expect(directionFromVelocity({ x: 0, y: 5 }, "down")).toBe("down");
    expect(directionFromVelocity({ x: 0, y: -5 }, "down")).toBe("up");
  });
  it("keeps the previous facing when nearly stationary", () => {
    expect(directionFromVelocity({ x: 0, y: 0 }, "left")).toBe("left");
    expect(directionFromVelocity({ x: 0.00001, y: 0 }, "up")).toBe("up");
  });
  it("breaks ties toward the vertical axis", () => {
    expect(directionFromVelocity({ x: 5, y: 5 }, "down")).toBe("down");
    expect(directionFromVelocity({ x: 6, y: 5 }, "down")).toBe("right");
  });
});
