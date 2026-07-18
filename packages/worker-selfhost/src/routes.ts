export const RESERVED = new Set([
  "authorize",
  "token",
  "register",
  "mcp",
  "sse",
  "assets",
  "health",
  ".well-known",
  "app",
  "admin",
]);

export function mcpPath(slug: string): string {
  return `/${slug}/mcp`;
}

export function parseSlugFromPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  const m = p.match(/^\/([a-z0-9][a-z0-9-]{0,62})\/mcp$/i);
  if (!m?.[1]) return null;
  const slug = m[1].toLowerCase();
  return RESERVED.has(slug) ? null : slug;
}
