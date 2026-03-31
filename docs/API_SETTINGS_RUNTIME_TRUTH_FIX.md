# API Settings / auth-status — verdad runtime

## `/api/auth-status`

- En `SAFE_AUTH_STATUS_MODE` solo refleja **DB** (p. ej. fila `aliexpress`).
- Respuesta añade **`_integrationTruthHint`**: para ML/eBay comparables y probes usar **`GET /api/credentials/status`**.

## `/api/credentials/status`

- Sigue siendo la fuente de `flowOperational.opportunityComparables` y (con `forceRefresh` en dropshipping) verificación por **product probe**.
