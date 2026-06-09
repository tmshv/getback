import { describe, it, expect } from "vitest";
import { fencePostPositions, obstacleFrame } from "./props.js";
import type { Segment } from "@getback/motor";

describe("fencePostPositions", () => {
  const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
  });

  it("places posts along a segment including both endpoints", () => {
    const posts = fencePostPositions([seg(0, 0, 30, 0)], 10);
    expect(posts[0]).toEqual({ x: 0, y: 0 });
    expect(posts[posts.length - 1]).toEqual({ x: 30, y: 0 });
    expect(posts.length).toBe(4); // 0, 10, 20, 30
  });

  it("spaces posts evenly when the length is not a multiple of the spacing", () => {
    const posts = fencePostPositions([seg(0, 0, 25, 0)], 10);
    // ceil(25/10)=3 intervals -> 4 posts at 0, 8.33, 16.67, 25
    expect(posts.length).toBe(4);
    expect(posts[1]!.x).toBeCloseTo(25 / 3);
    expect(posts[posts.length - 1]!.x).toBeCloseTo(25);
  });

  it("dedupes the shared corner between adjacent segments", () => {
    const posts = fencePostPositions([seg(0, 0, 20, 0), seg(20, 0, 20, 20)], 10);
    const corners = posts.filter((p) => Math.abs(p.x - 20) < 0.01 && Math.abs(p.y) < 0.01);
    expect(corners.length).toBe(1); // shared vertex placed once
  });

  it("a degenerate (zero-length) segment yields a single post", () => {
    const posts = fencePostPositions([seg(5, 5, 5, 5)], 10);
    expect(posts).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("obstacleFrame", () => {
  it("maps tree obstacles to the tree frame", () => {
    expect(obstacleFrame({ kind: "tree", pos: { x: 0, y: 0 }, radius: 10 })).toBe("tree");
  });
  it("maps big rocks to boulder and small ones to rock", () => {
    expect(obstacleFrame({ kind: "rock", pos: { x: 0, y: 0 }, radius: 12 })).toBe("boulder");
    expect(obstacleFrame({ kind: "rock", pos: { x: 0, y: 0 }, radius: 7 })).toBe("rock");
  });
});
