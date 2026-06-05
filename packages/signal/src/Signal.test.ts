import { describe, it, expect, vi } from "vitest";
import { Signal } from "./Signal.js";

describe("Signal", () => {
  it("emits to all listeners in registration order", () => {
    const s = new Signal<number>();
    const calls: string[] = [];
    s.add(() => calls.push("a"));
    s.add(() => calls.push("b"));
    s.emit(1);
    expect(calls).toEqual(["a", "b"]);
  });
  it("passes the emitted value", () => {
    const s = new Signal<{ n: number }>();
    const fn = vi.fn();
    s.add(fn);
    s.emit({ n: 7 });
    expect(fn).toHaveBeenCalledWith({ n: 7 });
  });
  it("does not fire removed listeners", () => {
    const s = new Signal<void>();
    const fn = vi.fn();
    s.add(fn);
    s.remove(fn);
    s.emit();
    expect(fn).not.toHaveBeenCalled();
  });
});
