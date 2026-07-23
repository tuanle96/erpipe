# ERPipe (OSS) — Agent Instructions

## Ship Changelog Gate

For user-visible OSS changes, update `CHANGELOG.md` (Keep a Changelog style) in the same release commit when applicable. Prefer **user-readable** notes; leave deep eng detail to commits/PRs.

Hosted product release notes live in **erpipe-cloud**:
`packages/dashboard/src/content/changelog.json` → https://erpipe.com/changelog  
That page is for **end users** — plain outcomes only (no secrets, internal tooling, or agent notes).

When a cloud-facing behavior change is documented only in OSS `docs/`, still ensure the cloud public changelog is updated if operators will notice the change on mcp.erpipe.com.
