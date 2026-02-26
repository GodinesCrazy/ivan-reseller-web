# SECURITY EXPOSED SECRETS REPORT

**Date:** 2025-02-24  
**Scope:** Full project scan for exposed secrets (backend, frontend, docs, APIS2.txt, rail.txt).

---

## Summary

| Location | Type | Status | Requires rotation |
|----------|------|--------|-------------------|
| **APIS2.txt** | File with API keys | In `.gitignore`; if ever committed, treat as EXPOSED | YES (if in git history) |
| **rail.txt** | File with INTERNAL_RUN_SECRET, ALIEXPRESS_USER/PASS | In `.gitignore`; if ever committed, treat as EXPOSED | YES (if in git history) |
| **backend/.env.local** | Env file with real values | In `.gitignore`; never commit | YES (rotate all keys listed below) |
| **docs/API_CONFIGURATION_DIAGNOSIS.md** | Doc with AliExpress App Secret literal | EXPOSED (secret in repo) | YES ? redacted in this pass |
| **backend/src/config/env.ts** | Placeholder JWT for degraded mode | Weak default only when JWT_SECRET unset; not a real secret | NO (ensure production sets JWT_SECRET) |
| **backend/__tests__/setup.ts** | Test JWT/ENCRYPTION_KEY | Test-only values, not production | NO |
| **backend/scripts/bootstrap-verifier-env.js** | REPLACE_ME placeholders | No literal secrets | NO |
| **backend/scripts/configure-apis-from-apis2.ts** | Regex to extract from file | No literal secrets | NO |
| **backend/docs/RAILWAY_VARS_FROM_APIS2.md** | Variable names + ?APIS2: ?? | No secret values | NO |
| **FULL_AUTONOMOUS_DROPSHIPPING_CYCLE_REPORT.md** | Mentions PAYPAL_* set | No values | NO |
| **SECURITY_AND_OAUTH_FINAL_REPORT.md** | References files | No values | NO |

---

## Detailed table

| EXPOSED SECRET | FILE LOCATION | STATUS | REQUIRES ROTATION (YES/NO) |
|----------------|---------------|--------|-----------------------------|
| AliExpress App Secret (Dropshipping) | docs/API_CONFIGURATION_DIAGNOSIS.md | REDACTED (value removed) | YES |
| ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET | APIS2.txt (gitignored) | In .gitignore | YES if file was ever committed |
| PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET | APIS2.txt (gitignored) | In .gitignore | YES if file was ever committed |
| DATABASE_URL | backend/.env.local (gitignored) | In .gitignore | YES (rotate DB password and URL) |
| JWT_SECRET | backend/.env.local, env.ts placeholder | .env.local gitignored; env.ts = degraded placeholder only | YES (set strong value in env) |
| INTERNAL_RUN_SECRET | APIS2.txt, rail.txt, .env.local (gitignored) | In .gitignore | YES |
| SERP_API_KEY | APIS2.txt, .env.local (gitignored) | In .gitignore | YES if exposed |
| OPENAI_API_KEY | APIS2.txt, .env.local (gitignored) | In .gitignore | YES if exposed |
| STRIPE_SECRET_KEY | APIS2.txt, .env.local (gitignored) | In .gitignore | YES if exposed |
| SENDGRID_API_KEY | APIS2.txt, .env.local (gitignored) | In .gitignore | YES if exposed |
| OAuth tokens (eBay, AliExpress, etc.) | Stored in DB (api_credentials) | Not in code/docs | Rotate via re-OAuth if compromised |

---

## Actions taken

1. **docs/API_CONFIGURATION_DIAGNOSIS.md** ? Removed literal AliExpress App Secret; replaced with ?[REDACTED]?.
2. **New secrets** ? Script added to generate JWT_SECRET, INTERNAL_RUN_SECRET, ENCRYPTION_KEY (crypto.randomBytes(64)) and write only to backend/.env.local.
3. **Railway** ? RAILWAY_ENV_ROTATION_CHECKLIST.md created; all production secrets must be set in Railway dashboard (never in repo).

---

## Recommendations

- Rotate all credentials listed above (PayPal, AliExpress, DB, JWT, INTERNAL_RUN_SECRET, SERP, OpenAI, Stripe, SendGrid) and update Railway and .env.local.
- Ensure APIS2.txt and rail.txt are never committed (already in .gitignore). If they were committed in the past, rotate every key they contain and consider history cleanup (e.g. git filter-branch / BFG).
- In production, always set JWT_SECRET, INTERNAL_RUN_SECRET, ENCRYPTION_KEY (and DATABASE_URL) via environment; do not rely on any placeholder.
