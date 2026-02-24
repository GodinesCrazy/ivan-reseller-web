# Technical Support Ticket ? AliExpress Open Platform

**Subject:** IncompleteSignature on OAuth token exchange ? GET /rest/auth/token/create

**Environment:** Production (api-sg.aliexpress.com)

---

## 1. Issue summary

We are integrating with AliExpress Open Platform (OAuth 2.0) and successfully obtain an authorization code from the authorize endpoint. When we call the token endpoint to exchange the code for an access token, the API consistently returns **IncompleteSignature** with the message: *"The request signature does not conform to platform standards"*.

We need official confirmation of the exact signature algorithm and parameters required for this endpoint so we can align our implementation.

---

## 2. Error and request details

**Endpoint (GET):**  
`https://api-sg.aliexpress.com/rest/auth/token/create`

**Error returned:**
- **Code:** IncompleteSignature  
- **Message:** The request signature does not conform to platform standards  
- **Request ID:** 214125d717712899323201392  

**Example token request URL that was rejected (actual production request):**
```
https://api-sg.aliexpress.com/rest/auth/token/create?app_key=524880&code=test&sign_method=sha256&timestamp=1771289931678&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback&sign=6544FFB3E1D16F2406544EE7884E5701864D6EB259D4DC40966717F4AADFDC96
```

(We have also tried including the parameter `method=auth.token.create` in the query string; the same IncompleteSignature error occurs.)

---

## 3. Current technical implementation

- **Authorization code:** Obtained correctly via:
  `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id={app_key}&redirect_uri={redirect_uri}`

- **Token exchange:** Single GET request to `https://api-sg.aliexpress.com/rest/auth/token/create` with all parameters in the query string.

- **Parameters we send (query string):**
  - `app_key`
  - `code`
  - `sign_method=sha256`
  - `timestamp` (Unix milliseconds)
  - `redirect_uri` (URL-encoded)
  - `sign`

  We have also tested including:
  - `method=auth.token.create`

- **Signature implementation (current):**
  - **API path used in signature base string:** `/rest/auth/token/create`
  - **Formula:**  
    `sign = UPPERCASE( HEX( SHA256( appSecret + apiPath + sortedKeyValueString + appSecret ) ) )`
  - **sortedKeyValueString:** All parameters (except `sign`) sorted alphabetically by key, concatenated as `key1 + value1 + key2 + value2 + ...` (no separators).
  - **Character encoding:** UTF-8 for the string to sign.
  - **Hash output:** SHA-256, then hexadecimal, then converted to uppercase.

- **Request:** GET with query string only; no request body.

- **Environment:** Production, `api-sg.aliexpress.com`.

---

## 4. Specific questions (official confirmation requested)

We would be grateful if you could confirm the following points for **GET /rest/auth/token/create**:

1. **Exact signature formula**  
   What is the exact string that must be signed and the exact steps (order of concatenation, use of `app_secret`, algorithm, and output format) for the `sign` parameter? For example:
   - Should the string to sign be `app_secret + api_path + sorted_params + app_secret`, or another combination?
   - Is the correct hash algorithm SHA-256, and must the result be hexadecimal in uppercase?

2. **Correct API path for the signature**  
   For building the signature base string, should we use:
   - `/rest/auth/token/create`, or  
   - `/auth/token/create`?  

   Please specify the exact path string (including or excluding the leading slash and the `/rest` prefix) that must be used.

3. **redirect_uri in the signature**  
   Must `redirect_uri` be included in the set of parameters that are used to build the signature base string? If yes, should it be the raw URL or the URL-encoded value in the signature base?

4. **method parameter**  
   For this token endpoint, should the parameter `method=auth.token.create` (or equivalent) be sent in the request and, if so, must it be included in the signature base string?

5. **Official example**  
   If possible, please provide an official example (or a link to the exact documentation) showing the complete step-by-step generation of the signature for a single token exchange request, including:
   - The exact string that is hashed (with placeholder values for app_secret, app_key, code, timestamp, redirect_uri, etc.), and  
   - The final `sign` value format (e.g. uppercase hex).

---

## 5. Request ID for your reference

**Request ID:** 214125d717712899323201392  

We can provide additional request IDs or full request/response samples if needed.

Thank you for your assistance.
