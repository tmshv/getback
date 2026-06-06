import { mount, attachKeyboard, createEdgeTrigger, intentFromKeys } from "@getback/game";
import { buildGameWorld } from "./world.js";

async function run(): Promise<void> {
  const world = buildGameWorld(Date.now());

  // Keyboard input — attach before Pixi boots so no events are missed.
  const { pressed, dispose: disposeKeys } = attachKeyboard(window);
  const barkEdge = createEdgeTrigger();

  // Build a live hud override (no overrides — auto-detect from world).
  const hud = {};

  const { app } = await mount(world, {
    input: () => {
      const raw  = intentFromKeys(pressed);
      const bark = barkEdge(pressed);
      return { moveDir: raw.moveDir, sprint: raw.sprint, bark };
    },
    hud,
  });

  // Clean up on HMR / page unload.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disposeKeys();
      app.destroy(true);
    });
  }
}

run().catch(console.error);
