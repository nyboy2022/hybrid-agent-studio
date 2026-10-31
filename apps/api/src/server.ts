import Fastify from "fastify";
import { z, ZodError } from "zod";
import { Studio } from "@hybrid/core";
import { museStatus } from "@hybrid/runtime";

export function createServer(
  studio: Studio,
  options: { webOrigin?: string; token?: string } = {},
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
