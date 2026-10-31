import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("create Bots, group, mention, persistent chat, handoff and approval rejection", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 6);
  const coder = `程序员${suffix}`,
    reviewer = `测试员${suffix}`,
    muse = `Muse${suffix}`;
  await page.goto("/");
  await page.getByRole("button", { name: /我的 Bots/ }).click();
  for (const name of [coder, reviewer, muse]) {
    await page.getByLabel("Bot 名称", { exact: true }).fill(name);
    await page.getByLabel("角色与职责").fill("分析任务并审查成果");
    if (name === muse)
      await page.getByLabel("运行时", { exact: true }).selectOption("muse");
    await page.getByRole("button", { name: "创建 Bot", exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: /团队群聊/ }).click();
  await page.getByLabel("群名称").fill(`开发团队${suffix}`);
  for (const name of [coder, reviewer, muse])
    await page.getByLabel(name, { exact: true }).check();
  await page.getByRole("button", { name: "创建群聊", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `# 开发团队${suffix}` }),
  ).toBeVisible();
  await page.getByLabel("消息", { exact: true }).fill(`@${coder} 请分析项目`);
  await page.getByRole("button", { name: "发送 ↑" }).click();
  await expect(page.locator(".task-status.completed")).toHaveCount(1);
  await expect(
    page.locator(".message").filter({ hasText: "[演示模型]" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "交接任务 →" }).click();
  await page
    .getByLabel("交接给", { exact: true })
    .selectOption({ label: reviewer });
  await page.getByLabel("交接说明").fill("请审查上一位 Bot 的结果");
  await page.getByRole("button", { name: "确认交接", exact: true }).click();
  await expect(page.locator(".task-status.completed")).toHaveCount(2);
  await page.reload();
  await page.getByRole("button", { name: `# 开发团队${suffix}` }).click();
  // Workspace and task state survive browser reload.
  await expect(page.locator(".task-status.completed")).toHaveCount(2);
  await page.getByLabel("消息", { exact: true }).fill(`@${muse} 只读审查`);
  await page.getByRole("button", { name: "发送 ↑" }).click();
  await expect(page.locator(".task-status.awaiting_approval")).toHaveCount(1);
  await page.getByRole("button", { name: /安全审批/ }).click();
  await expect(page.getByText("Muse 只读任务", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(page.getByText("没有等待审批的任务")).toBeVisible();
  await page.getByRole("button", { name: /共享电脑/ }).click();
  await expect(
    page.getByText("后续阶段 · 尚未实现", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /团队群聊/ }).click();
  await page.screenshot({
    path: "test-results/studio-mvp.png",
    fullPage: true,
  });
});

test("Web proxy rejects hostile Origin and Host headers", async ({
  request,
}) => {
  const response = await request.post("/api/bots", {
    headers: { origin: "https://evil.example" },
    data: {},
  });
  expect(response.status()).toBe(403);
  const rebound = await request.get("/api/state", {
    headers: { host: "evil.example:3480" },
  });
  expect(rebound.status()).toBe(403);
});
