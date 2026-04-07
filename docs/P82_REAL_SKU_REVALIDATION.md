# P82 — Real SKU re-validation (32690)

## Commands

```bash
cd backend
npx tsx scripts/check-ml-image-remediation.ts 32690
```

## Case A — direct pass (simulation not applicable)

With on-disk `cover_main.png` present and direct gates passing, the remediation branch does not run:

- `remediationSimulationRows: 0`
- `traceFinalOutcome: direct_pass`

Captured: `p82_32690_check.json` (2026-03-25 run).

## Case B — forced remediation (simulation active)

To exercise remediation + P82, `cover_main.png` was **temporarily removed** so the canonical path could not use the local pack as a direct winner. After capture, `cover_main.png` was **restored** from a timestamped backup under the same product folder.

Captured: `p82_32690_forced.json`.

### Outcomes

| Field | Value |
|-------|--------|
| `traceFinalOutcome` | `remediated_pass` |
| `winningRecipeId` | `inset_white_catalog_png` |
| `winningRemediationCandidateUrl` | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` |
| `remediationSimulationRows` | `10` (5 candidates × 2 recipes) |
| `remediationSimulationAllWeak` | `false` |

### Simulation winner (preview)

`remediationSimulationWinner`:

- `objectKey`: `sd8adf1f1f796411e96d94f9f8c6d45440`
- `recipeId`: `inset_white_catalog_png`
- `simScore`: `1388730`
- `simAllCorePass`: `true`

### Ordering vs P81

P81 heuristic order tried `s2eee0…` first. P82 simulation rank (from trace steps):

`sd8adf… > sd63839… > sc2ae6… > seebee… > s2eee0…`

So the candidate with the **strongest preview portada** (`sd8adf…` + inset) is attempted **before** weaker preview outcomes — matching the mission intent.

## Comparison to P81

P81: remediation order = `remediationFitness` only.  
P82: shortlist re-ordered by **simulated post-remediation** gate signals + `simScore`, then remainder unchanged.
