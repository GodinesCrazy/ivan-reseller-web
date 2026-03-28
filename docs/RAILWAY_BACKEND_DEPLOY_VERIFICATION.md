# Railway backend — deploy verification

## Runtime HTTP proof (no dashboard)

**Host (from repo / inject script):** `https://ivan-reseller-backend-production.up.railway.app`

### `GET /version`

Executed from automation after fetch; sample response fields:

- `gitSha`: **`99766fb`**
- `gitShaFull`: **`99766fbf65324f5ad4b8bcf7771a714308f5337b`**
- `env`: `production`
- `buildTime`: `2026-03-28T02:20:56.190Z` (sample; changes per deploy)

### `GET /api/version`

Same JSON as `/version` on the verified runtime (endpoint added in hardened revision).

## Conclusion

Backend production **matches** repository `main` at **`99766fb`** (short SHA alignment). This is **not** the previously observed stale **`eb2e8cd`**.

## Note on “who deployed”

This document records **runtime verification**. Triggering Railway deploys requires project access (Dashboard, CLI, or Git integration). The agent cannot substitute your Railway credentials; once auto-deploy from `main` runs, verification is authoritative via the endpoints above.
