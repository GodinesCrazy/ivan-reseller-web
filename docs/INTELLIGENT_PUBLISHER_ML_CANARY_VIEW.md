# Intelligent Publisher — ML canary candidate view

## Filters (`Vista canario ML`)

| Control | Effect |
|---------|--------|
| **Todos** | Full pending list (subject to sort). |
| **Solo ML publicables** | Rows that are **not blocked** and have **estimated Mercado Libre margin &gt; 0** (`estimatedProfitByMarketplace.mercadolibre`). |
| **Solo bloqueados** | Rows with a canonical block (cleanup / reject / remove). |

## Sort (`Orden`)

- **Publicables primero + margen ML** (`smart`): unblocked first, then higher ML estimated margin.
- **Margen ML (estim.)**: sort by ML margin; blocked rows sorted after when tied.
- **Margen fila (estim.)**: sort by row `estimatedProfit`.

Pagination applies to the **filtered/sorted** list.

## Finding one ML canary candidate

1. Choose **Solo ML publicables**.
2. Keep default **smart** order — top row is the strongest “truth-safe + ML-positive” candidate in the current data.
3. Use **Solo ML** on the row, then **Aprobar y publicar** only when blockers are clear.

## Limitations

- “ML publicables” depends on **publisher API** providing `estimatedProfitByMarketplace.mercadolibre`. If missing, use **Todos** + **smart** sort and rely on blocker panel.
- Estimated margin is **not** realized profit or listing proof.
