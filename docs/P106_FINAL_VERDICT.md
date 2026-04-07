# P106 — Final verdict (32714)

## What was delivered in code

- **`p106-real-supplement-hero-live-32714.ts`:** mandatory **`--url`** (HTTPS) or **`--workspace-path`**; source probe before persist; **`coverMainSha256`** on success; manifest **`p106_real_supplement_hero`**; **`p106-live-result.json`** proof file.
- **`p101-clean-republish-32714.ts`:** **`p106`** added to approved **`cover_main`** source marks for controlled republish.

## What was executed

A **single** invocation **without** `--url` or `--workspace-path`, to prove **fail-fast** behavior and satisfy the mission rule: *if no valid source is supplied, fail immediately with an exact required input message*.

## Final product verdict (enum)

**`PRODUCT_32714_REAL_SUPPLEMENT_HERO_MISSING`**

**Reason:** No real high-quality supplement hero (HTTPS URL or workspace image path) was supplied to this run, so persistence, rebuild, live ML apply, and Seller Center checks could not proceed.

## Single highest-leverage next move

Supply **one** clean same-product hero and run (no `--dry-run` unless testing):

```text
npx tsx scripts/p106-real-supplement-hero-live-32714.ts --url https://... --try-replace-ml MLC3805190796
```

Then validate **Seller Center** and reconcile DB.
