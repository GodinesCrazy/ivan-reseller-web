# E2E tests (Playwright)

Run with frontend and backend up. Credentials via env so they are not committed.

## Autopilot start

Verifies: login → navigate to /autopilot → click "Start Autopilot" → status shows "Running".

### Env

- `PLAYWRIGHT_BASE_URL` or `BASE_URL`: frontend URL (default `http://localhost:5173`)
- `E2E_LOGIN_USER` or `AUTOPILOT_LOGIN_USER`: username
- `E2E_LOGIN_PASSWORD` or `AUTOPILOT_LOGIN_PASSWORD`: password

### Run

```bash
# From frontend directory
npm run e2e

# With env (example)
E2E_LOGIN_USER=admin E2E_LOGIN_PASSWORD=xxx npm run e2e

# Headed (see browser)
npm run e2e:headed
```

If credentials are not set, the autopilot-start spec is skipped.

## Order fulfillment

Verifies: login → navigate to /orders → open an order → fulfillment UI (status and/or Cancelar compra en curso / Forzar compra / Reintentar compra) is visible.

### Env

- Same as above, plus optional `E2E_ORDER_ID`: open a specific order by ID (e.g. for testing "Cancelar compra en curso" when that order is in PURCHASING).

### Run

Same as above; both autopilot-start and order-fulfillment specs run. With `E2E_ORDER_ID` set to an order in PURCHASING state, the second test will click "Cancelar compra en curso" and assert the button disappears.
