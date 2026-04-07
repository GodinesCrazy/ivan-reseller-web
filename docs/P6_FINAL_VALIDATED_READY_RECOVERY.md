## P6 Final Validated Ready Recovery

### P6 Batch
Context:

- marketplace: `eBay`
- country: `US`
- language: `English`
- currency: `USD`
- max price: `20 USD`
- queries:
  - `adhesive cable clips`
  - `silicone cable ties`
  - `webcam cover`
  - `screen cleaning cloth`
  - `adhesive wall hook`

### Real Result
- scanned: `25`
- rejected: `25`
- near-valid: `0`
- validated: `0`
- `VALIDATED_READY = 0`

### Rejection Summary By Code
- `no_stock_for_destination = 17`
- `margin_invalid = 7`
- `supplier_unavailable = 1`

### Combined Controlled Evidence
Across P4 + P5 + P6 eBay US recovery attempts:

- scanned: `65`
- rejected: `65`
- validated: `0`
- combined rejection summary:
  - `no_stock_for_destination = 40`
  - `margin_invalid = 20`
  - `supplier_unavailable = 5`

### Best Failed Candidate
There was no near-valid candidate in P6.

The closest commercially attractive failures were the low-cost commodity items, for example:

- `webcam cover` at `1.41 USD`
- `screen cleaning cloth` at `1.60 USD`

Both still failed on the hard supplier gate:

- `no AliExpress SKU with stock > 0 for this destination`

### Strategic Interpretation
P6 materially improved candidate quality.
The result still remained `0 validated`.

That means the main constraint is not weak filtering anymore. It is the current supplier reality for eBay US under strict safe-publication rules.
