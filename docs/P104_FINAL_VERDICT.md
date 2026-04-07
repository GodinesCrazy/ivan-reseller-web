# P104 — Final verdict (32714)

## What was proven live

- **P103 was executed** against real Railway DB product **32714** with **7** real AliExpress URLs.
- **Every** candidate: **isolation OK**, **strict+natural (and thus full P103 gate stack) FAIL** — see `p103-rebuild-result.json` trials.
- **No new portada file** was written; **no ML picture replace** was performed with a P103 output (there was none).

## What was not proven

- **Seller Center** outcome for portada compliance (not available in this run).
- **Authenticated** Items API snapshot (anonymous `GET /items/MLC3805190796` returned **403** in this environment).

## Final product verdict (enum)

**`PRODUCT_32714_SOURCE_IMAGES_ARE_THE_BOTTLENECK`**

**Reason:** Under the **implemented** P103 pipeline (rank → isolate → white hero → strict+natural+hero+integrity), **none** of the seven supplier images yields a passing portada. The limiting factor is the combination of **source frames + segmentation output + current gate strictness**, not pricing, credentials, or script wiring.

## Single highest-leverage next move

Add **one** clean, human-shot or studio **supplement hero** URL via existing metadata hook `mlImagePipeline.canonicalSupplementUrls` (or replace primary supplier imagery), **then** re-run P103 — *or* temporarily relax **only** the reconstruction-specific natural silhouette threshold in a dedicated “post-isolation” profile if product policy allows (that would be a small targeted change, not a full redesign).
