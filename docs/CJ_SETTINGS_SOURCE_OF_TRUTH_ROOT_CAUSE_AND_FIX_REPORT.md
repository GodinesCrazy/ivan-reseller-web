# CJ Settings — Source-of-Truth Root Cause & Fix Report

**Date:** 2026-04-14  
**Commit:** `c9f7c49`  
**Status:** FIXED — deployed to production

---

## Symptom (reproduced)

On `/api-settings` → CJ Dropshipping API card:

| Element | Before fix |
|---|---|
| Badge (initial load) | "API activa" (green) |
| Card body | "Configurado y funcionando" |
| "Probar conexión" result | `Error: APIkey is wrong, please check and try again` |
| Card after test | Amber / error state |

The card showed a valid/healthy state initially, but "Probar conexión" always failed.

---

## Hypotheses evaluated

| Option | Verdict |
|---|---|
| A. The key is genuinely invalid at CJ | **NOT the cause** — `checkCjDropshippingAPI` (which reads the real key) confirmed healthy |
| B. UI shows "saved credential" as "verified" | Previously fixed in `b631fdd` + `c809b37` |
| C. Save and test use different credential sources | **ROOT CAUSE** — test used masked key, save/status used real key |
| D. Credential read/map bug | **ROOT CAUSE** — masked key loaded from DB and forwarded to CJ |
| E. Decryption / scope bug | Not the cause |
| F. /api/settings/apis or /api/credentials/status overwriting test result | Not the cause |
| G. UI semantics wrong (backend correct, UI not) | Previously addressed |
| H. Old Vercel deploy | Not the case |

---

## Root Cause — Definitive

### Chain of events

1. **User opens `/api-settings`** — CJ card loads. Backend calls `checkCjDropshippingAPI(userId)` which reads the real decrypted key from DB via `CredentialsManager.getCredentialEntry`, tests it against CJ, gets success → cached as `healthy`.

2. **Card shows green** ("API activa / Configurado y funcionando") — correct, key IS valid.

