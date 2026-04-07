# P12 ML Chile Issue Queues Refined

## Objective
Refine the issue queues so the next sprint can attack a smaller and more truthful blocker set.

## Refined queues after P12

### 1. `auth_blocked_ml`
Meaning:
- the active MercadoLibre Chile credential row exists but runtime auth is not usable

Fresh proof:
- `authState = credential_row_present_but_tokens_missing`
- `hasAccessToken = false`
- `hasRefreshToken = false`

### 2. `no_cl_sku`
Meaning:
- no AliExpress SKU for destination `CL` exists at pre-admission time

Fresh live count in the clean batch:
- `0`

### 3. `cl_sku_no_stock`
Meaning:
- a Chile-valid SKU exists but has no stock

Fresh live count in the clean batch:
- `0`

### 4. `no_destination_support_cl`
Meaning:
- supplier truth does not expose destination `CL` shipping support

Fresh live count in the clean batch:
- `9`

### 5. `supplier_data_incomplete`
Meaning:
- supplier response does not include enough normalized shipping or SKU truth to classify safely

Fresh live count in the clean batch:
- `1`

### 6. `missing_target_country_cl`
Meaning:
- the product is not persisted with `targetCountry = CL`

Fresh broad readiness count:
- `1000`

### 7. `missing_shipping_cost`
Fresh broad readiness count:
- `1000`

### 8. `missing_import_tax`
Fresh broad readiness count:
- `1000`

### 9. `missing_total_cost`
Fresh broad readiness count:
- `1000`

### 10. `missing_stable_aliexpress_sku`
Fresh broad readiness count:
- `999`

### 11. `near_valid_waiting_on_one_blocker`
Fresh live count after the clean gate:
- `0`

## Operational meaning
The next ML Chile sprint should not spend time enriching generic low-risk candidates anymore. The current live blocker set is now narrow and explicit:
1. restore real MercadoLibre runtime tokens
2. source candidate pools that already expose Chile destination support at supplier level
