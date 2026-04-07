# P14 AliExpress Chile Discovery Inventory

## Objective

Map the current AliExpress discovery surfaces and classify which ones are actually useful for feeding the strict MercadoLibre Chile funnel.

## Discovery Path Inventory

### 1. Affiliate searchProducts + getProductDetails with `shipToCountry = CL`

- Classification: `useful for Chile-first seeding`
- Why: this is the only existing path that can start from AliExpress search results already scoped to Chile and produce a supplier-first candidate pool before local product enrichment.

### 2. Preventive supplier audit alternative search

- Classification: `useful for Chile-first seeding`
- Why: it already combines Affiliate discovery with Dropshipping validation using `shipToCountry`, so it is the strongest pattern already present in the codebase.

### 3. Dropshipping `getProductInfo(productId, { localCountry: 'CL' })`

- Classification: `weak for Chile-first seeding`
- Why: it gives the strongest supplier truth for shipping and SKU admission, but only once a product ID already exists.

### 4. Local unpublished product catalog batch

- Classification: `generic only`
- Why: it is useful for re-validation, but not for Chile-first discovery because the current catalog was not born from Chile support evidence.

### 5. Generic low-risk title recycling from local products

- Classification: `dead end for Chile support`
- Why: P13 already proved this path repeatedly fails before enrichment with `no_destination_support_cl`.

## P14 Design Decision

The lead discovery surface for the ML Chile path must now be:

- Affiliate `searchProducts(... shipToCountry = CL ...)`
- followed immediately by Dropshipping `getProductInfo(... localCountry = 'CL')`
- followed by the Chile support gate
- followed by the CL-SKU gate

That is the only discovery chain currently strong enough to support Chile-first seeding without weakening truth.

## P14 Verdict

`CHILE DISCOVERY INVENTORY = DONE`
