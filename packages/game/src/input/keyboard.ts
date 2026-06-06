import type { DogIntent } from "@getback/motor";
import type { Vec2 } from "@getback/math";

// Raw mapping: key code → axis contribution.
const AXIS_X: Record<string, number> = {
  ArrowLeft: -1, KeyA: -1,
  ArrowRight: 1, KeyD: 1,
};
const AXIS_Y: Record<string, number> = {
  ArrowUp: -1,   KeyW: -1,
  ArrowDown: 1,  KeyS: 1,
};

/**
 * Derive a DogIntent from a set of currently-pressed key codes.
 * `bark` is the RAW Space flag (true whenever Space is in the set).
 * Wrap with `createEdgeTrigger` to convert to a one-shot edge signal.
 */
export function intentFromKeys(pressed: Set<string>): DogIntent {
  let x = 0;
  let y = 0;
  for (const key of pressed) {
    if (AXIS_X[key] !== undefined) x += AXIS_X[key]!;
    if (AXIS_Y[key] !== undefined) y += AXIS_Y[key]!;
  }
  // Clamp opposing cancellations to [-1, 1] then normalize diagonal.
  if (x > 1) x = 1;
  if (x < -1) x = -1;
  if (y > 1) y = 1;
  if (y < -1) y = -1;
  const len = Math.hypot(x, y);
  const moveDir: Vec2 = len > 1e-6 ? { x: x / len, y: y / len } : { x: 0, y: 0 };

  const sprint = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
  const bark = pressed.has("Space");
  return { moveDir, sprint, bark };
}

/**
 * Returns a stateful function that converts the raw `bark` boolean from
 * `intentFromKeys` into an edge-trigger: true only on the frame Space first
 * becomes pressed, not while it is held.
 */
export function createEdgeTrigger(): (pressed: Set<string>) => boolean {
  let wasDown = false;
  return (pressed: Set<string>): boolean => {
    const isDown = pressed.has("Space");
    const fire = isDown && !wasDown;
    wasDown = isDown;
    return fire;
  };
}

/**
 * Attach keyboard listeners to `target` (typically `window`).
 * Returns a `dispose()` function that removes the listeners.
 * Feeds a live `Set<string>` of key codes (e.g. "KeyW", "ArrowUp", "Space").
 */
export function attachKeyboard(target: EventTarget): {
  pressed: Set<string>;
  dispose: () => void;
} {
  const pressed = new Set<string>();
  const onDown = (e: Event): void => {
    pressed.add((e as KeyboardEvent).code);
    // Prevent page scroll on arrow/space.
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        (e as KeyboardEvent).code,
      )
    ) {
      e.preventDefault();
    }
  };
  const onUp = (e: Event): void => { pressed.delete((e as KeyboardEvent).code); };
  const onBlur = (): void => { pressed.clear(); };
  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);
  return {
    pressed,
    dispose: () => {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}
