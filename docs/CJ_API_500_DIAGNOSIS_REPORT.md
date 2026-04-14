# CJ Open API 2.0 — HTTP 500 on authenticated calls (diagnosis)

## Verdict: **GO** (integration fixed on our side)

Authenticated calls failed because several paths were invoked with **`POST` and/or JSON bodies** while CJ’s documented contract is **`GET` with query parameters** for `setting/get`, `product/listV2`, `product/query`, `product/variant/query`, and `product/stock/queryByVid`. The API often answers with **HTTP 500** but returns a **parseable JSON body** explaining the real cause.

There is **no separate CJ endpoint named `verifyAuth`** in this codebase: `CjSupplierAdapter.verifyAuth()` is implemented as a **lightweight authenticated call** to **`GET .../setting/get`** (after this fix).

---

## What we observed (live run)

| Probe | Method | Path | HTTP | CJ envelope (summary) |
|--------|--------|------|------|------------------------|
| Legacy misuse | POST | `/api2.0/v1/setting/get` | **500** | `code: 16900202`, `message: "Request method 'POST' not supported"` |
| Documented | GET | `/api2.0/v1/setting/get` | 200 (or **429** if QPS exceeded) | Success or rate-limit message |
| Legacy misuse | POST | `/api2.0/v1/product/query` | **500** | Same `16900202` / POST not supported |
| Documented search | GET | `/api2.0/v1/product/listV2?...` | **200** | Normal list payload |
| Documented detail | GET | `/api2.0/v1/product/query?pid=...` | **200** | Product detail |

**Important:** CJ documents **QPS ≈ 1 request/second**. Rapid probes without delay can yield **HTTP 429** (`Too Many Requests`) on otherwise valid **GET** calls. That is **not** an account permission failure.

**`getAccessToken`:** Continues to succeed (`POST /authentication/getAccessToken` with `apiKey`). This was confirmed in the same runs as the table above.

---

## Root cause (technical)

1. **`setting/get`** must be **GET** with header **`CJ-Access-Token`** only (no `platformToken` required in the official curl).  
2. **`product/query`** in the docs is **GET** and expects identifiers such as **`pid`** (not a POST body with `pageNum` / `pageSize`). Listing/search uses **`GET product/listV2`** with query params such as `page`, `size`, `keyWord`.  
3. **`CJ-Access-Token` header name** was already correct; the failure was **verb/path contract**, not header spelling.  
4. The apparent “500” was **not** proof of CJ internal outage: the response body contained **`16900202`** and an explicit **unsupported method** message.

---

## Code changes (repository)

| Area | Change |
|------|--------|
| `CjSupplierAdapter.verifyAuth` | Uses **`authedGet('setting/get')`** instead of `postWithAccessToken(..., 'setting/get', {})`. |
| `searchProducts` | Uses **`GET product/listV2`** with `URLSearchParams` (maps `keyword` → `keyWord`, pagination → `page`/`size`, optional passthrough from `productQueryBody`). |
| `getProductById` | **`GET product/query?pid=`** and **`GET product/variant/query?pid=`**. |
| `getStockForSkus` | **`GET product/stock/queryByVid?vid=`**. |
| `CjSupplierHttpClient` | Optional diagnostics: set **`CJ_DIAGNOSTIC_LOGS=1`** to log UTC, URL, method, **redacted** headers, redacted request body preview, HTTP status, and **full response body** via `[cj-http-diagnostic]`. |
| `scripts/cj-api-smoke.ts` | Exercises **documented GET** paths; still attempts legacy POST for comparison. |
| `scripts/cj-api-diagnose-500.ts` | Side-by-side **wrong POST vs correct GET** with full response text; **`npm run cj-api:diagnose-500`**. |

Official references:

- [CJ API 2.0 overview](https://developers.cjdropshipping.com/en/api/api2/)
- [Development / success rules](https://developers.cjdropshipping.com/en/api/start/development.html)

---

## Short note for CJ support (English) — only if you still see 500 after using GET

Use this **only** if, after switching to **GET** as documented, you still receive **HTTP 500** with **no** `16900202` in the body or with an empty/non-JSON body.

> **Subject:** Open API 2.0 — persistent HTTP 500 on documented GET after successful `getAccessToken`  
> **UTC time:** [paste ISO timestamp, e.g. `2026-04-13T05:22:00.000Z`]  
> **Account/API key:** [masked last 4 only]  
> **Observation:** `POST https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken` with `apiKey` returns **200** and a valid `accessToken`.  
> **Failing request:** `GET https://developers.cjdropshipping.com/api2.0/v1/setting/get` (or paste exact URL) with header `CJ-Access-Token: <token>` (not attached here).  
> **HTTP status:** 500  
> **Response body (full):** [paste full JSON or raw text]  
> **Request ID:** [from `requestId` field if present]  
> Please confirm whether this is a platform incident, account restriction, or an undocumented contract change for this path.

---

## How to reproduce locally

```bash
cd backend
npm run cj-api:smoke
npm run cj-api:diagnose-500
```

Optional verbose client logs (do **not** enable in shared production logs without log policy review):

```bash
set CJ_DIAGNOSTIC_LOGS=1
```

---

## Closure criterion

- **Met:** At least one authenticated endpoint works with the documented contract (**GET `setting/get`**, **GET `product/listV2`**, **GET `product/query`**) and **`verifyAuth`** succeeds.  
- **Explained with evidence:** Prior **HTTP 500** on **POST** to GET-only routes was **client misuse**, corroborated by CJ’s JSON error **`16900202`** (“Request method 'POST' not supported”), not by missing `CJ-Access-Token` or a dead `getAccessToken` path.
