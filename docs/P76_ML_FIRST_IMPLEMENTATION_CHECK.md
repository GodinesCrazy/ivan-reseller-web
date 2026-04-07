# P76 — ML-first implementation check

## Lessons mapped into architecture

| Lesson (ML Chile portada) | P76 response |
|---------------------------|--------------|
| Policy-only survival insufficient | **Conversion gate** mandatory alongside policy |
| Weak “safe” covers | **Ranking** + **conversion fitness** + **remediation potential** ordering |
| Need traceability | **`CanonicalPipelineTrace`** + **`mlChileCanonicalPipeline`** metadata |
| Avoid one-off hacks | Single module **`marketplace-image-pipeline/`** + default **remediation entry** wiring |

## What changes immediately for new ML publications

- **Dual-gate evaluation** on **real candidates** before accepting raw order.
- **Remediation** only after **direct** attempts fail; recipes are **named** and **compatibility-checked**.
- **Fail closed** to **manual review** if no candidate + recipe satisfies both gates — **no** automatic fallback to simple square-fit in that scenario.

## What may remain manual

- **Inset crop** fractions (`productData.mlImagePipeline.insetCrop`) when inset recipe is needed.
- **Optional** third image (`usage_context_clean`) generation / approval.
- **Heuristic limits**: no OCR; borderline text/logo risk may still need human judgment.

## Readiness statement

The **strict ML Chile** path is **wired** through **`runMercadoLibreImageRemediationPipeline`** and therefore **publisher + pre-publish** checks. Readiness for a specific SKU is proven per-run via **`metadataPatch.mlChileCanonicalPipeline`** and remediation **`blockingReasons`**.
