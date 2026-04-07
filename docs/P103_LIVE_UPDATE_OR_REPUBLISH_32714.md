# P103 — Live update or republish (32714)

## Operational paths

### A) Rebuild local pack + optional API picture replace

```bash
cd backend
npx tsx scripts/p103-hero-rebuild-32714.ts
npx tsx scripts/p103-hero-rebuild-32714.ts --try-replace-ml MLCxxxxxxxxxx
```

- Writes **`p103-rebuild-result.json`** at repo root (paths, trace, ML response if replace attempted).
- **`--try-replace-ml`** calls `MercadoLibreService.replaceListingPictures` with **`[cover_main.png, detail_mount_interface.png|jpg]`** in that order.

**Honesty constraints (P102 carryover):** if the item is **`under_review`** or ML blocks edits, picture replace may **409** or no-op at the API layer. Capture the **exact** error body in the JSON output.

### B) Controlled republish

After a successful P103 rebuild and `inspectMercadoLibreAssetPack.packApproved`, use **`p101-clean-republish-32714.ts`**, which now accepts **`p103`** in manifest `assetSource` and enforces **`evaluateMlPortadaStrictAndNaturalGateFromBuffer`** on disk before publish.

## Live state

**Not verifiable from this workspace:** Seller Center moderation outcome. After any API action, confirm in Seller Center whether the portada warning cleared or remains **under review**.
