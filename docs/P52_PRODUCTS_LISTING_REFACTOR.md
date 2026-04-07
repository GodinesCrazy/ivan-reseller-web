## P52 - Products / Listing Refactor

### Refactor scope

Updated:

- `frontend/src/pages/Products.tsx`
- `backend/src/api/routes/products.routes.ts`

### What changed

1. Product estimated margin is now explicit
- backend emits `estimatedUnitMargin`
- UI shows `Margen unitario estimado`

2. Product and listing truth are now more clearly separated
- Products page fetches canonical operations truth for visible product IDs
- each row now shows:
  - live marketplace state
  - marketplace sub-status
  - blocker code
  - next action

3. Product modal now exposes canonical operational truth
- live marketplace state
- current blocker
- proof ladder booleans
- latest agent decision

### First visible operational separation achieved

The Products surface now distinguishes:

- validation/publication safety state
- live marketplace state
- blocker state
- proof-ladder state
- agent trace

### Exact UI corrections

- table column `Beneficio` -> `Margen estimado`
- page summary `Beneficio pagina` -> `Margen unitario estimado (página)`
- modal `Beneficio estimado` -> `Margen unitario estimado`
