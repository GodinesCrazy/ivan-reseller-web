# Web request reliability fixes

## Backend

### 1. JWT attached before global rate limit (tiered limits + per-user keys)

**New:** `backend/src/middleware/optional-jwt-user.middleware.ts`  
**Wired in:** `backend/src/app.ts` — `app.use('/api', optionalJwtUserForRateLimit)` **before** `createRoleBasedRateLimit()`.

- Decodes a valid Bearer/cookie JWT **without** blacklist checks (lightweight; full auth remains on routes).
- Lets `createRoleBasedRateLimit` use **`user:${userId}`** and **ADMIN_LIMIT** when the user is an admin.

### 2. Admin skip path corrected

**File:** `backend/src/middleware/rate-limit.middleware.ts`  
- Skip when role is ADMIN and path starts with **`/admin`** or **`/api/admin`** (covers both mounted and full paths).
- Role comparison is case-insensitive.

## Frontend

### 3. Products page: one coordinated refresh, slower polling, hidden-tab discipline

**File:** `frontend/src/pages/Products.tsx`

- Single `refreshProductsPageLive` callback used for polling and notifications (same function reference → dedupe in notification batching).
- Initial load: one `useEffect` loads products + inventory + post-sale overview together.
- `useLiveData`: **30s** interval, **`pauseWhenHidden: true`**, **`skipInitialRun: true`** to avoid doubling the initial fetch.

### 4. Intelligent publisher: no double mount fetch, silent polling, slower interval

**File:** `frontend/src/pages/IntelligentPublisher.tsx`

- `loadPublisherData({ silent: true })` for polling/notifications so the full-page spinner does not flash every tick.
- `useLiveData`: **45s**, **`pauseWhenHidden: true`**, **`skipInitialRun: true`** (initial load remains in `useEffect` + `location.pathname`).

### 5. `useLiveData`: optional skip of initial run

**File:** `frontend/src/hooks/useLiveData.ts`  
- New option: **`skipInitialRun`** — avoids duplicate fetch when the page already loads data in `useEffect`.

### 6. Notification refetch: debounce + handler dedupe

**File:** `frontend/src/hooks/useNotificationRefetch.ts`

- **~450 ms** debounce window; collects all notification types in that window.
- Runs **unique handler function references** once per flush (so the same `refreshProductsPageLive` is not invoked twice for different event types).

### 7. Axios 429 behavior

**File:** `frontend/src/services/api.ts`

- **Removed** automatic GET retries on 429 (they increased load while throttled).
- **Throttled** rate-limit toast (minimum **8s** between toasts).
- Request/response `console.log` only in **`import.meta.env.DEV`**.

## Operational notes

- Tune `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_ADMIN`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_ENABLED` in backend env if a deployment still sees 429 under legitimate admin load.
- If 429 persists, check reverse proxies or shared egress IPs that might collapse many users into one IP **before** JWT optional attach (less common when the browser talks directly to the API with cookies/Bearer).
