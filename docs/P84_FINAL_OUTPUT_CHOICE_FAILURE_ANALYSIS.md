# P84 — Final-output choice failure analysis

## Source-image selection vs final-output selection

| Layer | What it optimizes | P76–P83 coverage |
|-------|-------------------|------------------|
| **Source / candidate** | Which supplier frame is easiest to remediate and scores well in preview simulation | Ranking, remediation fitness, P82/P83 simulation |
| **Final remediated buffer** | Which **actual** portada (after full `applyRecipe` + gates) is strongest commercially | **Was missing before P84** |

## Remaining blind spot (pre-P84)

After P83, the first **full** remediation attempt that satisfied Policy + Conversion + Hero + Integrity became the publishable cover. Two different `(candidateUrl, recipeId)` pairs could both pass gates, but the pipeline returned on the **first** pass in scan order. That is **first acceptable final wins**, not **best acceptable final wins**.

## Commercial weakness dimensions (not fully resolved by gates alone)

Multiple buffers can pass the same numeric thresholds yet differ on:

- **Visual dominance** — subject feels smaller or less “hero” on the canvas
- **Dead space** — excess empty field around the product
- **Readability** — product ink / presence in the buyer’s focal center
- **Click appeal** — energy, contrast, silhouette readability at glance
- **Silhouette** — thin, washy, or flat separation from background
- **Marketplace portada feel** — busy edges, washout, “catalog flatness”

Gates block the worst failures; **preference** ranks the survivors for commercial strength.
