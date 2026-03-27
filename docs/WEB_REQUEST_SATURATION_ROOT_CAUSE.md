# Web request saturation — root cause audit

## Symptom

The admin web showed frequent toasts: *«Demasiadas solicitudes. Por favor, espera un momento.»* (HTTP **429**), driven by the Axios response interceptor in `frontend/src/services/api.ts`.

## Primary root causes

### 1. Global API rate limit applied before `req.user` existed

**File:** `backend/src/app.ts`  
**Order:** `app.use('/api', createRoleBasedRateLimit())` ran **before** route-level `authenticate`, so `express-rate-limit`’s `max()` and `keyGenerator` usually saw **no** `req.user`.

**Effect:**

- Every browser session was keyed by **IP** (`ipKeyGenerator`), not `user:${userId}`.
- **ADMIN_LIMIT** (e.g. 1000 / 15 min) almost never applied; traffic used **DEFAULT_LIMIT** (e.g. **200 / 15 min**).

### 2. Admin skip path for rate limit never matched mounted routes

**File:** `backend/src/middleware/rate-limit.middleware.ts`  
**Bug:** `skip` used `req.path.startsWith('/api/admin')`. For middleware mounted at `/api`, `req.path` is typically **`/admin/...`**, not `/api/admin/...`, so the admin skip rarely (or never) triggered.

### 3. Frontend polling + parallel GETs consumed the budget quickly

**Products (`frontend/src/pages/Products.tsx`):**

- `useLiveData` every **15s** ran **three** requests: products (silent), inventory summary, post-sale overview.
- **~12 requests/minute** from polling alone → **~180 / 15 min**, i.e. **90%** of a 200 cap before navigation, workflow batch calls, operations truth, or Socket-driven refetches.

**Intelligent publisher (`frontend/src/pages/IntelligentPublisher.tsx`):**

- Each full refresh: pending + listings + **two** finance calls (`Promise.all`).
- **Double initial load:** `useEffect` called `loadPublisherData` and `useLiveData` also fired **immediately** on mount → duplicate burst.
- Polling used `loadPublisherData` with `setLoading(true)` → disruptive full-page spinner on every tick (bad UX and encouraged manual refreshes).

### 4. Socket notification refetches could stack with polling

**File:** `frontend/src/hooks/useNotificationRefetch.ts`  
Each `notification` event invoked handlers **immediately**. Bursts of events (e.g. job progress) could align with polling and push the client over the limit.

### 5. 429 handling retried GETs and could worsen load

**File:** `frontend/src/services/api.ts`  
Automatic **GET retries** after 429 added **more** requests while already throttled.

## Secondary / contributing factors

- Verbose `console.log` on **every** request in production (noise only; does not change HTTP volume).
- `useLiveData` visibility handler always called `runFetch()` when the tab became visible, on top of the interval (acceptable but adds spikes when combined with the above).

## Files and endpoints most involved

| Area | Files | Typical endpoints |
|------|--------|-------------------|
| Rate limit | `backend/src/app.ts`, `backend/src/middleware/rate-limit.middleware.ts`, **new** `optional-jwt-user.middleware.ts` | All `/api/*` |
| Products polling | `frontend/src/pages/Products.tsx` | `/api/products*`, `/api/dashboard/inventory-summary`, `/api/products/post-sale-overview` |
| Publisher | `frontend/src/pages/IntelligentPublisher.tsx` | `/api/publisher/pending`, `/api/publisher/listings`, `/api/finance/*` |
| Client 429 UX | `frontend/src/services/api.ts` | N/A |
| Socket refetch | `frontend/src/hooks/useNotificationRefetch.ts` | N/A (triggers same APIs as above) |

This audit informed the fixes documented in `WEB_REQUEST_RELIABILITY_FIXES.md`.
