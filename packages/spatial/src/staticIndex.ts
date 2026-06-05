import RBush from "rbush";

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Boxed<T> extends AABB {
  item: T;
}

// Thin wrapper over an rbush R-tree for static geometry (fence segments, obstacles).
// Stores arbitrary items keyed by an AABB; query returns the items, not the boxes.
export class StaticIndex<T> {
  private readonly tree = new RBush<Boxed<T>>();

  insert(item: T, aabb: AABB): void {
    this.tree.insert({ ...aabb, item });
  }

  search(aabb: AABB): T[] {
    return this.tree.search(aabb).map((b) => b.item);
  }

  clear(): void {
    this.tree.clear();
  }
}
