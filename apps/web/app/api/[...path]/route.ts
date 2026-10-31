import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const expected = process.env.HYBRID_WEB_ORIGIN || "http://127.0.0.1:3000";
  const host = new URL(expected).host;
  if (
    req.headers.get("host") !== host ||
    (req.headers.get("origin") && req.headers.get("origin") !== expected)
  )
    return Response.json({ error: "Origin rejected" }, { status: 403 });
  if (!process.env.HYBRID_API_TOKEN)
    return Response.json(
      { error: "请从仓库根目录运行 pnpm dev / pnpm start" },
      { status: 503 },
    );
  const { path } = await context.params;
  const route = path.join("/");
  if (
    !/^(health|state|runtime\/muse|bots(?:\/[\w-]+)?|groups|groups\/[\w-]+\/messages|tasks\/[\w-]+\/handoff|approvals\/[\w-]+)$/.test(
      route,
    )
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const body = ["POST", "PUT", "DELETE"].includes(req.method)
      ? await req.text()
      : undefined;
    if (body && body.length > 64000)
      return Response.json({ error: "Body too large" }, { status: 413 });
    const upstream = await fetch(
      `http://127.0.0.1:${process.env.HYBRID_API_PORT || 4310}/${route}`,
      {
        method: req.method,
        headers: {
          authorization: `Bearer ${process.env.HYBRID_API_TOKEN}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body || undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "本地 API 暂不可用" }, { status: 502 });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
