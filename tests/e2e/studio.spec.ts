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
  await page.getByRole("button", { name: "新建协作群", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("群名称").fill(`开发团队${suffix}`);
  for (const name of [coder, reviewer, muse])
    await page.getByLabel(name, { exact: true }).check();
  await page.getByRole("button", { name: "创建群聊", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `开发团队${suffix}` }),
  ).toBeVisible();
  await page.getByLabel("消息", { exact: true }).fill(`@${coder} 请分析项目`);
  await page.getByRole("button", { name: "发送 ↑" }).click();
  await expect(
    page.getByRole("complementary", { name: "任务与交接" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "任务", exact: true }).click();
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
  await page.getByRole("button", { name: "任务", exact: true }).click();
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
  await page.getByRole("button", { name: "关闭任务面板", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "任务与交接" }),
  ).toHaveCount(0);
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

test("Bot sidebar opens a persistent direct conversation and stays usable on mobile", async ({
  page,
  request,
}) => {
  const name = `研究员${randomUUID().slice(0, 6)}`;
  await request.post("/api/bots", {
    data: {
      name,
      role: "整理资料和审查结论",
      runtime: "demo",
      model: "demo",
      target: "local",
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: `与 ${name} 聊天`, exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByLabel("消息", { exact: true }).fill("帮我整理需求");
  await page.getByRole("button", { name: "发送 ↑" }).click();
  await expect(
    page.locator(".message").filter({ hasText: "[演示模型]" }),
  ).toBeVisible();
  const first = (await (await request.get("/api/state")).json()).groups.filter(
    (g: { name: string }) => g.name === name,
  );
  await page.getByRole("button", { name: "我的 Bots", exact: true }).click();
  await page
    .getByRole("button", { name: `与 ${name} 聊天`, exact: true })
    .click();
  await expect(
    page.locator(".message").filter({ hasText: "帮我整理需求" }).first(),
  ).toBeVisible();
  const reopened = (
    await (await request.get("/api/state")).json()
  ).groups.filter((g: { name: string }) => g.name === name);
  expect(reopened).toHaveLength(first.length);
  await page.getByRole("button", { name: "新建群聊", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("消息", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/studio-mobile.png" });
});

test("custom Emoji and image avatars persist and render across sidebar, chat and editor", async ({
  page,
  request,
}) => {
  const name = `头像${randomUUID().slice(0, 6)}`;
  const created = await request.post("/api/bots", {
    data: {
      name,
      role: "头像测试",
      runtime: "demo",
      model: "demo",
      target: "local",
    },
  });
  const botId = (await created.json()).id;
  await page.goto("/");
  await page.getByRole("button", { name: "我的 Bots", exact: true }).click();
  const card = page
    .locator("article.card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByText("自定义头像", { exact: true }).click();
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await page.getByLabel("Emoji 头像", { exact: true }).fill("🦊");
  await page.getByLabel("背景颜色", { exact: true }).fill("#613714");
  await page.getByRole("button", { name: "圆形", exact: true }).click();
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  const sidebar = page.getByRole("button", {
    name: `与 ${name} 聊天`,
    exact: true,
  });
  await expect(sidebar.locator(".avatar")).toContainText("🦊");
  await expect(sidebar.locator(".avatar")).toHaveCSS("border-radius", "50%");
  await sidebar.click();
  await page.getByLabel("消息", { exact: true }).fill("测试头像");
  await page.getByRole("button", { name: "发送 ↑" }).click();
  await expect(
    page
      .locator(".message")
      .filter({ hasText: "[演示模型]" })
      .locator(".avatar"),
  ).toContainText("🦊");
  await page.getByRole("button", { name: "我的 Bots", exact: true }).click();
  await card.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByText("自定义头像", { exact: true }).click();
  await page.getByRole("button", { name: "图片", exact: true }).click();
  await page.getByLabel("上传头像", { exact: true }).setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator(".avatar-preview img")).toBeVisible();
  await page.getByLabel("头像缩放", { exact: true }).fill("1.5");
  await page.getByLabel("头像水平位置", { exact: true }).fill("10");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.reload();
  await expect(sidebar.locator(".avatar img")).toBeVisible();
  const image = sidebar.locator(".avatar img");
  const src = await image.getAttribute("src");
  expect((await request.get(src!)).headers()["content-type"]).toBe("image/png");
  expect(
    await image.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    ),
  ).toBe(true);
  const saved = (await (await request.get("/api/state")).json()).bots.find(
    (b: { id: string }) => b.id === botId,
  );
  expect(saved.avatar).toMatchObject({
    kind: "image",
    scale: 1.5,
    x: 10,
    radius: 50,
  });
});
