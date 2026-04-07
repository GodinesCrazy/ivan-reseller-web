# P103 — Tests and validation

## Commands run (backend)

```bash
cd backend
npm run type-check
npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts src/services/__tests__/ml-portada-visual-compliance.service.test.ts src/services/__tests__/ml-portada-source-ranking.service.test.ts src/services/__tests__/ml-portada-hero-reconstruction.service.test.ts
```

## What is covered

| Area | Test file |
|------|-----------|
| Strict portada gate (existing) | `ml-portada-visual-compliance.service.test.ts` |
| Natural gate — empty canvas fails | `ml-portada-visual-compliance.service.test.ts` |
| Source ranking order | `ml-portada-source-ranking.service.test.ts` |
| Isolation + 1200 compose | `ml-portada-hero-reconstruction.service.test.ts` |
| Remediation + inspect (gate mocked for pack fixtures) | `mercadolibre-image-remediation.service.test.ts` |

**Note:** Remediation tests **spy** `evaluateMlPortadaStrictAndNaturalGateFromBuffer` to return pass for synthetic white packs; **strict/natural behavior** is asserted in `ml-portada-visual-compliance` tests.

## Live validation (manual)

1. Run P103 script; confirm `p103-rebuild-result.json` has `p103AttemptOk: true`.
2. `inspectMercadoLibreAssetPack({ productId: 32714 })` → `packApproved: true`.
3. Seller Center — portada warning cleared on the **live** item.
