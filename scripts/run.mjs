import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
const webPort = process.env.PORT || "3000";
const env = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: "1",
  HYBRID_API_TOKEN: randomBytes(32).toString("hex"),
  HYBRID_API_PORT: process.env.HYBRID_API_PORT || "4310",
  HYBRID_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
  HYBRID_DATA_DIR: resolve(
    process.env.HYBRID_DATA_DIR || resolve(root, ".data"),
  ),
  NEXT_TELEMETRY_DISABLED: "1",
};
const children = [
  spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(require.resolve("tsx")).href,
      resolve(root, "apps/api/src/main.ts"),
    ],
    { cwd: root, env, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      webRequire.resolve("next/dist/bin/next"),
      process.argv.includes("--dev") ? "dev" : "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      webPort,
    ],
    { cwd: resolve(root, "apps/web"), env, stdio: "inherit" },
  ),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 4000);
  Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  ).then(() => {
    clearTimeout(timer);
    process.exit(code);
  });
}
for (const child of children) {
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
