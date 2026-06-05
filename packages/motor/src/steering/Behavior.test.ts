import { describe, it, expect } from "vitest";
import type { Vec2 } from "@getback/math";
import { blend } from "./Behavior.js";
import type { BehaviorNode } from "./types.js";
import type { Mobile } from "../types.js";

const constNode = (fx: number, fy: number): BehaviorNode => ({
  run(_e, _ctx, out: Vec2) {
    out.x = fx;
    out.y = fy;
    return "fired";
  },
});

const skipNode: BehaviorNode = {
  run(_e, _ctx, out: Vec2) {
    out.x = 0;
    out.y = 0;
    return "skipped";
  },
};

function agent(maxForce: number): Mobile {
  return {
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, force: { x: 0, y: 0 },
    radius: 5, maxSpeed: 10, maxForce, facing: "down",
  };
}

describe("blend", () => {
  it("sums weighted child forces", () => {
    const node = blend([
      { node: constNode(2, 0), weight: 1 },
      { node: constNode(0, 3), weight: 2 },
    ]);
    const out = { x: 0, y: 0 };
    node.run(agent(100), { neighbors: [], dt: 0 }, out);
    expect(out).toEqual({ x: 2, y: 6 });
  });

  it("truncates to maxForce in priority order, starving low-priority children", () => {
    const node = blend([
      { node: constNode(100, 0), weight: 1 },
      { node: constNode(0, 50), weight: 1 },
    ]);
    const out = { x: 0, y: 0 };
    node.run(agent(80), { neighbors: [], dt: 0 }, out);
    expect(out.x).toBeCloseTo(80);
    expect(out.y).toBeCloseTo(0);
  });

  it("ignores skipped children", () => {
    const node = blend([
      { node: skipNode, weight: 1 },
      { node: constNode(5, 0), weight: 1 },
    ]);
    const out = { x: 0, y: 0 };
    node.run(agent(100), { neighbors: [], dt: 0 }, out);
    expect(out).toEqual({ x: 5, y: 0 });
  });
});
