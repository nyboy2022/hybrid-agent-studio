import { MuseClient } from "@muse-code/sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type RuntimeKind = "demo" | "muse";
export type Target = "local" | "cloud";
export interface RuntimeInput {
  sessionId: string;
  workspaceRoot: string;
  model: string;
  prompt: string;
  onText: (text: string) => Promise<void>;
  signal: AbortSignal;
}
export interface AgentRuntime {
  kind: RuntimeKind;
  run(input: RuntimeInput): Promise<string>;
}

// Deliberately deterministic and visibly labelled. It never claims to execute tools.
export class DemoRuntime implements AgentRuntime {
  kind = "demo" as const;
  async run(input: RuntimeInput) {
    const text = `[演示模型] 已收到任务。此回复不调用真实模型，也不执行电脑操作。\n${input.prompt.split("\n").at(-1)}`;
    for (const part of text.match(/.{1,12}/gs) ?? []) {
      input.signal.throwIfAborted();
      await input.onText(part);
    }
    return text;
  }
}

export async function museStatus() {
  try {
    const { stdout } = await promisify(execFile)(
      process.env.MUSE_BIN || "muse",
      ["--version"],
      { timeout: 5000 },
    );
    return {
      installed: true,
      version: stdout.trim(),
      authenticated: "unknown",
    };
  } catch {
    return { installed: false, version: null, authenticated: "unknown" };
  }
}

export class MuseRuntime implements AgentRuntime {
  kind = "muse" as const;
  async run(input: RuntimeInput) {
    input.signal.throwIfAborted();
    const client = await MuseClient.spawn({
      museBin: process.env.MUSE_BIN || "muse",
      cwd: input.workspaceRoot,
      clientInfo: { name: "hybrid-agent-studio", version: "0.1.0-alpha.1" },
    });
    let abort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () =>
        reject(input.signal.reason ?? new Error("Muse task aborted"));
    });
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      return await Promise.race([
        aborted,
        (async () => {
          input.signal.throwIfAborted();
          // No fallback to the user's default permission profile. SDK verifies application.
          const session = await client.startSession({
            workspaceRoot: input.workspaceRoot,
            modelId: input.model,
            permissionProfile: ":read-only",
            requirePermissionProfile: true,
            approvalMode: "denyUnmatched",
          });
          input.signal.throwIfAborted();
          session.onApproval((request) => {
            const reject = request.availableChoices.find(
              (c) => c.decision === "denied" || c.decision === "abort",
            );
            if (!reject)
              throw new Error(
                "Host offered no reject choice; refusing approval",
              );
            return { choiceId: reject.choiceId };
          });
          const turn = await session.sendUserTurn({
            input: [{ type: "text", text: input.prompt }],
          });
          const messages = new Map<string, string>();
          for await (const item of turn.items()) {
            input.signal.throwIfAborted();
            if (item.kind !== "agentMessage" || typeof item.text !== "string")
              continue;
            const previous = messages.get(item.itemId) ?? "";
            messages.set(item.itemId, item.text);
            if (item.text.startsWith(previous))
              await input.onText(item.text.slice(previous.length));
          }
          const outcome = await turn.completed;
          input.signal.throwIfAborted();
          if (
            outcome.kind !== "completed" ||
            outcome.params.terminal !== "completed"
          ) {
            throw new Error("Muse turn did not complete successfully");
          }
          return [...messages.values()].join("\n");
        })(),
      ]);
    } finally {
      input.signal.removeEventListener("abort", abort);
      await client.close();
    }
  }
}

export function selectRuntime(
  target: Target,
  kind: RuntimeKind,
  runtimes: AgentRuntime[],
) {
  if (target === "cloud")
    throw new Error("Cloud runtime is not implemented in phase 1");
  const runtime = runtimes.find((r) => r.kind === kind);
  if (!runtime) throw new Error("Runtime unavailable");
  return runtime;
}
