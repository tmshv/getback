import { runScenario } from "@getback/game";
import { buildWorld } from "./world.js";

const world = buildWorld(Date.now());
runScenario(world).catch(console.error);
