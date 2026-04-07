# P55 — OrderDetail P0 Fix

## Goal

Remove simulated / unverifiable “success” framing from the primary order surface.

## Changes

- Added `frontend/src/utils/simulated-order-id.ts` aligned with backend `SIMULATED_ORDER_IDS` / `isSimulatedOrderId` semantics (stub AliExpress IDs and obvious test patterns).
- **Green “compra cumplida” banner** only when:
  - `status === 'PURCHASED'` **and**
  - **Verified supplier proof:** non-simulated `aliexpressOrderId`, **or** `manualPurchaseDate` (manual mark path).
- **New explicit banners:**
  - `status === 'SIMULATED'`: violet informational banner — not operational proof.
  - `PURCHASED` without verifiable supplier ID: amber “fail-closed” explanation (includes simulated ID case).
- `OrderStatusBadge`: added distinct styling for `SIMULATED`.

## Files

- `frontend/src/pages/OrderDetail.tsx`
- `frontend/src/components/OrderStatusBadge.tsx`
- `frontend/src/utils/simulated-order-id.ts`
- `frontend/src/utils/simulated-order-id.test.ts`
