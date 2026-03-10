# Start Autopilot script

Script to start the autopilot (optimized cycle) via the HTTP API: login, then `POST /api/autopilot/start`, then optional status check.

## When to use

- Backend is already running (local or production).
- You want to start the autopilot without opening the UI (e.g. from CI, Agent, or terminal).

## Prerequisites

- Backend running and reachable at `API_BASE_URL`.
- Valid user credentials (same as dashboard login).

## Configuration

Set in `.env.local` (or environment):

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Backend base URL | `http://localhost:4000` |
| `AUTOPILOT_LOGIN_USER` | Username for login | (required) |
| `AUTOPILOT_LOGIN_PASSWORD` | Password for login | (required) |

## Usage

From the backend directory:

```bash
# Using npm script (reads .env.local)
npm run start-autopilot

# Or with env vars inline (e.g. production)
API_BASE_URL=https://your-backend.railway.app AUTOPILOT_LOGIN_USER=admin AUTOPILOT_LOGIN_PASSWORD=xxx npx tsx scripts/start-autopilot.ts

# Local with .env.local already containing AUTOPILOT_LOGIN_*
API_BASE_URL=http://localhost:4000 npx tsx scripts/start-autopilot.ts
```

From Agent mode you can ask: "run the start-autopilot script" (ensure backend is up and credentials are set).

## Output

- Login success/failure.
- Autopilot start success/failure.
- Optional: `GET /api/autopilot/status` with `currentStatus` and last cycle info; if `currentStatus === 'running'`, the script prints that the cycle optimized started correctly.

Exit code: `0` on success, `1` on login/start error or missing credentials.
