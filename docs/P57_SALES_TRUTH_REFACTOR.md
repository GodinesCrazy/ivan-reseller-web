# P57 — Sales Truth Refactor

Date: 2026-03-24  
Sprint: P57 — Secondary truth surfaces convergence

## Objective

Refactor `Sales.tsx` so sales analytics do not imply commercial proof. Clearly distinguish:
- Sales recorded
- Payout/released funds confirmed
- Realized profit confirmed
- Estimates/aggregates/projections

## Completed Changes

### 1. Proof Ladder First

- **Moved** `PostSaleProofLadderPanel` from Overview tab to main page, above stats cards.
- **Effect:** Proof ladder dominates; operators see proof counts before aggregates.

### 2. Header Copy

- **Before:** "Ventas de productos publicados en marketplaces"
- **After:** "Ventas registradas. La ganancia realizada requiere proof de fondos liberados (proof ladder) — ver Control Center y Finance."
- **Added:** Link to Control Center.

### 3. Stats Cards Labels

| Card | Before | After |
|------|--------|-------|
| Ingresos totales | Ingresos totales ({period}) | Ingresos totales (agregado, {period}) |
| Margen neto | Margen neto registrado | Margen neto (agregado, {period}) |
| Margen disclaimer | "No equivale a ganancia realizada hasta prueba de fondos liberados" | "No es ganancia realizada hasta proof de fondos liberados en proof ladder" |

### 4. Stats Intro

- **Added:** "Las tarjetas inferiores son agregados del período — no sustituyen proof de fondos liberados ni ganancia realizada."

### 5. Chart Legend

- **Before:** `name="Profit"`
- **After:** `name="Profit (agregado)"`

### 6. Sales Table Column

- **Before:** `Profit`
- **After:** `Profit (registrado)` with `title` tooltip: "Margen registrado — ganancia realizada requiere proof de payout"

### 7. Modal "Composición financiera"

- **Before:** "Composición financiera" / "Ganancia neta" in green.
- **After:** "Composición financiera (registrada)" with subtitle "Margen inferido del ledger — la ganancia realizada requiere proof de payout en Finance." "Ganancia neta" relabeled "Ganancia neta (registrada)" in neutral color; added "No equivale a realized profit sin proof de fondos liberados."

## Ambiguities Removed

| Before | After |
|--------|-------|
| Margen neto could read as realized profit | Margen neto (agregado) + explicit disclaimer |
| Chart "Profit" suggested realized profit | Profit (agregado) in legend |
| Table "Profit" column ambiguous | Profit (registrado) + tooltip |
| Modal "Ganancia neta" in green implied success | Ganancia neta (registrada) + proof disclaimer |
| Proof ladder buried in Overview tab | Proof ladder above stats |

## Verification

- Sales separates recorded/aggregate from proof-backed profit states.
- Proof ladder is visible first.
- No estimate-as-proof or simulated-success language remains.
