# Ivan Reseller Web — Deployment Automation and Winner Engine Integration

You are continuing development of the production SaaS system Ivan Reseller Web. The system architecture currently consists of:

- Backend (Node.js / TypeScript) running on Railway
- Database: PostgreSQL on Railway
- Queue system: Redis + BullMQ on Railway
- Frontend: React + Vite SPA deployed on Vercel

Phase 1, Phase 2, and Phase 3 systems already exist. Your task now is to:

1. Remove any remaining manual deployment steps
2. Fully automate Vercel ↔ Railway integration
3. Ensure database migrations are applied automatically
4. Validate that the Winner Detection Engine works end-to-end
5. Stabilize the system for production use

Perform these tasks autonomously whenever possible. Do not require the user to perform manual configuration steps unless absolutely unavoidable.

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not break Phase 1, Phase 2, or Phase 3 systems.
- Only extend or repair deployment configuration.

---

# TASK 1 — AUTOMATIC BACKEND URL DETECTION

The current frontend Vercel configuration requires replacing a placeholder backend URL. Instead of manual replacement, implement automatic configuration.

**Steps:**

1. Read backend URL from environment variable: `VITE_API_URL`
2. Ensure the frontend runtime configuration uses this value when available.
3. If `VITE_API_URL` is not set, default to same-origin `/api`.

**Update:** `frontend/src/config/runtime.ts` to support this behavior.

---

# TASK 2 — FIX VERCEL REWRITE CONFIGURATION

Update `frontend/vercel.json` so that:

- `/api/:path*` is proxied to the Railway backend using an environment variable.
- Example concept: `destination: process.env.VITE_API_URL + "/:path*"`
- Ensure this configuration works with Vercel rewrites.
- Remove any hardcoded placeholder hostnames.

---

# TASK 3 — VERIFY FRONTEND DEPLOYMENT

Confirm that the Vite SPA builds correctly.

- Check: `npm run build` → `dist/`
- Ensure that Vercel serves the SPA with correct routing.
- Verify: all non-API routes serve `index.html`

---

# TASK 4 — AUTOMATIC DATABASE MIGRATION

Ensure the backend automatically applies migrations at startup.

**Verify the startup flow:**

1. `prisma generate`
2. `prisma migrate deploy`
3. start server

If necessary update server bootstrap scripts so migrations always run in production. Ensure the new Phase 3 migration (winning_products table) is applied without requiring manual execution.

---

# TASK 5 — VALIDATE WINNER DETECTION ENGINE

Verify that the Winner Detection Engine runs correctly.

**Components include:**

- `winner-detection.service.ts`
- `winner-detector.service.ts`
- BullMQ worker
- `winning_products` table

Confirm that the scheduled worker runs daily. Verify that `runMetricsBasedWinnerDetection()` reads data from `listing_metrics` and writes results to `winning_products`.

---

# TASK 6 — COMPLETE WINNER ENGINE INTEGRATION

Extend the system so that detected winners trigger follow-up actions.

**When a winning product is detected:**

1. Increase monitoring priority
2. Optionally trigger listing optimization
3. Mark product for potential scaling

Integrate with existing services:

- marketplaceService
- dynamic pricing system
- analytics system

Ensure these integrations are safe and additive.

---

# TASK 7 — VERIFY ANALYTICS UI

Confirm that the frontend dashboard displays winner data.

- The "Productos Ganadores" tab should call: `GET /api/analytics/winning-products`
- Verify that the UI renders correctly even if the table is empty.

---

# TASK 8 — PRODUCTION STABILITY CHECK

Perform a full system verification.

- Railway backend startup
- Redis connection
- BullMQ worker initialization
- Prisma migrations
- Frontend API connectivity

Ensure the system can run without manual intervention.

---

# FINAL OBJECTIVE

Ivan Reseller Web should run as a fully automated SaaS system. The platform should:

- collect marketplace metrics
- detect winning products automatically
- optimize listings
- provide analytics dashboards

Deployment should require no manual configuration steps. All improvements must integrate safely with the existing architecture.

---

# EXECUTION SUMMARY (automated)

The following was implemented when this prompt was executed:

**Task 1 — Automatic backend URL:** `frontend/src/config/runtime.ts` now uses `VITE_API_URL` when set (any environment); if unset, production defaults to `/api`, development to `http://localhost:4000`.

**Task 2 — Vercel rewrite:** Removed hardcoded placeholder from `frontend/vercel.json`. Vercel does not support env vars in rewrites; automatic configuration is achieved by setting `VITE_API_URL` in Vercel to the full Railway backend URL. Doc updated in `docs/DEPLOYMENT_VERCEL.md`.

**Task 3 — Frontend build:** Verified `npm run build` produces `dist/`; SPA routing via single rewrite to `/index.html` for non-API routes.

**Task 4 — Automatic migrations:** Backend already runs `prisma migrate deploy` in `full-bootstrap.ts` and via `start:with-migrations` / `start:prod`. Railway must use `npm run start:with-migrations` (or `start:prod`).

**Task 5 — Winner detection:** Confirmed `winner-detection.service.ts` (metrics) and `winner-detector.service.ts` (sales + metrics), BullMQ worker `winner-detection` daily, `runMetricsBasedWinnerDetection()` reads `listing_metrics` and writes `winning_products`.

**Task 6 — Winner follow-up:** When a winner is stored, `triggerWinnerFollowUp()` logs and, if `WINNER_TRIGGER_FOLLOW_UP=true`, enqueues a job to queue `winner-follow-up`. Worker runs optional listing optimization when `WINNER_FOLLOW_UP_RUN_OPTIMIZATION=true`. Product already gets `winnerDetectedAt` (monitoring priority).

**Task 7 — Analytics UI:** Tab "Productos Ganadores" in Reportes calls `GET /api/analytics/winning-products`, shows table and empty state.

**Task 8 — Production stability:** Checklist below.

---

# PRODUCTION STABILITY CHECKLIST

- **Railway backend:** Start command = `npm run start:with-migrations` or `npm run start:prod`. Env: `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`, `PORT`.
- **Redis:** Required for BullMQ; if missing, workers are skipped but API runs.
- **BullMQ:** Initialized in `ScheduledTasksService` when Redis is available; includes winner-detection, winner-follow-up, inventory-sync, listing-metrics-aggregate, etc.
- **Prisma migrations:** Run at bootstrap (`full-bootstrap.ts`) and in start script; Phase 3 migration `20250316000000_phase3_winning_products` creates `winning_products`.
- **Frontend API:** Set `VITE_API_URL` in Vercel to Railway backend URL (e.g. `https://xxx.railway.app`) for automatic connectivity; or configure `/api` rewrite in Vercel Dashboard and leave `VITE_API_URL` unset in production.
- **CORS:** If using direct backend URL from Vercel, ensure Railway `CORS_ORIGIN` includes the Vercel domain.
