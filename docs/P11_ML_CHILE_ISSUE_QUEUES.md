# P11 ML Chile Issue Queues

Date: 2026-03-21

## Minimal Actionable Queues

### 1. Auth-blocked ML operations

Current truth:

- all scanned ML Chile candidates are effectively auth-blocked at marketplace runtime because the active production MercadoLibre credential row has no usable tokens

Fresh evidence:

- `authState = credential_row_present_but_tokens_missing`

### 2. Candidates missing `targetCountry = CL`

Current count from live readiness scan:

- `1000`

### 3. Candidates missing `shippingCost`

Current count from live readiness scan:

- `1000`

### 4. Candidates missing `importTax`

Current count from live readiness scan:

- `1000`

### 5. Candidates missing `totalCost`

Current count from live readiness scan:

- `1000`

### 6. Candidates missing stable AliExpress SKU

Current count from live readiness scan:

- `999`

### 7. Near-valid candidates waiting on one blocker

Broad readiness queue:

- none in the generic `1000`-row scan

Controlled destination-first batch:

- `10` low-risk candidates are effectively near-valid except for `missing_aliexpress_sku`

## Operational Use

These queues are now exposed through:

- `npm run check:ml-chile-controlled-operation -- 1`
- `npm run run:ml-chile-enrichment-batch -- 1 10`
- `npm run check:ml-chile-auth-runtime -- 1`
