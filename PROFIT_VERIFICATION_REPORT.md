# PROFIT VERIFICATION REPORT

Verification that the system generates real, recordable profit (Sale.netProfit > 0 and valid status).

---

## Query (run against your DB)

```sql
SELECT
  id,
  price,
  cost,
  netProfit,
  status
FROM Sale
ORDER BY createdAt DESC
LIMIT 5;
```

Note: In this schema, Sale uses `salePrice`, `aliexpressCost`, `netProfit`, and `grossProfit` (no `price`/`cost` columns). Use your actual column names. Example with Prisma/actual schema:

```sql
SELECT
  id,
  "salePrice",
  "aliexpressCost",
  "netProfit",
  "grossProfit",
  status
FROM sales
ORDER BY "createdAt" DESC
LIMIT 5;
```

---

## Report fields (fill after running query)

**PROFIT_GENERATION_STATUS:** _CONFIRMED | FAILED | NO_DATA_  
**NET_PROFIT_VALUES:** _e.g. list of netProfit for last 5 sales_  
**REAL_PROFIT_CONFIRMED:** _YES | NO_

---

## Criteria

- **CONFIRMED**: At least one Sale with `netProfit > 0` and status indicating a completed/valid sale.  
- **NO_DATA**: No sales yet; run full cycle to generate.  
- **FAILED**: Sales exist but netProfit ? 0 or invalid status.

*Run the SQL above (adjusting for your DB and schema) and update this report with the results.*
