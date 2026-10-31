import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MuseRuntime, museStatus } from "../packages/runtime/src/index.js";
const status = await museStatus();
if (!status.installed)
  throw new Error(
    "Muse CLI not installed. Follow https://dev.meta.ai/docs/muse-code",
  );
const dir = await mkdtemp(join(tmpdir(), "hybrid-muse-live-"));
try {
  const text = await new MuseRuntime().run({
    sessionId: "live-acceptance",
    workspaceRoot: dir,
    model: process.env.MUSE_MODEL || "muse-spark-1.2",
    prompt: "Do not use tools. Reply with the single word: hello",
    signal: AbortSignal.timeout(120000),
    onText: async (chunk) => {
      process.stdout.write(chunk);
    },
  });
  if (!/hello/i.test(text))
    throw new Error("Muse did not return the expected response");
  console.log("\nLive Muse read-only acceptance passed.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
