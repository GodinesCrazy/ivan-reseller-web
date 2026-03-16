# Phase 12 — Deployment and Autonomous Operation

## Automated deployment steps

1. **Commit and push**
   - `git add . && git commit -m "feat(phase12): control center, health, readiness, ML optimizations" && git push origin main`

2. **CI**
   - Verify GitHub Actions / CI build passes (if configured).

3. **Deploy**
   - **Frontend (Vercel):** Connect repo to Vercel; deploy from `main`. Set env: `VITE_API_URL` (backend URL).
   - **Backend (Railway):** Deploy from `main`. Set env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, marketplace and supplier keys, and Phase 12 vars below.

4. **Environment variables (backend)**
   - `AUTONOMOUS_OPERATION_MODE` — set to `true` only after readiness checks pass.
   - `AUTONOMOUS_MAX_LISTINGS_PER_DAY` — safety cap (e.g. 50).
   - `AUTONOMOUS_MIN_MARGIN_PCT` — minimum margin for price/scaling (e.g. 10).
   - Optional: `HEALTH_BULLMQ_MAX_BACKLOG`, `RATE_LIMIT_LISTINGS_PER_HOUR`.

5. **Post-deploy**
   - Open `/control-center` and check **System Readiness** (database, Redis, workers, autonomous mode).
   - If all critical checks are OK and `canEnableAutonomous` is true, set `AUTONOMOUS_OPERATION_MODE=true` and restart backend.

## MercadoLibre sales optimizations

- **Competitive price:** Dynamic Marketplace Optimization and CRO already adjust price when competitor price is lower; applies to MercadoLibre listings using `competitorPrice` from listing metrics.
- **Fast shipping:** Prefer products with faster estimated delivery when available in product data (Market Intelligence / Auto Listing can use shipping signals when present).
- **Attribute completeness:** CRO action type `attribute_completion` triggers completion of brand, model, category, and specs for ML; enable with `CRO_EXECUTE_ATTRIBUTE_COMPLETION` when supported.

## Safety limits (env)

- `AUTONOMOUS_MAX_LISTINGS_PER_DAY` — max new listings per day.
- `SCALING_MAX_ACTIONS_PER_DAY` — max scaling actions per day (Phase 9).
- `CRO_MAX_ACTIONS_PER_LISTING_PER_DAY` — max CRO actions per listing per day (Phase 11).
- `OPTIMIZATION_MIN_MARGIN_PCT` / `CRO_MIN_MARGIN_PCT` — minimum margin for price changes.
