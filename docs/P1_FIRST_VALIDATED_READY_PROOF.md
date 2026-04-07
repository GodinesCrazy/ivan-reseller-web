# P1 First VALIDATED_READY Proof

## Baseline before proof attempt

- Local DB status snapshot from `check-validated-ready.ts`:
  - `LEGACY_UNVERIFIED = 30351`
  - `PENDING = 3`
  - `REJECTED = 2`
  - `VALIDATED_READY = 0`

## Real proof attempt

- Ran:
  - `npx tsx backend/scripts/run-multi-region-validation.ts --userId=1 --marketplaces=ebay --queries="cell phone holder|usb light|cable organizer" --maxPriceUsd=20 --maxSearchResults=10 --minSupplierSearch=10`

## Result

- Validation did not reach candidate evaluation.
- Hard blocker:
  - `Falta token OAuth de eBay. Completa la autorización en Settings → API Settings → eBay.`

## Conclusion

- `VALIDATED_READY` remains `0`.
- P1 did not produce the first real validated-ready product in the local runtime.
- This is an evidence-backed block, not an assumption.
