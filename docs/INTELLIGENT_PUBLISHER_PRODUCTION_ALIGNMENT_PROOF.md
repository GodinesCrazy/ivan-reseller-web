# Intelligent Publisher — production alignment proof

## Local build proof (this branch)

After `npm run build` in `frontend/`:

- Lazy chunk name includes `IntelligentPublisher-*.js` (hash changes per build; example from one run: `dist/assets/IntelligentPublisher-B3Hfdjh5.js`).
- Search built chunk for strings: `No publicable (bloqueado)`, `fetchOperationsTruthForProductIds` / merged batching (in `operationsTruth.api-*.js`).

## Post-merge verification checklist (production)

1. Open `/publisher` as an authenticated user with pending rows.
2. Pick a row where the **Verdad operativa** panel shows `Blocker: missingSku` (or any `blockerCode`).
3. Confirm:
   - Primary control is **gray disabled** “No publicable (bloqueado)”, **not** blue “Aprobar y publicar”.
   - eBay / ML / Amazon checkboxes are **disabled** and **unchecked**.
   - Reject and Remove remain clickable (when not busy).
4. Pick a row **without** blocker: primary is blue approve; marketplaces start **unchecked** until the user selects them.
5. Filters: **Solo ML publicables**, **Solo bloqueados**, sort **Publicables primero + margen ML** still behave as before (logic unchanged except stricter guard).

## Vercel revision

Record the deployment **commit SHA** and Vercel **deployment ID** from the Vercel dashboard after `git push` triggers production. This document is filled at deploy time; CI/CD does not expose the ID from this workspace automatically.

## Prior “partial” deploy hypothesis

- **Stale lazy chunk** in CDN/browser cache for `IntelligentPublisher-*.js` while the shell bundle updated (Reject/Remove from a different chunk or inline section).
- **Visual confusion**: disabled + checked marketplace (fixed by clearing state when blocked).
