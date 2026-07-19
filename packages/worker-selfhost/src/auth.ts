/**
 * Self-host landing and OAuth authorization experience.
 * The production hosted product uses Resend magic-link (closed repo).
 */
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { mcpPath } from "./routes";
import {
  renderAuthorizePage,
  renderErrorPage,
  renderHomePage,
} from "./ui";

export type SelfhostEnv = {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  CONNECTION_SLUG?: string;
  OAUTH_PROVIDER: OAuthHelpers;
};

export function createAuthApp(slug: string) {
  const app = new Hono<{ Bindings: SelfhostEnv }>();

  app.use("*", async (c, next) => {
    await next();
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
  });

  app.get("/", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.html(
      renderHomePage({ endpoint: `${origin}${mcpPath(slug)}`, slug }),
    );
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
      const message = err instanceof Error ? err.message : "Invalid OAuth request.";
      return c.html(renderErrorPage("Authorization request is invalid", message), 400);
    }

    const resourceRaw = oauthReq.resource;
    if (resourceRaw) {
      try {
        const path = new URL(String(resourceRaw)).pathname.replace(/\/+$/, "");
        if (path !== mcpPath(slug)) {
          return c.html(
            renderErrorPage(
              "Resource does not match",
              `This instance serves ${mcpPath(slug)}, but the client requested ${path}. Check the endpoint in your MCP client.`,
            ),
            400,
          );
        }
      } catch {
        return c.html(
          renderErrorPage(
            "Resource URL is invalid",
            "Check the ERPipe endpoint configured in your MCP client and try again.",
          ),
          400,
        );
      }
    }

    const client = await c.env.OAUTH_PROVIDER.lookupClient(
      oauthReq.clientId,
    );
    const oauthState = btoa(JSON.stringify(oauthReq));
    return c.html(
      renderAuthorizePage({ slug, oauthState, request: oauthReq, client }),
    );
  });

  app.post("/authorize", async (c) => {
    const body = await c.req.parseBody();
    const email = String(body.email ?? "selfhost@local");
    const oauthState = String(body.oauth_state ?? "");

    let oauthReq: AuthRequest;
    try {
      oauthReq = JSON.parse(atob(oauthState)) as AuthRequest;
    } catch {
      return c.html(
        renderErrorPage(
          "Authorization session expired",
          "Start the connection again from your MCP client to create a new request.",
        ),
        400,
      );
    }

    if (!oauthReq.resource) {
      const origin = new URL(c.req.url).origin;
      oauthReq.resource = `${origin}${mcpPath(slug)}`;
    }

    try {
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
    } catch {
      return c.html(
        renderErrorPage(
          "Connection could not be authorized",
          "Return to your MCP client and start the connection again. If the issue continues, verify this Worker's OAuth configuration.",
        ),
        500,
      );
    }
  });

  return app;
}
