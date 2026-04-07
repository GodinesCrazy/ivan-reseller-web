# P74 — Next decision

## Observed outcomes (automated)

1. **Selection-before-regeneration:** No direct pass; **remediation** applied on best candidate `s2eee0bfe…`.  
2. **Live replace:** **Succeeded**; listing **active**, `sub_status` cleared in API snapshot.  
3. **Picture IDs** changed (see `P74_LIVE_COVER_REPLACEMENT.md`).  
4. **ML upload warning** on cover: reported **`761×1200`** vs local **1536×1536** — monitor.

## Branch on seller UI (highest leverage)

### A — `warning_cleared` (operator confirms)

- **Decision:** Treat **photo blocker as resolved** for portada; continue normal commercial monitoring only.  
- **Optional:** Re-run `p50-monitor-ml-controlled-sale.ts` if part of operating playbook.

### B — `warning_persists_same_reason`

- **Decision:** Remediation **insufficient** for in-crop logos/text or ML still sees non-plain field.  
- **Next move:** Stronger **segmentation / background replacement** or **different supplier key** with cleaner product-only core; avoid blind rotation without new evidence.

### C — `warning_persists_new_reason`

- **Decision:** Adapt pipeline to **new** stated reason (e.g. resolution, authenticity).  
- **Next move:** If resolution: force export format/size ML accepts and re-upload; if authenticity: swap to supplier truth or ML-safe variant.

### D — `warning_moved_to_other_slot`

- **Decision:** Secondary image is now the blocker.  
- **Next move:** Run same **score → remediate** pattern for **slot 2** asset only (still listing-scoped).

### E — API / auth failure on next replace

- **Decision:** Refresh Mercado Libre OAuth / credentials, then re-run `p49` (no new product cycle).

## Single recommended immediate action

**Operator:** Perform **Fotos** recheck on **MLC3786354420** and record classification + exact warning text if any (`P74_SELLER_WARNING_RECHECK.md`).

## Technical follow-up if dimension warnings escalate

Investigate why ML reports **761×1200** for the new portada id despite a **1536×1536** local PNG; adjust export (e.g. JPEG min side 1200, explicit strip alpha, or full-bleed product scale) **only if** seller UI or API keeps flagging resolution.
