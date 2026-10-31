import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, Studio, botInput } from "../packages/core/src/index.js";
import { createServer } from "../apps/api/src/server.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZkAAAAASUVORK5CYII=";
const avatar = {
  kind: "image",
  value: `/api/avatars/${"a".repeat(64)}.png`,
  background: "#123456",
  foreground: "#ffffff",
  radius: 50,
  fit: "contain",
  scale: 1.5,
  x: 10,
  y: -12,
};
const bot = {
  name: "头像Bot",
  role: "协作",
  runtime: "demo",
  model: "demo",
  target: "local",
};
it("persists custom avatar parameters while accepting legacy Bots without avatars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hybrid-avatar-"));
  dirs.push(dir);
  const studio = new Studio(await Store.open(join(dir, "state.json")), [], dir);
  expect(botInput.parse(bot).avatar).toBeUndefined();
  const created = await studio.saveBot({ ...bot, avatar });
  const reopened = await Store.open(join(dir, "state.json"));
  expect(reopened.snapshot().bots[0].avatar).toEqual(avatar);
  await studio.saveBot(
    {
      ...created,
      avatar: { ...avatar, kind: "emoji", value: "🦊", radius: 0 },
    },
    created.id,
  );
  expect(studio.snapshot().bots[0].avatar?.value).toBe("🦊");
  await studio.saveBot({ ...created, avatar: undefined }, created.id);
  expect(studio.snapshot().bots[0].avatar).toBeUndefined();
});
it("rejects external image URLs, unsafe colors and invalid transform values", () => {
  for (const patch of [
    { value: "https://tracking.example/avatar.png" },
    { value: "data:image/svg+xml,evil" },
    { background: "url(evil)" },
    { scale: 10 },
    { x: 100 },
  ]) {
    expect(
      botInput.safeParse({ ...bot, avatar: { ...avatar, ...patch } }).success,
    ).toBe(false);
  }
});
it("uploads and serves identical private bytes through authenticated paths, with validation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hybrid-avatar-"));
  dirs.push(dir);
  const app = createServer(
    new Studio(await Store.open(join(dir, "state.json")), [], dir),
    { token: "test", avatarDir: join(dir, "avatars") },
  );
  const headers = { authorization: "Bearer test" };
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/avatars",
          payload: { dataUrl: `data:image/png;base64,${png}` },
        })
      ).statusCode,
    ).toBe(401);
    const uploaded = await app.inject({
      method: "POST",
      url: "/avatars",
      headers,
      payload: { dataUrl: `data:image/png;base64,${png}` },
    });
    expect(uploaded.statusCode).toBe(200);
    const file = uploaded.json().src.replace("/api", "");
    const response = await app.inject({ method: "GET", url: file, headers });
    expect(response.rawPayload).toEqual(Buffer.from(png, "base64"));
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toContain("private");
    expect((await app.inject({ method: "GET", url: file })).statusCode).toBe(
      401,
    );
    for (const dataUrl of [
      `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      `data:image/png;base64,${Buffer.from("<script/>").toString("base64")}`,
      `data:image/jpeg;base64,${png}`,
      `data:image/png;base64,${Buffer.alloc(530000).toString("base64")}`,
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/avatars",
            headers,
            payload: { dataUrl },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/avatars/unknown.png",
          headers,
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
