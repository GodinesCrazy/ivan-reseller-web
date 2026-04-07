## P52 - Post-sale Proof Ladder

### Implemented first truthful proof ladder

New reusable panel:

- `frontend/src/components/PostSaleProofLadderPanel.tsx`

Consumed in:

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Sales.tsx`

### Ladder states now surfaced

- `orderIngested`
- `supplierPurchaseProved`
- `trackingAttached`
- `deliveredTruthObtained`
- `releasedFundsObtained`
- `realizedProfitObtained`

### Truth rule now visible in UI

Missing proof is no longer silently upgraded.

The UI now explicitly shows:

- proof present
- missing / pending proof

### Current business meaning

This is the first canonical commercial-proof surface in the frontend.

It does not claim:

- released funds
- realized profit

unless those backend truth flags are actually present.
