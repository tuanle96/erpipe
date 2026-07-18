/**
 * Minimal mock authorize UI for self-host / demos.
 * Production hosted product uses Resend magic-link (closed repo).
 */
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { mcpPath } from "./routes";

export type SelfhostEnv = {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  CONNECTION_SLUG?: string;
  OAUTH_PROVIDER: OAuthHelpers;
};

export function createAuthApp(slug: string) {
  const app = new Hono<{ Bindings: SelfhostEnv }>();

  app.get("/", (c) => {
    const origin = new URL(c.req.url).origin;
    const path = mcpPath(slug);
    return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ERPipe self-host</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    code { background: #f4f4f5; padding: 0.15em 0.4em; border-radius: 4px; }
    .box { border: 1px solid #e4e4e7; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>ERPipe self-host</h1>
  <p>Open-source single-connection MCP example. Mode: <code>/{slug}/mcp</code>.</p>
  <div class="box">
    <p><strong>MCP URL</strong></p>
    <p><code>${origin}${path}</code></p>
    <p><strong>Slug</strong> <code>${slug}</code> (env <code>CONNECTION_SLUG</code>)</p>
  </div>
  <p><a href="/health">/health</a></p>
</body>
</html>`);
  });

  app.get("/health", (c) =>
    c.json({
      ok: true,
      product: "erpipe-selfhost",
      slug,
      allowPlainPKCE: false,
      mcpPath: mcpPath(slug),
    }),
  );

  app.get("/authorize", async (c) => {
    let oauthReq: AuthRequest;
    try {
      oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid_request";
      return c.text(message, 400);
    }

    const resourceRaw = oauthReq.resource;
    if (resourceRaw) {
      try {
        const path = new URL(String(resourceRaw)).pathname.replace(/\/+$/, "");
        if (path !== mcpPath(slug)) {
          return c.text(
            `This self-host instance only serves ${mcpPath(slug)}; got ${path}`,
            400,
          );
        }
      } catch {
        return c.text("Invalid resource parameter", 400);
      }
    }

    const oauthState = btoa(JSON.stringify(oauthReq));
    return c.html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Approve MCP</title>
<style>
  body { font-family: system-ui; max-width: 28rem; margin: 3rem auto; padding: 0 1rem; }
  label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
  input, button { width: 100%; padding: 0.5rem; font-size: 1rem; box-sizing: border-box; }
  button { margin-top: 1.25rem; background: #18181b; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
  .meta { color: #71717a; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>Approve MCP access</h1>
  <p class="meta">Self-host connection <code>${slug}</code></p>
  <form method="POST" action="/authorize">
    <input type="hidden" name="oauth_state" value="${oauthState}" />
    <label>Label (optional)</label>
    <input name="email" type="email" value="selfhost@local" />
    <button type="submit">Approve</button>
  </form>
</body>
</html>`);
  });

  app.post("/authorize", async (c) => {
    const body = await c.req.parseBody();
    const email = String(body.email ?? "selfhost@local");
    const oauthState = String(body.oauth_state ?? "");

    let oauthReq: AuthRequest;
    try {
      oauthReq = JSON.parse(atob(oauthState)) as AuthRequest;
    } catch {
      return c.text("Invalid oauth_state", 400);
    }

    if (!oauthReq.resource) {
      const origin = new URL(c.req.url).origin;
      oauthReq.resource = `${origin}${mcpPath(slug)}`;
    }

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReq,
      userId: email,
      metadata: { email, slug },
      scope: oauthReq.scope ?? [],
      props: {
        userId: email,
        email,
        slug,
        connectionId: `selfhost_${slug}`,
      },
    });

    return c.redirect(redirectTo, 302);
  });

  return app;
}
