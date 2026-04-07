# P85 — Real SKU re-validation (32690)

## Reference metrics (P84 forced run, provisional winner)

From `p84_32690_forced_raw.txt`, winning finalist:

- `readabilityEstimate`: **65.67** (floor default ≥ 55) ✓  
- `silhouetteStrength`: **62.02** (≥ 50) ✓  
- `deadSpaceRatio`: **0.2961** (≤ 0.52) ✓  
- `centerSignalRatio`: **0.5696** (≥ 0.22) ✓  
- `washoutIndex`: **0.3** (≤ 0.52) ✓  
- `subjectAreaRatio` (hero): **0.7039** (≥ 0.42) ✓  
- `preferenceScore`: **128938.67** (≥ 85000) ✓  

**Conclusion:** Under default P85 thresholds, this SKU’s **provisional winner is publish-worthy on the absolute bar** — expected `commercialFinalistFloorPass: true` and `remediated_pass` when remediation runs.

## Runner-up from same run (would fail if it were sole winner)

Second finalist (`Sd63839…`): readability **49.26**, center **0.1113**, preference **54439** — fails multiple floor checks. P84 alone could not reject it if it were the **only** passing final; P85 would fail it closed.

## Commands

```bash
cd backend
# With on-disk cover: usually direct_pass (floor not in remediation path)
npx tsx scripts/check-ml-image-remediation.ts 32690

# To exercise remediation + floor: temporarily remove/rename pack cover_main.png, run, restore.
```

## Normal operation today

With approved local cover present, canonical **`direct_pass`** — P85 floor applies only on **remediated** outcomes, not direct pass.
