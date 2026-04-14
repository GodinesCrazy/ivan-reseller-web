# CJ Settings — Root Cause & Fix Report

**Date:** 2026-04-14  
**Commit:** `c809b37`  
**Status:** FIXED

---

## Symptom

The CJ Dropshipping card on `/api-settings` showed a contradictory state:

| Element | Value |
|---|---|
| Badge | "Sesión activa" (green) |
| Card body | "Configurado y funcionando" |
| After clicking "Probar conexión" | `Error: APIkey is wrong, please check and try again` |

The card appeared healthy while the actual API key was invalid.

---

## Root Cause Analysis

### Bug 1 — `setStatuses` after `handleTest` missing `status` field

**File:** `frontend/src/pages/APISettings.tsx`  
**Function:** `handleTest` → `setStatuses` call (~line 2490)

When a connection test completed, the code stored:
```javascript
{ apiName, environment, available: isAvailable, message: errorMessage, lastChecked: ... }
```

No `status` field was included. The rendering pipeline at line ~4062 then computed:
```javascript
status = available ? 'healthy' : (apiStatus.status || (diag?.issues?.length ? 'unhealthy' : 'degraded'))
//       = false    ? 'healthy' : (undefined          || 'degraded')
//       = 'degraded'
```

`getStatusForAPI` matched `'degraded'` at the `otherStatus === 'degraded'` branch and returned **"Configurado con advertencias"** instead of the correct **"Error de configuración"**.

### Bug 2 — `STATUS_BADGE_STYLES` had no `unhealthy` entry

Because `status` computed to `'degraded'` and then to no match, the badge fell back to `STATUS_BADGE_STYLES.unknown` = "Sin información" — giving no clear signal of an invalid key.

### Bug 3 — "Sesión activa" label on a non-OAuth API

`STATUS_BADGE_STYLES.healthy.label = 'Sesión activa'` was designed for OAuth session tokens (eBay, ML). CJ Dropshipping uses an API key with no concept of a "session". When the key was valid, the badge said "Sesión activa", confusing the semantics for a stateless API key.

---

## Fixes Applied

### Fix 1 — `setStatuses` in `handleTest` now includes `status` and `isAvailable`

```javascript
setStatuses((prev) => ({
  ...prev,
  [makeEnvKey(apiName, environment)]: {
    apiName,
    environment,
    available: isAvailable,
    isAvailable: isAvailable,                          // ← added
    status: isAvailable ? 'healthy' : 'unhealthy',     // ← added
    message: errorMessage,
    lastChecked: ...,
  },
}));
```

After a failed test, `getStatusForAPI` now sees `otherStatus === 'unhealthy'` and correctly returns `{ status: 'error', message: 'Error de configuración' }`.

### Fix 2 — Added `unhealthy` entry to `STATUS_BADGE_STYLES`

```javascript
unhealthy: {
  className: 'bg-red-100 border-red-200 text-red-700',
  label: 'Clave inválida',
},
```

The badge now explicitly shows "Clave inválida" (red) when a test or status check confirms the key is rejected by the provider.

### Fix 3 — Non-OAuth APIs use "API activa" badge label

```javascript
const badgeTheme =
  statusInfo?.status && STATUS_BADGE_STYLES[statusInfo.status]
    ? (!apiDef.supportsOAuth && statusInfo.status === 'healthy'
        ? { ...STATUS_BADGE_STYLES[statusInfo.status], label: 'API activa' }
        : STATUS_BADGE_STYLES[statusInfo.status])
    : STATUS_BADGE_STYLES.unknown;
```

APIs without `supportsOAuth: true` (CJ, SerpAPI, etc.) now show "API activa" when healthy. OAuth APIs (eBay, ML, AliExpress) continue to show "Sesión activa".

---

## State Machine — After Fix

| Scenario | Badge | Card body |
|---|---|---|
| Valid key, backend confirms healthy | "API activa" (green) | "Configurado y funcionando" |
| Invalid key detected by test | "Clave inválida" (red) | "Error de configuración" |
| Invalid key detected by status endpoint | "Clave inválida" (red) | "Error de configuración" |
| Key saved but not yet tested | "Sin información" (slate) | per backend status |
| OAuth API with active token | "Sesión activa" (green) | "Configurado y funcionando" |

---

## What Was NOT Changed

- Backend CJ credential validation logic
- `checkCjDropshippingAPI` or `testCjDropshippingConnectionWithApiKey`
- The save flow or `immediateStatus` computation
- Any other API card behavior
