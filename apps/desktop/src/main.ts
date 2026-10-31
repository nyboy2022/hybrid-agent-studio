import { app, BrowserWindow, dialog } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const url = "http://127.0.0.1:3470";
let child: ChildProcess | undefined;
let stopping = false;
let window: BrowserWindow | undefined;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  app.whenReady().then(async () => {
    // This alpha runs from the source checkout after pnpm build; no packaged installer yet.
    child = spawn(process.execPath, [resolve(root, "scripts/run.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: "3470",
        HYBRID_API_PORT: "4470",
        HYBRID_DATA_DIR:
          process.env.HYBRID_DATA_DIR ||
          resolve(app.getPath("userData"), "workspace"),
      },
      stdio: "ignore",
    });
    child.on("error", (error) => {
      dialog.showErrorBox("启动失败", error.message);
      app.quit();
    });
    child.on("exit", () => {
      if (!stopping) {
        dialog.showErrorBox(
          "服务已退出",
          "本地服务无法启动。请检查端口并在仓库根目录运行 pnpm build。",
        );
        app.quit();
      }
    });
    try {
      const deadline = Date.now() + 60000;
      while (true) {
        try {
          const response = await fetch(`${url}/api/health`);
          if (response.ok) break;
        } catch {
          /* Service is starting. */
        }
        if (Date.now() > deadline)
          throw new Error("本地服务启动超时，请先运行 pnpm build。");
        await new Promise((r) => setTimeout(r, 400));
      }
      window = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 900,
        minHeight: 650,
        title: "Hybrid Agent Studio",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, target) => {
        if (new URL(target).origin !== url) event.preventDefault();
      });
      await window.loadURL(url);
    } catch (error) {
      dialog.showErrorBox("启动失败", (error as Error).message);
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (!stopping && child && child.exitCode === null) {
      event.preventDefault();
      stopping = true;
      child.once("exit", () => app.quit());
      child.kill("SIGTERM");
      setTimeout(() => {
        child?.kill("SIGKILL");
        app.quit();
      }, 5000).unref();
    }
  });
}
