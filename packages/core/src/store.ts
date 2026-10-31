import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkspaceState } from "./types.js";

export function initialState(): WorkspaceState {
  return {
    version: 1,
    workspace: {
      id: "local",
      name: "我的工作区",
      computer: {
        status: "not_implemented",
        topology: "shared-computer-isolated-sessions",
      },
    },
    bots: [],
    groups: [],
    messages: [],
    tasks: [],
    approvals: [],
    audit: [],
  };
}

// One API process owns a store. Transactions are serialized and committed by atomic rename.
export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    private file: string,
    private state: WorkspaceState,
  ) {}
  static async open(file: string) {
    let state = initialState();
    try {
      state = JSON.parse(await readFile(file, "utf8")) as WorkspaceState;
      if (state.version !== 1 || !Array.isArray(state.tasks))
        throw new Error("Unsupported workspace data");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const store = new Store(file, state);
    await store.update((s) => {
      for (const task of s.tasks) {
        if (
          task.status === "running" ||
          task.status === "pending" ||
          task.status === "awaiting_approval"
        ) {
          task.status = "failed";
          task.error = "进程重启，任务已中断；请手动重新提交";
        }
      }
      for (const approval of s.approvals)
        if (approval.status === "pending") approval.status = "denied";
    });
    return store;
  }
  snapshot() {
    return structuredClone(this.state);
  }
  update<T>(fn: (state: WorkspaceState) => T): Promise<T> {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = fn(next);
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      await writeFile(`${this.file}.tmp`, JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
      await rename(`${this.file}.tmp`, this.file);
      this.state = next;
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
