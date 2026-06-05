import prand from "pure-rand";

export interface Rng {
  float(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  range(min: number, max: number): number; // [min, max)
  pick<T>(items: readonly T[]): T;
}

// Seedable PRNG over pure-rand's xoroshiro128+. The unsafe* distributions mutate
// the generator in place, giving a simple deterministic stream.
export function makeRng(seed: number): Rng {
  const gen = prand.xoroshiro128plus(seed);
  const u32 = () => prand.unsafeUniformIntDistribution(0, 0xffffffff, gen);
  const float = () => u32() / 0x100000000;
  const int = (min: number, max: number) => prand.unsafeUniformIntDistribution(min, max, gen);
  const range = (min: number, max: number) => min + float() * (max - min);
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError("pick from empty array");
    return items[int(0, items.length - 1)]!;
  };
  return { float, int, range, pick };
}
