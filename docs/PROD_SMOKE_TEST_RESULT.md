# Production Smoke Test Result

**Date:** 2026-01-15 15:47:57  
**Base URL:** https://www.ivanreseller.com  
**Total Tests:** 5  
**Passed:** 3  
**Failed:** 2  
**Overall Status:** FAIL

## Test Results

| Test Name | URL | Status | Result | Message |
|-----------|-----|--------|--------|---------|
| Health Check | `https://www.ivanreseller.com/health` | 200 | PASS | Status 200 (OK) |
| API Health Check | `https://www.ivanreseller.com/api/health` | 200 | PASS | Status 200 (OK) |
| AliExpress Token Status | `https://www.ivanreseller.com/api/aliexpress/token-status` | 200 | PASS | Status 200 (OK) |
| AliExpress OAuth Auth | `https://www.ivanreseller.com/api/aliexpress/auth` | 500 | FAIL | Unexpected status 500 (expected redirect) |
| AliExpress Test Link | `https://www.ivanreseller.com/api/aliexpress/test-link?pro...` | 500 | FAIL | Request failed: Error en el servidor remoto: (500) Error interno del servidor. |
## Details

### Health Check

- **URL:** `https://www.ivanreseller.com/health`
- **Status Code:** 200
- **Result:** PASS
- **Message:** Status 200 (OK)
- **Body Preview:** `{"status":"healthy","timestamp":"2026-01-15T18:47:56.000Z","uptime":154.748021692,"service":"ivan-reseller-backend","version":"1.0.0","environment":"production","memory":{"used":44,"total":47,"unit":"...`
### API Health Check

- **URL:** `https://www.ivanreseller.com/api/health`
- **Status Code:** 200
- **Result:** PASS
- **Message:** Status 200 (OK)
- **Body Preview:** `{"status":"healthy","timestamp":"2026-01-15T18:47:56.466Z","uptime":155.213408508,"service":"ivan-reseller-backend","version":"1.0.0","environment":"production","degraded":false,"memory":{"used":44,"t...`
### AliExpress Token Status

- **URL:** `https://www.ivanreseller.com/api/aliexpress/token-status`
- **Status Code:** 200
- **Result:** PASS
- **Message:** Status 200 (OK)
- **Body Preview:** `{"success":true,"data":{"hasToken":false,"message":"No hay token activo. Se requiere autenticación OAuth."}}`
### AliExpress OAuth Auth

- **URL:** `https://www.ivanreseller.com/api/aliexpress/auth`
- **Status Code:** 500
- **Result:** FAIL
- **Message:** Unexpected status 500 (expected redirect)
### AliExpress Test Link

- **URL:** `https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890`
- **Status Code:** 500
- **Result:** FAIL
- **Message:** Request failed: Error en el servidor remoto: (500) Error interno del servidor.
