# Intelligent Publisher — marketplace default runtime fix

## Problem

Even with initial state `{ ebay: false, mercadolibre: false, amazon: false }`, a row could **display** eBay (or ML) as checked when:

1. The user toggled a marketplace before canonical truth marked the row blocked, or
2. Component state persisted across edge re-renders in a way that kept `marketplaces.ebay === true`.

Disabled checkboxes **still render** the checked state, which violates the documented “no default / not publishable” story for blocked rows.

## Fix

Inside `PendingProductCard` (`IntelligentPublisher.tsx`):

```ts
useEffect(() => {
  if (rowBlockedVisual) {
    setMarketplaces({ ebay: false, mercadolibre: false, amazon: false });
  }
}, [rowBlockedVisual, productId]);
```

- **Publishable** rows: user selections are preserved while the row stays publishable.
- **Blocked** rows: all marketplace toggles forced off → no misleading checked eBay on blocked rows.

## Unchanged

- No backend relaxation of publish gates.
- Approve handler still requires at least one marketplace when the row is publishable (`toast` if none).
