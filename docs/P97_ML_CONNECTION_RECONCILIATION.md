# P97 — Mercado Libre connection reconciliation (preflight path)

## Status: DONE

### Root cause (runtime drift)

Preflight used **two different credential stacks**:

| Step | Code path | Behavior |
|------|-----------|----------|
| `credentialsOk` | `MarketplaceService.getCredentials(userId, 'mercadolibre', userEnvironment)` | `CredentialsManager` + preferred **environment** (`workflowConfigService.getUserEnvironment`) + global scope fallback + normalization |
| `testConnectionOk` (before P97) | `new MercadoLibrePublisher(); publisher.setUserId(userId); publisher.testConnection()` | Raw `prisma.apiCredential.findFirst({ apiName: 'mercadolibre', isActive: true, userId })` ordered by **`updatedAt`**, **no `environment` filter** |

So preflight could mark credentials **present/active** while `MercadoLibrePublisher.resolveCredentials()` loaded a **different or stale** row (e.g. another env or an older token). Refresh-on-401 exists in `MarketplaceService.testConnection` but **did not** run on the publisher path.

### Fix (same semantics as “connection recovered” tooling)

`buildMercadoLibrePublishPreflight` now calls:

`await marketplaceService.testConnection(userId, 'mercadolibre', userEnvironment)`

This is the **same** path used by API credential tests and recovery flows (including refresh retry on 401 when `refreshToken` is present).

**File edited:** `backend/src/services/mercadolibre-publish-preflight.service.ts`

**Instrumentation added to preflight payload:**

- `mercadoLibreApi.testConnectionMessage` — e.g. `MercadoLibre connection successful` or API error text  
- `mercadoLibreApi.credentialEnvironment` — `sandbox` | `production` (matches `getCredentials`)

### Proof (product 32714, post-fix)

From `p95-preflight.json` (run after this change):

```json
"mercadoLibreApi": {
  "testConnectionOk": true,
  "testConnectionMessage": "MercadoLibre connection successful",
  "credentialEnvironment": "production"
}
```

Blocker `mercadolibre_test_connection_failed` **does not** appear in `preflight.blockers`.

### Product scope

- **Product ID:** 32714 only (via `scripts/p95-preflight-check.ts` → `buildMercadoLibrePublishPreflight` for that product’s `userId`).
