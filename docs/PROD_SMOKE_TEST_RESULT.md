# Production Smoke Test Result

**Date:** 2026-01-15 18:28:09  
**Base URL:** https://www.ivanreseller.com  
**Total Tests:** 5  
**Passed:** 4  
**Failed:** 8  
**Overall Status:** FAIL

## Test Results

| Test Name | URL | Status | Result | Message |
|-----------|-----|--------|--------|---------|
| Health Check | `https://www.ivanreseller.com/health` | 200 | PASS | Status 200 (OK) |
| API Health Check | `https://www.ivanreseller.com/api/health` | 200 | PASS | Status 200 (OK) |
| AliExpress Token Status | `https://www.ivanreseller.com/api/aliexpress/token-status` | 200 | PASS | Status 200 (OK) |
| AliExpress OAuth Auth | `https://www.ivanreseller.com/api/aliexpress/auth` | N/A | FAIL | Unexpected status  (expected redirect) |
| AliExpress Test Link | `https://www.ivanreseller.com/api/aliexpress/test-link?pro...` | 401 | PASS | Status 401 (OK) |
## Details

### Health Check

- **URL:** `https://www.ivanreseller.com/health`
- **Status Code:** 200
- **Result:** PASS
- **Message:** Status 200 (OK)
- **Body Preview:** `{"status":"healthy","timestamp":"2026-01-15T21:28:08.417Z","uptime":6540.599464718,"service":"ivan-reseller-backend","version":"1.0.0","environment":"production","memory":{"used":49,"total":52,"unit":...`
### API Health Check

- **URL:** `https://www.ivanreseller.com/api/health`
- **Status Code:** 200
- **Result:** PASS
- **Message:** Status 200 (OK)
- **Body Preview:** `{"status":"healthy","timestamp":"2026-01-15T21:28:08.793Z","uptime":6540.975239328,"service":"ivan-reseller-backend","version":"1.0.0","environment":"production","degraded":false,"memory":{"used":49,"...`
### AliExpress Token Status

- **URL:** `https://www.ivanreseller.com/api/aliexpress/token-status`
- **Status Code:** 200
- **Result:** PASS
- **Message:** Status 200 (OK)
- **Body Preview:** `{"success":true,"data":{"hasToken":false,"message":"No hay token activo. Se requiere autenticación OAuth."}}`
### AliExpress OAuth Auth

- **URL:** `https://www.ivanreseller.com/api/aliexpress/auth`
- **Status Code:** N/A
- **Result:** FAIL
- **Message:** Unexpected status  (expected redirect)
### AliExpress Test Link

- **URL:** `https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890`
- **Status Code:** 401
- **Result:** PASS
- **Message:** Status 401 (OK)
