import { afterEach, expect, it, vi } from "vitest";
import { MuseClient } from "@muse-code/sdk";
import { MuseRuntime, selectRuntime } from "../src/index.js";
vi.mock("@muse-code/sdk", () => ({ MuseClient: { spawn: vi.fn() } }));
afterEach(() => vi.resetAllMocks());
it("uses official SDK, verifies read-only permission, rejects approvals, streams agent text and closes host", async () => {
  let decide: ((request: unknown) => unknown) | undefined;
  const session = {
    onApproval: vi.fn((fn) => {
      decide = fn;
    }),
    sendUserTurn: vi.fn(async () => ({
      items: async function* () {
        yield { kind: "reasoning", itemId: "private", text: "hidden" };
        yield { kind: "agentMessage", itemId: "a", text: "hello" };
        yield { kind: "agentMessage", itemId: "a", text: "hello world" };
      },
      completed: Promise.resolve({
        kind: "completed",
        params: { terminal: "completed" },
      }),
    })),
  };
  const client = {
    startSession: vi.fn(async () => session),
    close: vi.fn(async () => {}),
  };
  vi.mocked(MuseClient.spawn).mockResolvedValue(
    client as unknown as MuseClient,
  );
  const chunks: string[] = [];
  const result = await new MuseRuntime().run({
    sessionId: "isolated",
    workspaceRoot: "/shared",
    model: "muse-spark-1.2",
    prompt: "read",
    signal: new AbortController().signal,
    onText: async (t) => {
      chunks.push(t);
    },
  });
  expect(client.startSession).toHaveBeenCalledWith(
    expect.objectContaining({
      permissionProfile: ":read-only",
      requirePermissionProfile: true,
      approvalMode: "denyUnmatched",
    }),
  );
  expect(
    decide!({
      availableChoices: [
        { choiceId: "allow", decision: "approved" },
        { choiceId: "no", decision: "denied" },
      ],
    }),
  ).toEqual({ choiceId: "no" });
  expect(result).toBe("hello world");
  expect(chunks.join("")).toBe("hello world");
  expect(client.close).toHaveBeenCalledTimes(1);
});
it("fails closed when host rejects read-only profile and always closes", async () => {
  const client = {
    startSession: vi.fn(async () => {
      throw new Error("permission_profile_unknown");
    }),
    close: vi.fn(async () => {}),
  };
  vi.mocked(MuseClient.spawn).mockResolvedValue(
    client as unknown as MuseClient,
  );
  await expect(
    new MuseRuntime().run({
      sessionId: "a",
      workspaceRoot: "/shared",
      model: "model",
      prompt: "task",
      signal: new AbortController().signal,
      onText: async () => {},
    }),
  ).rejects.toThrow("permission_profile_unknown");
  expect(client.close).toHaveBeenCalled();
});
it("does not route cloud tasks to local runtime", () => {
  expect(() => selectRuntime("cloud", "muse", [])).toThrow("not implemented");
});
it("aborts a stalled native turn and closes host instead of blocking the worker", async () => {
  const controller = new AbortController();
  const client = {
    startSession: vi.fn(async () => ({
      onApproval: vi.fn(),
      sendUserTurn: vi.fn(async () => ({
        items: async function* () {
          await new Promise(() => {});
        },
        completed: new Promise(() => {}),
      })),
    })),
    close: vi.fn(async () => {}),
  };
  vi.mocked(MuseClient.spawn).mockResolvedValue(
    client as unknown as MuseClient,
  );
  const result = new MuseRuntime().run({
    sessionId: "a",
    workspaceRoot: "/shared",
    model: "m",
    prompt: "task",
    signal: controller.signal,
    onText: async () => {},
  });
  await vi.waitFor(() => expect(client.startSession).toHaveBeenCalled());
  controller.abort(new Error("task timed out"));
  await expect(result).rejects.toThrow("task timed out");
  expect(client.close).toHaveBeenCalledTimes(1);
});
