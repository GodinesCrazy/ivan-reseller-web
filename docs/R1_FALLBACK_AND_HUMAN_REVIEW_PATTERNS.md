# R1 — Fallback and human review patterns

## Fail closed (feed / listing)

**Channable (explicit):** Image generation errors can cause the **feed run to fail**; errors visible in **Status** tab and email; **safety settings** adjust behavior.

**Inference:** Strong feeds prefer **blocking bad output** over silent corruption.

## Human + managed service

**Feedonomics (explicit):** “Full-service team” maintains channel specs and implements padding/processing — **human scale** inside vendor boundary.

## Alternate assets per channel

**Sellercloud (explicit):** If Amazon rejects lifestyle main, send **white-bg** as **channel-specific primary** while keeping lifestyle for **website** — **structural** fallback without AI.

## AI generation as fallback

**Helium 10 (marketing):** Generate images when **stock** assets weak — **creative** fallback.

**Risk:** **NOT** automatically compliant; needs **same validators** as supplier images.

## Amazon-side learning signals (marketplace, not vendor)

**Secondary sources (blogs)** describe **suppressed listings** and **Listing Quality** reports tied to **main image** defects.

**Use for Ivan:** implement **post-publish reconciliation** job: read marketplace **health / violations** → **enqueue remediation** or **human task**.

**NOT PROVEN:** That ChannelAdvisor automatically retrains on suppressions without vendor confirmation.

## Recommended fallback ladder (synthesized for implementers)

1. **Try next supplier image** (reorder candidates) — **cheap**.
2. **Mechanical remediation** (crop/pad/bg) per **policy recipe** — **medium cost**.
3. **Segmentation / inpaint API** — **higher cost** + **legal** check.
4. **Human review queue** — **unbounded** complexity.
5. **Block publish** for SKU — **better than** account-level risk.

## Unknown

- Exact **SLAs** and **queue UX** inside enterprise tools — not extracted in R1.
