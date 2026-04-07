# P107 — Final verdict

## Engineering outcome

- **Automatic multi-recipe normalization** is implemented as the **default** P103 portada rebuild path (`multiRecipe` default **true**).
- **Remediation** persists a compact **`portadaAutomation`** block for mass-publish analytics.
- **Product 32714** benchmark with **supplier images only** completed; output **`IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE`**.

## Live apply

**Not executed** — automation did not produce a compliant portada, so no ML picture replace/republish was triggered for P107.

## Seller Center

**Not re-validated** in this sprint (no new compliant asset from automation).

## Final product verdict (32714, automation-only)

**`PRODUCT_32714_IMAGE_SOURCE_INSUFFICIENT_AUTOMATICALLY_CONFIRMED`**

**Reason:** After **multi-recipe** reconstruction across ranked supplier sources, **no** variant passed the full automatic gate stack. The limiting factor remains **automatically recoverable signal in the AliExpress frames + current isolation/gates**, not pricing or credentials.

## Strategic note

The platform goal is **scalable** automatic compliance. P107 advances that by **searching a recipe space** per source and **classifying** failures. Further gains (next moves) are **new isolation/reconstruction strategies** (e.g. alpha feather, different segmenters, generative infill) — **not** requiring operators to supply heroes for every SKU.
