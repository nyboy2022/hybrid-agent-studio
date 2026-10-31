import { _electron as electron, test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
const require = createRequire(
  new URL("../../apps/desktop/package.json", import.meta.url),
);
test("Electron opens the real local workspace with isolated renderer", async () => {
  const data = await mkdtemp(resolve(tmpdir(), "hybrid-desktop-"));
  const env = { ...process.env, HYBRID_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("apps/desktop")],
    env,
    timeout: 70000,
  });
  try {
    const window = await application.firstWindow();
    await expect(
      window.getByRole("heading", { name: "团队群聊", exact: true }),
    ).toBeVisible();
    await expect(
      window.getByText("从一个小团队开始", { exact: true }),
    ).toBeVisible();
    const settings = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    );
    expect(settings.nodeIntegration).toBe(false);
    expect(settings.contextIsolation).toBe(true);
    expect(settings.sandbox).toBe(true);
    await window.screenshot({ path: "desktop-test-results/desktop-mvp.png" });
  } finally {
    await application.close();
    await rm(data, { recursive: true, force: true });
  }
});
