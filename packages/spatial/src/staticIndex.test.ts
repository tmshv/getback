import { describe, it, expect } from "vitest";
import { StaticIndex } from "./staticIndex.js";

describe("StaticIndex", () => {
  it("returns only items whose AABB overlaps the query", () => {
    const idx = new StaticIndex<string>();
    idx.insert("left", { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    idx.insert("right", { minX: 10, minY: 10, maxX: 12, maxY: 12 });

    const hit = idx.search({ minX: 1, minY: 1, maxX: 3, maxY: 3 });
    expect(hit).toEqual(["left"]);
  });

  it("returns both when the query spans them", () => {
    const idx = new StaticIndex<string>();
    idx.insert("a", { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    idx.insert("b", { minX: 5, minY: 5, maxX: 6, maxY: 6 });
    expect(idx.search({ minX: 0, minY: 0, maxX: 6, maxY: 6 }).sort()).toEqual(["a", "b"]);
  });

  it("clear() empties the index", () => {
    const idx = new StaticIndex<string>();
    idx.insert("a", { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    idx.clear();
    expect(idx.search({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
  });
});
