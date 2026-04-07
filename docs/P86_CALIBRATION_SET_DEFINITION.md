# P86 — Calibration set definition

## Labeling protocol

| Label | Definition |
|-------|------------|
| **Good** | Operator would ship this as the main MercadoLibre portada without new creative work. |
| **Borderline** | Technically acceptable but would hesitate or want tweaks before shipping. |
| **Weak** | Should not go live as main image without stronger source art or different remediation. |

## Minimum sample size and spread

- **Starter (this sprint):** 2 rows with **Good** vs **Weak** from the same real finalist set (SKU 32690), to separate relative ranks from absolute quality.
- **Target:** 20–40 SKUs (per `docs/P85_HUMAN_RATED_CALIBRATION_STARTER_SET.md`) with mix of recipes (square JPEG vs inset PNG), busy vs clean suppliers, and **Borderline** labels to tune margins.

## Evidence fields to collect (per sample)

From `CanonicalPipelineTrace` after remediation (or from saved JSON):

| Field | Use |
|-------|-----|
| `finalCoverPreferenceFinalists[].finalCoverQuality` | All floor metrics except subject (readability, silhouette, dead space, center, washout). |
| `finalCoverPreferenceFinalists[].heroMetrics` | `subjectAreaRatio` (and width/height for context). |
| `finalCoverPreferenceFinalists[].preferenceScore` | Composite preference floor. |
| `commercialFinalistFloorPass` / `commercialFinalistFloorFailureReasons` | Outcome vs current thresholds. |
| `finalCoverPreferenceWinner` / `finalCoverProvisionalWinner` | Which row was evaluated as winner. |
| SKU / `productId`, `recipeId`, `candidateUrl` | Audit identity. |

## Artifact

Structured starter rows: `artifacts/ml-calibration/p86_starter_labeled_traces.json`.
