import { describe, it, expect } from "vitest";
import { createTreat } from "./Treat.js";
import { config } from "../config.js";

describe("createTreat", () => {
  it("creates a treat with position and radius", () => {
    const t = createTreat({ x: 10, y: 20 });
    expect(t.pos).toEqual({ x: 10, y: 20 });
    expect(t.radius).toBe(config.treats.radius);
  });
});
