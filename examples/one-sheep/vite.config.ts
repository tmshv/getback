import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  // Serve @getback/game's shipped atlas (sprites.png/json) at the server root, so
  // mount()'s default fetch of "./assets/sprites.json" resolves in dev and build.
  publicDir: "../../packages/game/public",
  server: { port: 5174 },
});
