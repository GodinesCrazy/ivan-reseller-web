# P69 — Buyer PDP verification

## Paths exercised

### 1. Unauthenticated HTTP fetch (generic client)

Fetching the public permalink returned an **account / cookie interstitial** (“Para continuar, ingresa…”) rather than product HTML — **not** a reliable PDP stability signal for automation.

### 2. `p50-monitor-ml-controlled-sale` public probe (2026-03-25 run)

From script output for this listing:

| Signal | Value |
|--------|--------|
| `permalinkHeadStatus` | **403** |
| `permalinkPublicProbe.getStatus` | **200** |
| `permalinkPublicProbe.challengeShellDetected` | **`true`** |
| `permalinkPublicProbe.publicSurfaceClassification` | **`ambiguous`** |
| `liveItem` (API) | **`active`**, new picture IDs present |

## Classification

**`unknown_due_challenge_shell`** — automation cannot distinguish a healthy buyer PDP from Mercado Libre **anti-bot / login / cookie** surfaces using these probes alone.

This is **separate** from seller-side photo-review truth: a challenge shell **does not** imply the listing is broken for logged-in humans.

## Minimum human verification

- Open the **permalink** in a normal browser (prefer incognito + Chile context).
- Confirm: gallery loads, title/price visible, no hard error page.
- If ML forces login, note whether that is **expected** for that network/geo (still record outcome).
