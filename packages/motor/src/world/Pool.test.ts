import { describe, it, expect } from "vitest";
import { AgentPool } from "./Pool.js";

describe("AgentPool", () => {
  it("creates new objects via the factory when the free list is empty", () => {
    let calls = 0;
    const pool = new AgentPool({ create: () => ({ id: calls++ }), reset: () => {} });
    const a = pool.acquire({ x: 0, y: 0 });
    const b = pool.acquire({ x: 0, y: 0 });
    expect(calls).toBe(2);
    expect(a).not.toBe(b);
  });

  it("reuses released objects (free list) before creating new ones", () => {
    let calls = 0;
    const pool = new AgentPool({
      create: () => ({ val: calls++ }),
      reset: (o) => { (o as { val: number }).val = -1; },
    });
    const a = pool.acquire({ x: 0, y: 0 });
    pool.release(a);
    const b = pool.acquire({ x: 1, y: 1 }); // should reuse `a`
    expect(b).toBe(a); // same object identity
    expect(calls).toBe(1); // factory called only once
  });

  it("calls reset on the object before returning it from the free list", () => {
    let resetCalled = false;
    const pool = new AgentPool({
      create: () => ({ dirty: true }),
      reset: (o) => { o.dirty = false; resetCalled = true; },
    });
    const a = pool.acquire({ x: 0, y: 0 });
    a.dirty = true;
    pool.release(a);
    resetCalled = false;
    pool.acquire({ x: 0, y: 0 });
    expect(resetCalled).toBe(true);
  });

  it("grows on demand: acquiring without prior releases always creates", () => {
    let calls = 0;
    const pool = new AgentPool({ create: () => calls++, reset: () => {} });
    pool.acquire({ x: 0, y: 0 });
    pool.acquire({ x: 0, y: 0 });
    pool.acquire({ x: 0, y: 0 });
    expect(calls).toBe(3);
  });

  it("released objects re-enter the free list, LIFO order", () => {
    const pool = new AgentPool({ create: () => ({}), reset: () => {} });
    const a = pool.acquire({ x: 0, y: 0 });
    const b = pool.acquire({ x: 0, y: 0 });
    pool.release(b);
    pool.release(a);
    expect(pool.acquire({ x: 0, y: 0 })).toBe(a); // LIFO: a was released last
    expect(pool.acquire({ x: 0, y: 0 })).toBe(b);
  });

  it("size reports total live (acquired) objects", () => {
    const pool = new AgentPool({ create: () => ({}), reset: () => {} });
    expect(pool.size).toBe(0);
    const a = pool.acquire({ x: 0, y: 0 });
    expect(pool.size).toBe(1);
    pool.acquire({ x: 0, y: 0 });
    expect(pool.size).toBe(2);
    pool.release(a);
    expect(pool.size).toBe(1);
  });
});
