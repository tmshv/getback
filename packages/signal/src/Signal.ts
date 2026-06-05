export type Listener<T> = (value: T) => void;

// Tiny synchronous pub/sub. A Set preserves insertion order and dedupes listeners.
export class Signal<T = void> {
  private readonly listeners = new Set<Listener<T>>();

  add(fn: Listener<T>): void {
    this.listeners.add(fn);
  }

  remove(fn: Listener<T>): void {
    this.listeners.delete(fn);
  }

  emit(value: T): void {
    for (const fn of this.listeners) fn(value);
  }
}
