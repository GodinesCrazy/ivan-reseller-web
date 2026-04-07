# P106 — Persistence reconciliation (32714)

## This run

- **Product 32714 `productData`:** **not** updated (script exited before database access).
- **`marketplace_listings`:** unchanged by P106.

## After a successful live apply

1. Re-run persistence snapshot (e.g. **`p104-persistence-snapshot-32714.ts`**) or query Prisma for product **32714** and latest ML row.
2. Reconcile **`failed_publish` / `isPublished`** only once **Seller Center** and ML responses agree on the live state.

## Reference snapshot

Prior state is described in **`p104-persistence-32714.json`** / **`docs/P105_PERSISTENCE_RECONCILIATION_32714.md`**.
