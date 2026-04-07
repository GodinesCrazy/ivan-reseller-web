# P27 Live Freight Retest

## Commands executed on 2026-03-22
```bash
cd backend
npm run type-check
npm run forensic:ml-chile-freight-quotes -- 1 10
npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1
```

## Exact command outputs
### `npm run type-check`
```text
> ivan-reseller-backend@1.0.0 type-check
> tsc --noEmit
```

### Parsed output from `npm run forensic:ml-chile-freight-quotes -- 1 10`
```json
{
  "endpointReached": true,
  "sampleSize": 10,
  "admittedAfterChileSupportGate": 10,
  "admittedAfterClSkuGate": 10,
  "admittedAfterFreightGate": 9,
  "nearValid": 9,
  "validated": 0,
  "freightSummaryByCode": {
    "freight_quote_found_for_cl": 9,
    "freight_quote_missing_for_cl": 1
  },
  "chosenStrategy": {
    "strategy": "dropshipping_native",
    "appFamily": "dropshipping",
    "tokenFamily": "dropshipping_session",
    "credentialSource": "credentials_manager:aliexpress-dropshipping",
    "tokenSource": "credentials_manager:aliexpress-dropshipping:accessToken"
  },
  "bestCandidateResult": {
    "productId": "1005009939469312",
    "skuId": "12000050631100664",
    "selectedServiceName": "CAINIAO_STANDARD",
    "selectedFreightAmount": 0,
    "selectedFreightCurrency": "USD"
  }
}
```

### Parsed output from `npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1`
```json
{
  "affiliate": {
    "appKeyPrefix": "524880...",
    "scope": "user",
    "entryId": 351
  },
  "dropshipping": {
    "appKeyPrefix": "522578...",
    "scope": "user",
    "entryId": 5935,
    "secretConsistency": "secret_suspect",
    "envAppSecretFingerprint": "45ef233f777a"
  },
  "freightAppFamily": "dropshipping",
  "freightTokenFamily": "dropshipping_session"
}
```

## Exact AliExpress errors still observed
- Wrong app family with dropshipping token:
  - `IllegalAccessToken`
- Legacy eco router:
  - `Invalid app Key (Code: 29, sub_code: isv.appkey-not-exists)`
- One remaining product without usable freight quote:
  - sync route returned `success + error_desc` with `freightOptionsCount: 0`
  - legacy probes for that row still showed `ETIMEDOUT` and `Invalid app Key`

## Retest conclusion
- The freight gate changed from blocked to materially open.
- `admittedAfterFreightGate` is now `9`, not `0`.
- Real AliExpress freight truth was obtained without fabrication.
