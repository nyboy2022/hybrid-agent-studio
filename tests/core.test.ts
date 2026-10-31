import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, Studio } from "../packages/core/src/index.js";
import {
  DemoRuntime,
  type AgentRuntime,
} from "../packages/runtime/src/index.js";
import { createServer } from "../apps/api/src/server.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture(runtime: AgentRuntime = new DemoRuntime()) {
  const dir = await mkdtemp(join(tmpdir(), "hybrid-test-"));
  dirs.push(dir);
  const store = await Store.open(join(dir, "workspace.json"));
  const studio = new Studio(store, [runtime], join(dir, "shared"));
  const a = await studio.saveBot({
    name: "程序员",
    role: "实现功能",
    runtime: runtime.kind,
    model: "test",
    target: "local",
  });
  const b = await studio.saveBot({
    name: "测试员",
    role: "审查结果",
    runtime: runtime.kind,
    model: "test",
    target: "local",
  });
  const group = await studio.createGroup({
    name: "工程团队",
    botIds: [a.id, b.id],
  });
  return { dir, store, studio, a, b, group };
}
async function idle(studio: Studio) {
  await vi.waitFor(() =>
    expect(
      studio
        .snapshot()
        .tasks.some((t) => ["running", "pending"].includes(t.status)),
    ).toBe(false),
  );
}
describe("workspace and collaboration", () => {
  it("persists Bot CRUD, group, messages, result and distinct sessions across restart", async () => {
    const f = await fixture();
    await f.studio.saveBot({ ...f.a, role: "编写 TypeScript" }, f.a.id);
    await f.studio.send(f.group.id, "@程序员 @测试员 检查项目");
    await idle(f.studio);
    const before = f.studio.snapshot();
    expect(before.tasks).toHaveLength(2);
    expect(before.tasks.every((t) => t.status === "completed")).toBe(true);
    expect(new Set(before.tasks.map((t) => t.sessionId)).size).toBe(2);
    const reopened = await Store.open(join(f.dir, "workspace.json"));
    expect(reopened.snapshot().messages).toEqual(before.messages);
    expect(reopened.snapshot().bots[1].role).toBe("编写 TypeScript");
    await f.studio.deleteBot(f.b.id);
    expect(f.studio.snapshot().groups[0].botIds).not.toContain(f.b.id);
    expect(f.studio.snapshot().tasks).toHaveLength(2);
  });
  it("rejects duplicate names, invalid mentions, nonmembers and unknown groups atomically", async () => {
    const f = await fixture();
    await expect(f.studio.saveBot(f.a)).rejects.toThrow("名称已存在");
    await expect(
      f.studio.send(f.group.id, "@程序 不应匹配部分名称"),
    ).rejects.toThrow("@提及");
    await expect(f.studio.send("missing", "hello")).rejects.toThrow(
      "群聊不存在",
    );
    await expect(
      f.studio.createGroup({ name: "bad", botIds: ["foreign"] }),
    ).rejects.toThrow("无效");
    expect(f.studio.snapshot().messages).toHaveLength(0);
  });
  it("addresses first group member when no mention is supplied", async () => {
    const f = await fixture();
    await f.studio.send(f.group.id, "请分析");
    await idle(f.studio);
    expect(f.studio.snapshot().tasks[0].botId).toBe(f.a.id);
  });
  it("hands completed work to another Bot with the prior result in context", async () => {
    const seen: string[] = [];
    const f = await fixture({
      kind: "demo",
      async run(input) {
        seen.push(input.prompt);
        await input.onText("实现成果");
        return "实现成果";
      },
    });
    const [first] = await f.studio.send(f.group.id, "@程序员 实现");
    await idle(f.studio);
    await f.studio.handoff(first.id, { botId: f.b.id, title: "审查成果" });
    await idle(f.studio);
    expect(seen[1]).toContain("交接成果：实现成果");
    expect(f.studio.snapshot().tasks[1].parentId).toBe(first.id);
    expect(
      f.studio.snapshot().audit.some((a) => a.action === "task.handoff"),
    ).toBe(true);
  });
  it("blocks repeated handoff and depth beyond three", async () => {
    const f = await fixture();
    const [root] = await f.studio.send(f.group.id, "工作");
    await idle(f.studio);
    let current = root;
    for (let i = 0; i < 3; i++) {
      current = await f.studio.handoff(current.id, {
        botId: f.b.id,
        title: `审查${i}`,
      });
      await idle(f.studio);
    }
    await expect(
      f.studio.handoff(current.id, { botId: f.a.id, title: "下一层" }),
    ).rejects.toThrow("深度上限");
    await expect(
      f.studio.handoff(root.id, { botId: f.a.id, title: "工作" }),
    ).rejects.toThrow("重复交接");
  });
  it("bounds model-driven fanout to eight tasks and rejects outsider delegation", async () => {
    let target = "";
    let n = 0;
    const f = await fixture({
      kind: "demo",
      async run() {
        n++;
        return JSON.stringify({
          text: `结果${n}`,
          delegations: [
            { botId: target, title: `a${n}` },
            { botId: target, title: `b${n}` },
            { botId: "outsider", title: "invalid" },
          ],
        });
      },
    });
    target = f.b.id;
    await f.studio.send(f.group.id, "分工");
    await idle(f.studio);
    expect(f.studio.snapshot().tasks.length).toBeLessThanOrEqual(8);
    expect(f.studio.snapshot().tasks.length).toBeGreaterThan(1);
    expect(
      f.studio.snapshot().messages.some((m) => m.text.includes("交接已阻止")),
    ).toBe(true);
  });
  it("does not pretend cloud execution exists", async () => {
    const f = await fixture();
    await f.studio.saveBot({ ...f.a, target: "cloud" }, f.a.id);
    await expect(f.studio.send(f.group.id, "@程序员 云端运行")).rejects.toThrow(
      "尚未实现云端",
    );
    expect(f.studio.snapshot().messages).toHaveLength(0);
    expect(f.studio.snapshot().workspace.computer.status).toBe(
      "not_implemented",
    );
  });
  it("serializes simultaneous writes without lost Bots and returns immutable snapshots", async () => {
    const f = await fixture();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        f.studio.saveBot({ ...f.a, name: `Bot${i}` }),
      ),
    );
    const snapshot = f.studio.snapshot();
    expect(snapshot.bots).toHaveLength(14);
    snapshot.bots.length = 0;
    expect(f.studio.snapshot().bots).toHaveLength(14);
    expect(
      JSON.parse(await readFile(join(f.dir, "workspace.json"), "utf8")).bots,
    ).toHaveLength(14);
  });
  it("reports runtime failures without claiming success", async () => {
    const f = await fixture({
      kind: "demo",
      async run() {
        throw new Error("provider unavailable");
      },
    });
    await f.studio.send(f.group.id, "运行");
    await idle(f.studio);
    expect(f.studio.snapshot().tasks[0]).toMatchObject({
      status: "failed",
      error: "provider unavailable",
    });
  });
});
describe("approval and recovery", () => {
  it("requires explicit approval, consumes it once, and rejects mutations during pending tasks", async () => {
    const run = vi.fn(async () => "真实适配器测试替身");
    const f = await fixture({ kind: "muse", run });
    await f.studio.send(f.group.id, "@程序员 分析");
    expect(run).not.toHaveBeenCalled();
    await expect(f.studio.deleteBot(f.a.id)).rejects.toThrow("先完成或拒绝");
    await expect(f.studio.saveBot(f.a, f.a.id)).rejects.toThrow("先完成或拒绝");
    const approval = f.studio.snapshot().approvals[0];
    await f.studio.decide(approval.id, true);
    await idle(f.studio);
    expect(run).toHaveBeenCalledTimes(1);
    await expect(f.studio.decide(approval.id, true)).rejects.toThrow("已处理");
    await f.studio.send(f.group.id, "@程序员 第二次");
    expect(run).toHaveBeenCalledTimes(1);
    await f.studio.decide(f.studio.snapshot().approvals[1].id, false);
    expect(f.studio.snapshot().tasks[1].status).toBe("denied");
  });
  it("does not let model delegation bypass approval", async () => {
    let target = "";
    const f = await fixture({
      kind: "muse",
      async run() {
        return JSON.stringify({
          text: "交接",
          delegations: [{ botId: target, title: "审查" }],
        });
      },
    });
    target = f.b.id;
    await f.studio.send(f.group.id, "工作");
    await f.studio.decide(f.studio.snapshot().approvals[0].id, true);
    await idle(f.studio);
    expect(f.studio.snapshot().tasks[1].status).toBe("awaiting_approval");
  });
  it("marks interrupted tasks failed and expires approvals on restart", async () => {
    const f = await fixture({
      kind: "muse",
      async run() {
        return "unused";
      },
    });
    await f.studio.send(f.group.id, "任务");
    const reopened = await Store.open(join(f.dir, "workspace.json"));
    expect(reopened.snapshot().tasks[0].status).toBe("failed");
    expect(reopened.snapshot().approvals[0].status).toBe("denied");
  });
  it("refuses corrupt persisted data rather than overwriting it", async () => {
    const f = await fixture();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(f.dir, "workspace.json"), "broken");
    await expect(Store.open(join(f.dir, "workspace.json"))).rejects.toThrow();
    expect(await readFile(join(f.dir, "workspace.json"), "utf8")).toBe(
      "broken",
    );
  });
});
describe("local API boundary", () => {
  it("rejects unauthenticated and cross-origin mutations, validates bodies, accepts valid requests", async () => {
    const f = await fixture();
    const app = createServer(f.studio, { token: "test-token" });
    try {
      expect(
        (await app.inject({ method: "GET", url: "/state" })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/bots",
            headers: {
              authorization: "Bearer test-token",
              origin: "https://evil.example",
            },
            payload: f.a,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/bots",
            headers: { authorization: "Bearer test-token" },
            payload: {},
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/groups",
            headers: { authorization: "Bearer test-token" },
            payload: { name: "API群", botIds: [f.a.id] },
          })
        ).statusCode,
      ).toBe(200);
      const health = await app.inject({
        method: "GET",
        url: "/health",
        headers: { authorization: "Bearer test-token" },
      });
      expect(health.json()).toMatchObject({
        computerImplemented: false,
        cloudImplemented: false,
      });
    } finally {
      await app.close();
    }
  });
});

it("keeps direct conversations distinct from named groups and reuses them after Bot rename", async () => {
  const f = await fixture();
  const regular = await f.studio.createGroup({
    name: f.a.name,
    botIds: [f.a.id],
  });
  const direct = await f.studio.createGroup({
    name: f.a.name,
    botIds: [f.a.id],
    kind: "direct",
  });
  expect(direct.id).not.toBe(regular.id);
  await f.studio.saveBot({ ...f.a, name: "新程序员" }, f.a.id);
  const again = await f.studio.createGroup({
    name: "新程序员",
    botIds: [f.a.id],
    kind: "direct",
  });
  expect(again.id).toBe(direct.id);
  await expect(
    f.studio.createGroup({
      name: "invalid",
      botIds: [f.a.id, f.b.id],
      kind: "direct",
    }),
  ).rejects.toThrow("一个 Bot");
});
