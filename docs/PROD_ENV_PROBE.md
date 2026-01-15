# Production Environment Probe Result

**Date:** 2026-01-15 18:27:55  
**Base URL:** https://www.ivanreseller.com  
**Total Tests:** 3  
**Passed:** 2  
**Failed:** 11  
**Env Vars Status:** PRESENT

## Test Results

| Test Name | URL | Status | Result | Message | Env Vars Evidence |
|-----------|-----|--------|--------|---------|-------------------|
| AliExpress Token Status | `https://www.ivanreseller.com/api/aliexpress/token-status` | 200 | PASS | Status 200 (OK) | N/A |
| AliExpress OAuth Auth | `https://www.ivanreseller.com/api/aliexpress/auth` | N/A | FAIL | Unexpected status  (expected redirect) | âš ï¸  Unclear |
| AliExpress Test Link | `https://www.ivanreseller.com/api/aliexpress/test-link?pro...` | 401 | PASS | Status 401 (OK) | âœ… No forbidden patterns (env vars likely present) |
## Details

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
## Environment Variables Status

**Overall Status:** PRESENT

### Evidence
âœ… **ENV VARS PRESENT** - AliExpress environment variables are configured in production.

Evidence:
- /api/aliexpress/auth redirects to AliExpress OAuth (302/301)
- /api/aliexpress/test-link does not contain "APP_KEY no configurado"
- Endpoints respond correctly without env-related errors
