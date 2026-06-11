import { describe, it, expect } from "vitest";
import { selector, conditional, tag, tagIfForce } from "./combinators.js";
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

describe("tag", () => {
  // a mobile carrying the optional debug side-channel the overlay reads
  function tagged(): Mobile {
    return { debug: { fired: [], force: { x: 0, y: 0 } } } as unknown as Mobile;
  }

  it("is transparent: passes through the child's status and force", () => {
    const node = tag("graze", fixed(8, "fired"));
    const out = { x: -1, y: -1 };
    expect(node.run(tagged(), ctx, out)).toBe("fired");
    expect(out.x).toBe(8);
  });

  it("records its label on the entity when the child fires", () => {
    const m = tagged();
    const out = { x: 0, y: 0 };
    tag("graze", fixed(8, "fired")).run(m, ctx, out);
    expect(m.debug!.fired).toContain("graze");
  });

  it("records nothing when the child skips", () => {
    const m = tagged();
    const out = { x: 0, y: 0 };
    expect(tag("graze", fixed(8, "skipped")).run(m, ctx, out)).toBe("skipped");
    expect(m.debug!.fired).toEqual([]);
  });

  it("is a no-op (no throw) when the entity has no debug record", () => {
    const out = { x: 0, y: 0 };
    expect(() => tag("graze", fixed(8, "fired")).run({} as Mobile, ctx, out)).not.toThrow();
  });
});

describe("tagIfForce", () => {
  function tagged(): Mobile {
    return { debug: { fired: [], force: { x: 0, y: 0 } } } as unknown as Mobile;
  }

  it("records when the child fires with non-zero force", () => {
    const m = tagged();
    tagIfForce("flee", fixed(3, "fired")).run(m, ctx, { x: 0, y: 0 });
    expect(m.debug!.fired).toContain("flee");
  });

  it("does NOT record when the child fires with zero force", () => {
    const m = tagged();
    expect(tagIfForce("flee", fixed(0, "fired")).run(m, ctx, { x: 0, y: 0 })).toBe("fired");
    expect(m.debug!.fired).toEqual([]);
  });

  it("does NOT record when the child skips", () => {
    const m = tagged();
    tagIfForce("flee", fixed(5, "skipped")).run(m, ctx, { x: 0, y: 0 });
    expect(m.debug!.fired).toEqual([]);
  });
});
