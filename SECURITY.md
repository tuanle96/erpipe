# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `0.1.x` (main) | ✅ |
| older tags | ❌ — upgrade to latest `main` / release |

## Reporting a vulnerability

**Do not** open a public GitHub issue for security problems.

Preferred:

1. **GitHub Security Advisories** — [Report a vulnerability](https://github.com/erpipe-org/erpipe/security/advisories/new) on this repository
2. Or email the maintainer: **justin.le.1105@gmail.com** with subject `[SECURITY] erpipe`

Please include:

- Affected package / component (`@erpipe/core`, self-host worker, smoke scripts, etc.)
- Description and impact
- Reproduction steps or PoC (if safe to share)
- Whether you plan to disclose publicly and preferred timeline

We aim to acknowledge within **72 hours** and share a remediation plan within **7 days** for confirmed issues.

## Scope notes

ERPipe tools can **read and (when enabled) write** Odoo data through credentials you configure. Treat connection secrets, API keys, and approval tokens as sensitive:

- Never commit `.env`, `.dev.vars`, or Odoo passwords
- Self-host: keep `ODOO_*` secrets in Wrangler secrets / a secret store
- Gated writes (`preview_write` → `execute_approved_write`) reduce accidental mutation; they are not a substitute for Odoo ACLs

Out of scope for this repo:

- Vulnerabilities only in the hosted multi-tenant product (separate private control plane)
- Issues solely in upstream Odoo or third-party MCP clients
