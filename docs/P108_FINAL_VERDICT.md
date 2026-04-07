# P108 — Final verdict

## Engineering

- **Implemented** P108 advanced recovery (alpha feather / erode / dilate + feather) as **nested waves** over P107 multi-recipe compose.
- **Classification** extended: **`AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED`** after full wave exhaustion on the automatic (non–supplement-fail-closed) path.
- **Readiness model** and remediation manifest notes updated with **recovery** + **recipe** provenance.
- **Benchmark script** `p108-automatic-portada-benchmark-32714.ts` and artifact **`p108-benchmark-32714.json`**.

## Live apply

**Not performed** — no passing portada was generated.

## Final product verdict (32714)

**`PRODUCT_32714_AUTOMATIC_RECOVERY_LIMIT_REACHED`**

**Reason:** Supplier-only automation with **P107 + P108** still yields **no** gate-passing portada; classification **`AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED`** documents that the **current** autonomous recovery stack is **not sufficient** for this SKU’s imagery, without reverting to manual supplement heroes.

## Next engineering frontier (single direction)

**Stronger segmentation and/or generative studio fill** (or equivalent) for collage-heavy and dual-pane supplier shots — outside pure alpha post-processing.
