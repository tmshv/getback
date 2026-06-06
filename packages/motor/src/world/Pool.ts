import type { Vec2 } from "@getback/math";

export interface PoolOptions<T> {
  /** Called once to manufacture a brand-new instance. */
  create: () => T;
  /**
   * Called every time an object is re-acquired from the free list.
   * Must fully reset mutable state so the caller receives a clean object.
   * The `pos` argument is the spawn position passed to `acquire`; the
   * reset function may ignore it — position is applied by the caller (or
   * SpawnSystem) after acquisition.
   */
  reset: (obj: T) => void;
}

/**
 * Generic free-list object pool.  Eliminates per-sheep GC churn in the
 * endless flock respawn cycle.
 *
 * acquire(pos) — return a recycled or freshly manufactured object.
 * release(obj) — return `obj` to the free list for future re-use.
 * size           — count of currently live (acquired, not released) objects.
 */
export class AgentPool<T> {
  private readonly _free: T[] = [];
  private _live = 0;
  private readonly _opts: PoolOptions<T>;

  constructor(opts: PoolOptions<T>) {
    this._opts = opts;
  }

  acquire(_pos: Vec2): T {
    let obj: T;
    if (this._free.length > 0) {
      obj = this._free.pop()!;
      this._opts.reset(obj);
    } else {
      obj = this._opts.create();
    }
    this._live++;
    return obj;
  }

  release(obj: T): void {
    this._live--;
    this._free.push(obj);
  }

  get size(): number {
    return this._live;
  }
}
