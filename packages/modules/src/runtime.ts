import { ModuleRegistry } from "./index.js";
import { rows } from "../../database/index.js";
export const registry = new ModuleRegistry();
registry.register({
  id: "polls",
  version: "1.0.0",
  apiVersion: 1,
  public: true,
  dependencies: [],
  permissions: ["polls.read", "polls.manage"],
  health: async () => {
    await rows("SELECT 1");
    return true;
  },
});
