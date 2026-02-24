# Assembled HTTP request for access token (Case 2) ? for AliExpress support

Per doc https://openservice.aliexpress.com/doc/doc.htm?nodeId=27493&docId=118729#/?docId=1385 (Case 2: System Interfaces).

## Request we send

**Method:** GET  
**URL:**  
`https://api-sg.aliexpress.com/rest/auth/token/create?app_key=524880&code={AUTHORIZATION_CODE}&timestamp={TIMESTAMP_MS}&sign_method=sha256&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback&sign={SIGNATURE}`

**Signature calculation:**

1. Params (ASCII order): `app_key`, `code`, `redirect_uri`, `sign_method`, `timestamp`.
2. Concatenation (no separators): `app_key{value}code{value}redirect_uri{value}sign_methodsha256timestamp{ms}`.
3. Signature base: `/rest/auth/token/create` + that string.
4. Sign: `hex(sha256(signature_base))` uppercase.

**Example (with placeholder code and current timestamp):**

- timestamp (ms): e.g. `1771282730765`
- Signature base: `/auth/token/create` + `app_key524880code{AUTH_CODE}redirect_urihttps://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callbacksign_methodsha256timestamp1771282730765`

We get **IncompleteSignature** with this request. Please confirm:

1. Should `redirect_uri` be included in the signature base or omitted (as in the doc sample)?
2. Path for signature must match endpoint: `/rest/auth/token/create`.
3. Any other required parameter or encoding (e.g. UTF-8)?

**App:** IvanReseller Affiliate API  
**App Key:** 524880
