# P104 — Tests and validation

## Commands run

```bash
cd backend
npm run type-check
```

**Result:** **PASS** (`tsc --noEmit`).

## Execution-only scripts (P104)

| Script | Purpose |
|--------|---------|
| `npx tsx scripts/p103-hero-rebuild-32714.ts` | Live P103 rebuild for 32714 |
| `npx tsx scripts/p104-persistence-snapshot-32714.ts` | DB + pack persistence JSON |

No additional Jest suites were required for P104; P103 unit tests were unchanged this run.

## Artifacts written this session

- `p103-rebuild-result.json`
- `p104-persistence-32714.json`
- `p104-ml-item-MLC3805190796.json` (403 error body from anonymous Items API)