3. **User clicks "Probar conexión"** — `handleTest` fires:
   - Checks `formData['cj-dropshipping::production']` → empty (user hasn't typed anything)
   - **Enters the "load from DB" fallback** (lines 2346-2368 of `APISettings.tsx`):
     - Calls `GET /api/credentials/cj-dropshipping`
     - Backend handler (line 628-633 of `api-credentials.routes.ts`) applies `maskCjCredentialsForResponse` → returns `{ apiKey: "****8817" }` (last-4 mask via `maskSecretTailFour`)
   - `currentFormData = { apiKey: "****8817" }`

4. **Builds `testCredentials`**:
   - `fieldsToUse` from backend definition = `[{ key: 'apiKey', ... }]`
   - `currentFormData['apiKey'] = "****8817"` (non-empty!) → included
   - `testCredentials = { apiKey: "****8817" }`

5. **POST `/api/credentials/cj-dropshipping/test`** with `{ credentials: { apiKey: "****8817" } }`:
   - Backend test endpoint (line 1400): `rawKey = "****8817"`
   - Calls `testCjDropshippingConnectionWithApiKey("****8817")`
   - CJ API correctly rejects: `"APIkey is wrong, please check and try again"`

6. **Card updates to error state** — contradiction with initial healthy state.

### Why `maskSecretTailFour` is correct but `handleTest` misused the result

`maskSecretTailFour` is intentionally designed to **never send a full secret to the browser**. It is correct security behavior. The bug was that `handleTest` treated the masked response as a usable credential for testing.

The backend's "no-tempCredentials" path for CJ (line 1515-1516) correctly uses `checkCjDropshippingAPI(userId)` which reads the real (unmasked) key from DB. The fix makes `handleTest` fall through to that path.

---

## Technical Evidence

### `redact.ts` line 7
```typescript
export function maskSecretTailFour(value: string): string {
  return `****${s.slice(-4)}`;  // e.g. "****8817"
}
```

### `api-credentials.routes.ts` lines 628-633
```typescript
if (backendApiName === 'cj-dropshipping' && !shouldMaskCredentials && credentials) {
  credentials = maskCjCredentialsForResponse(credentials);
  // result: { apiKey: "****8817" }
}
```

### `settings.routes.ts` line 387 — backend CJ field definition
```javascript
fields: [{ key: 'apiKey', label: 'CJ API Key', required: true, type: 'password' }]
```
Field key is `apiKey` — matches the masked credential key exactly. This is why the masked value was picked up by the field loop.

### `handleTest` critical path (before fix)
```
GET /api/credentials/cj-dropshipping
→ { apiKey: "****8817" }
→ currentFormData = { apiKey: "****8817" }
→ fieldsToUse = [{ key: 'apiKey' }]
→ testCredentials = { apiKey: "****8817" }   ← masked!
→ POST /test { credentials: { apiKey: "****8817" } }
→ CJ: "APIkey is wrong"
```

### `checkCjDropshippingAPI` path (status + immediateStatus)
```
CredentialsManager.getCredentialEntry(userId, 'cj-dropshipping', 'production')
→ DB decrypt → { apiKey: "REAL_FULL_KEY" }   ← real key
→ testCjDropshippingConnectionWithApiKey("REAL_FULL_KEY")
→ CJ: success
```

---

## Fix Applied

**File:** `frontend/src/pages/APISettings.tsx`  
**Commit:** `c9f7c49`  
**Lines changed:** ~24 lines across 2 locations

### Fix 1 — Filter masked values when loading from DB (lines ~2354-2372)

```typescript
const strValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
// Skip masked credential values ("****XXXX")
if (!strValue.startsWith('****')) {
  normalized[key] = strValue;
}
// Only update formData/currentFormData if we got non-masked values
if (Object.keys(normalized).length > 0) {
  currentFormData = normalized;
  setFormData(prev => ({ ...prev, [formKey]: normalized }));
}
```

**Effect for CJ**: `apiKey: "****8817"` filtered out → `normalized = {}` → `currentFormData` stays empty → `testCredentials = null` → backend uses `checkCjDropshippingAPI(userId)` with real DB key.

**Effect for other APIs**: non-masked values (e.g. eBay `redirectUri`) still pass through correctly.

### Fix 2 — Filter masked values when building testCredentials from formData (line ~2445)

```typescript
} else if (value.trim() && !value.trim().startsWith('****')) {
  // Skip masked values stored in formData from a previous test cycle
  testCredentials[backendKey] = value.trim();
}
```

**Effect**: Even if stale masked values are in `formData` state (set by a previous test), they're ignored when building `testCredentials`. Defensive layer.

---

## Data Flow After Fix

```
User clicks "Probar conexión" (form empty)
↓
handleTest: currentFormData = {} (empty)
↓
Load from DB: { apiKey: "****8817" } → filtered → normalized = {}
↓
currentFormData stays {}
↓
testCredentials = null (never set, Object.keys({}) = 0)
↓
POST /test { environment: 'production', scope: 'user' }  ← no credentials
↓
Backend: tempCredentials = undefined → DB path
↓
case 'cj-dropshipping': checkCjDropshippingAPI(userId)
↓
CredentialsManager reads REAL key → tests against CJ
↓
If valid: { isAvailable: true, status: 'healthy' }
If invalid: { isAvailable: false, status: 'unhealthy', error: 'APIkey is wrong...' }
↓
Frontend: setStatuses with status:'healthy'|'unhealthy' (fixed in c809b37)
↓
Card shows consistent state — no contradiction
```

---

## What Was NOT Changed

- Backend CJ credential validation, `checkCjDropshippingAPI`, `maskCjCredentialsForResponse`
- The masking behavior (correct security design, must stay)
- Any other API's test flow
- The CJ→eBay pipeline

---

## Cumulative fixes in this bug track

| Commit | Fix |
|---|---|
| `b631fdd` | `handleSave` correctly used `immediateStatus` for CJ; auto-test skip; cache clear fix |
| `c809b37` | `handleTest` `setStatuses` missing `status`/`isAvailable`; `unhealthy` badge added |
| `c9f7c49` | **This fix**: masked key filtered from test credentials → test uses real DB key |

---

## Verification

After Vercel deploy of `c9f7c49`:

1. `https://www.ivanreseller.com/api-settings` → CJ card loads
2. Click "Probar conexión" (no typing in form)
3. **Expected**: toast "Conexión exitosa con CJ Dropshipping API" + card stays green
4. If key is stored and valid → no contradiction
5. If key is invalid → card shows "Clave inválida" (red) + "Error de configuración"

The card will never again show green while the test returns "APIkey is wrong".
