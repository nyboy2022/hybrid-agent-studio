import { resolve } from "node:path";
import { Store, Studio } from "@hybrid/core";
import { DemoRuntime, MuseRuntime } from "@hybrid/runtime";
import { createServer } from "./server.js";

const dataDir = resolve(process.env.HYBRID_DATA_DIR || "../../.data");
const studio = new Studio(
  await Store.open(resolve(dataDir, "workspace.json")),
  [new DemoRuntime(), new MuseRuntime()],
  resolve(dataDir, "shared"),
);
const app = createServer(studio, {
  avatarDir: resolve(dataDir, "avatars"),
  token: process.env.HYBRID_API_TOKEN,
  webOrigin: process.env.HYBRID_WEB_ORIGIN,
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.HYBRID_API_PORT || 4310),
});
console.log("Hybrid API ready on loopback; data:", dataDir);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
