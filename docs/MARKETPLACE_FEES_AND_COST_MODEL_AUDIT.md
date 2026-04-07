# Marketplace Fees and Cost Model Audit

Date: 2026-03-20

## Executive conclusion

Current fee modeling is not strong enough to claim real international profit protection.

Status:
- MercadoLibre fee modeling: `PARTIAL`
- eBay fee modeling: `PARTIAL`
- Amazon fee modeling: `BROKEN`
- Publication-cost modeling overall: `BROKEN / PARTIAL`

## What exists today

### Marketplace fee intelligence service

The codebase now contains a marketplace fee intelligence service with targeted modeling for:
- MercadoLibre
- eBay

This is directionally correct.

### Problems in current implementation

- Coverage is narrow.
- Generic fee defaults still exist in broader cost calculator code.
- Some fee assumptions remain rough or simplified.
- Category sensitivity is weak.
- Publication-cost completeness is not enforced across all channels.

## Current modeled fees vs missing fees

| Marketplace | Site/country | Currency | Fee types modeled | Fee types missing | Business risk |
|---|---|---|---|---|---|
| MercadoLibre | Chile | CLP with rough USD normalization | commission %, simplified fixed CLP cost, partial payment handling assumptions | robust payment fee handling, promoted ads, tax/VAT, returns/refunds, FX, full publication cost matrix | High |
| eBay | US | USD | insertion fee, final value fee, per-order fixed fee | promoted listings, store subscription allocation, FX, return/refund assumptions, category/site variations | High |
| eBay | ES/DE/FR/IT and other non-US sites | Often incorrectly normalized | partial generic logic only | correct site fee schedules, correct currency handling, payment/FX/returns | Critical |
| Amazon | Any | varies | generic defaults in broad cost calculator only | real marketplace-specific fee engine, referral fee tables, FBA/FBM distinctions if relevant, FX, taxes, returns | Critical |

## Specific weaknesses

### 1. Generic fee fallbacks still exist

Broader cost calculator code still contains defaults such as:
- eBay fee 12.5%
- Amazon fee 15%
- MercadoLibre fee 11%
- payment fee 2.9%

That is not acceptable as a final cross-border profit engine.

### 2. Shipping fallback legacy risk

Even after preventive hardening, some broader cost paths still reference default shipping fallback behavior.  
That creates a risk of:
- fake margin
- publication based on estimated shipping instead of supplier reality

### 3. CLP normalization is too rough

The current model includes a simplified CLP fixed-cost to USD normalization approach.  
That may be acceptable temporarily for internal approximation, but not for superiority claims.

### 4. FX is not a first-class audited concept

The system is not yet consistently storing or exposing:
- FX source
- FX timestamp
- conversion fee
- normalized audit currency

### 5. Taxes and returns are under-modeled

The current model does not provide strong coverage for:
- VAT/tax effects by marketplace/country
- refund/return cost assumptions
- dispute/chargeback-related cost scenarios

## Why this matters competitively

Competitors often have weaker truthfulness but broader fee and supplier coverage.  
Ivan Reseller is trying to become safer than them, but it cannot claim that while its fee model still has generic gaps.

## Minimum fix standard before controlled sale

Every publish decision must be backed by a per-listing fee ledger:

- supplier cost
- shipping cost
- marketplace commission
- marketplace fixed fee
- payment fee
- publication fee
- FX cost
- tax assumption
- expected net profit
- expected margin
- completeness score

If completeness is below threshold, publish must be blocked.

## Audit verdict

The system has begun to move from simplistic global margins toward real fee-aware profitability.  
That shift is real and important.

But the current implementation is still too incomplete for:
- safe scaling
- international selling confidence
- competitive superiority claims
- autonomous profit protection
