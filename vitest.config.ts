import { defineConfig } from "vitest/config";

/**
 * Root Vitest config — replaces deprecated vitest.workspace.ts.
 * Each package keeps its own vitest.config.ts; this file only lists projects.
 */
export default defineConfig({
  test: {
    projects: ["packages/core", "packages/xmlrpc", "packages/worker-selfhost"],
  },
});
