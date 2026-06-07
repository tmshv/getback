import type { World } from "@getback/motor";
import { mount, attachKeyboard, createEdgeTrigger, intentFromKeys } from "./index.js";
import type { MountOptions } from "./Runner.js";

// Convenience entry point for example packages. Wires keyboard input and
// mounts the world. Examples call this instead of duplicating the
// input-wiring boilerplate themselves. Mirrors apps/getback/src/main.ts.
export async function runScenario(
  world: World,
  opts?: Omit<MountOptions, "input">,
): Promise<{ app: Awaited<ReturnType<typeof mount>>["app"] }> {
  // Keyboard input — attach before Pixi boots so no events are missed.
  const { pressed } = attachKeyboard(window);
  const barkEdge = createEdgeTrigger();

  return mount(world, {
    input: () => {
      const raw = intentFromKeys(pressed);
      const bark = barkEdge(pressed);
      return { moveDir: raw.moveDir, sprint: raw.sprint, bark };
    },
    ...opts,
  });
}
