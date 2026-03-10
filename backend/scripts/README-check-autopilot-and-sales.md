# Check Autopilot and Sales script (read-only)

Script to verify autopilot status and sales count via the HTTP API. No changes are made to the backend.

## When to use

- Backend is already running (local or production).
- You want to see: (1) if autopilot is running, last run time, and target marketplaces; (2) how many sales exist and per marketplace.

## Prerequisites

- Backend running and reachable at `API_BASE_URL`.
- Valid user credentials (same as dashboard login).

## Configuration

Same as start-autopilot. Set in `.env.local` (or environment):

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Backend base URL | `http://localhost:4000` |
| `AUTOPILOT_LOGIN_USER` | Username for login | (required) |
| `AUTOPILOT_LOGIN_PASSWORD` | Password for login | (required) |

You can also use `E2E_LOGIN_USER` and `E2E_LOGIN_PASSWORD`.

## Usage

From the backend directory:

```bash
# Using npm script (reads .env.local)
npm run check-autopilot-and-sales

# Or with env vars inline (e.g. production)
API_BASE_URL=https://your-backend.railway.app AUTOPILOT_LOGIN_USER=admin AUTOPILOT_LOGIN_PASSWORD=xxx npx tsx scripts/check-autopilot-and-sales.ts
```

From Agent mode you can ask: "run the check-autopilot-and-sales script" (ensure backend is up and credentials are set).

## Output

- **Autopilot:** `running` or `stopped`, `lastRun` (ISO date or n/a), `targetMarketplaces` (e.g. ebay, mercadolibre).
- **Ventas:** Total count and breakdown by marketplace (e.g. `Ventas: 5 total (ebay: 3, mercadolibre: 2)`) or `Ventas: 0`.

Exit code: `0` on success, `1` on login or API error or missing credentials.
