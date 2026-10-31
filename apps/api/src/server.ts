import Fastify from "fastify";
import { z, ZodError } from "zod";
import { Studio } from "@hybrid/core";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { museStatus } from "@hybrid/runtime";

export function createServer(
  studio: Studio,
  options: { webOrigin?: string; token?: string; avatarDir?: string } = {},
) {
  const app = Fastify({ bodyLimit: 64000 });
  const origin = options.webOrigin ?? "http://127.0.0.1:3000";
  app.addHook("onRequest", async (req, reply) => {
    // API is loopback-only. Same-origin Web proxy supplies a process-local secret.
    if (
      options.token &&
      req.headers.authorization !== `Bearer ${options.token}`
    )
      return reply.code(401).send({ error: "Unauthorized" });
    if (req.headers.origin && req.headers.origin !== origin)
      return reply.code(403).send({ error: "Origin rejected" });
  });
  app.setErrorHandler((error, _req, reply) => {
    const status = error instanceof ZodError ? 400 : 400;
    reply
      .code(status)
      .send({ error: error instanceof Error ? error.message : "请求失败" });
  });
  app.get("/health", () => ({
    ok: true,
    computerImplemented: false,
    cloudImplemented: false,
  }));
  app.get("/state", () => studio.snapshot());
  app.get("/runtime/muse", () => museStatus());
  const imageTypes = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  app.post("/avatars", { bodyLimit: 750000 }, async (req) => {
    if (!options.avatarDir) throw new Error("Avatar storage unavailable");
    const { dataUrl } = z
      .object({ dataUrl: z.string().max(710000) })
      .parse(req.body);
    const match =
      /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        dataUrl,
      );
    if (!match) throw new Error("只支持 PNG、JPG、WebP 或 GIF 图片");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2])
      throw new Error("头像文件无效或超过 512KB");
    const ext = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "jpg"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
            ? "gif"
            : undefined;
    if (!ext || imageTypes[ext] !== match[1])
      throw new Error("图片格式与文件内容不匹配");
    const filename = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
    await mkdir(options.avatarDir, { recursive: true, mode: 0o700 });
    await writeFile(join(options.avatarDir, filename), bytes, { mode: 0o600 });
    return { src: `/api/avatars/${filename}` };
  });
  app.get<{ Params: { file: string } }>(
    "/avatars/:file",
    async (req, reply) => {
      const match = /^([a-f0-9]{64})\.(png|jpg|webp|gif)$/.exec(
        req.params.file,
      );
      if (!options.avatarDir || !match)
        return reply.code(404).send({ error: "Avatar not found" });
      try {
        const bytes = await readFile(join(options.avatarDir, req.params.file));
        return reply
          .type(imageTypes[match[2] as keyof typeof imageTypes])
          .header("cache-control", "private, max-age=31536000, immutable")
          .header("x-content-type-options", "nosniff")
          .send(bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return reply.code(404).send({ error: "Avatar not found" });
        throw error;
      }
    },
  );
  app.post("/bots", async (req) => studio.saveBot(req.body));
  app.put<{ Params: { id: string } }>("/bots/:id", async (req) =>
    studio.saveBot(req.body, req.params.id),
  );
  app.delete<{ Params: { id: string } }>("/bots/:id", async (req) => {
    await studio.deleteBot(req.params.id);
    return { ok: true };
  });
  app.post("/groups", async (req) => studio.createGroup(req.body));
  app.post<{ Params: { id: string } }>("/groups/:id/messages", async (req) => {
    const { text } = z.object({ text: z.string() }).parse(req.body);
    return studio.send(req.params.id, text);
  });
  app.post<{ Params: { id: string } }>("/tasks/:id/handoff", async (req) =>
    studio.handoff(req.params.id, req.body),
  );
  app.post<{ Params: { id: string } }>("/approvals/:id", async (req) => {
    const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
    await studio.decide(req.params.id, approved);
    return { ok: true };
  });
  return app;
}
