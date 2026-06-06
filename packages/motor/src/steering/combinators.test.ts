import { describe, it, expect } from "vitest";
import { selector, conditional } from "./combinators.js";
import type { BehaviorNode, SteerContext } from "./types.js";
import type { Mobile } from "../types.js";

const ctx = {} as SteerContext; // nodes under test do not read ctx fields
const e = {} as Mobile;

// a stub node that writes a fixed x-force and reports a fixed status
function fixed(x: number, status: "fired" | "skipped"): BehaviorNode {
  return { run(_e, _ctx, out) { out.x = x; out.y = 0; return status; } };
}

describe("conditional", () => {
  it("runs the child when the predicate holds", () => {
    const node = conditional(() => true, fixed(5, "fired"));
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("fired");
    expect(out.x).toBe(5);
  });
  it("skips with zero force when the predicate fails", () => {
    const node = conditional(() => false, fixed(5, "fired"));
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe("selector", () => {
  it("returns the first child that fires and keeps its force", () => {
    const node = selector([fixed(0, "skipped"), fixed(7, "fired"), fixed(9, "fired")]);
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("fired");
    expect(out.x).toBe(7); // second child won; third never ran
  });
  it("reports skipped with zero force when every child skips", () => {
    const node = selector([fixed(1, "skipped"), fixed(2, "skipped")]);
    const out = { x: -1, y: -1 };
    expect(node.run(e, ctx, out)).toBe("skipped");
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
