# Admin UI operational safety (web)

## Rate limiting and feedback

- **429** responses show a **throttled** toast (no rapid-fire spam) — see `frontend/src/services/api.ts`.
- Admins with a valid JWT should hit **higher** limits thanks to `optionalJwtUserForRateLimit` + `createRoleBasedRateLimit` in the backend.

## Intelligent publisher

- **Aprobar y publicar** — primary (blue).
- **Rechazar** — secondary (amber border); keeps catalog record, removes from approval queue.
- **Eliminar** — destructive (red border + trash icon); permanent delete when allowed.
- **Bulk** actions require prior **checkbox** selection and **explicit confirm**.
- **Publishing** bulk actions are disabled while **reject/remove bulk** is running and vice versa (shared `bulkPendingBusy` / `bulkStatus.running` patterns).

## Polling and background refresh

- **Products** and **Intelligent publisher** pause or slow polling when the **tab is hidden** (`pauseWhenHidden` / hidden interval in `useLiveData`).
- Socket-driven refetches are **debounced** and **deduped** by handler reference (`useNotificationRefetch`).

## If operators still see 429

1. Wait **one full rate-limit window** (default **15 minutes** unless env overrides).
2. Confirm the deployment includes **optional JWT before rate limit** (`backend/src/app.ts`).
3. Adjust **`RATE_LIMIT_ADMIN`** / **`RATE_LIMIT_DEFAULT`** for that environment if traffic is legitimate.
4. Check whether many clients share one **outbound IP** toward the API (corporate NAT); optional JWT mitigates this when each user has their own session.
