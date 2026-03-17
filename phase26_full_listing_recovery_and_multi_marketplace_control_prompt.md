# Ivan Reseller Web — Full Listing Recovery + Multi-Marketplace Lifecycle Control

The system is currently in production but contains a large number of inconsistent, inactive, rejected and low-quality listings across marketplaces.

This is critical.

The system must NOT only improve new listings but also FIX and CLEAN all existing listings.

---

# CRITICAL OBJECTIVES

1. Synchronize system with REAL marketplace state
2. Repair ALL existing listings
3. Remove invalid or harmful listings
4. Maintain only high-quality listings
5. Control costs and profitability
6. Ensure real marketplace performance
7. Operate across ALL marketplaces (MercadoLibre, eBay, Amazon)

---

# TASK 1 — FULL LISTING AUDIT (EXISTING DATA)

Create:

FullListingAuditService

Scan ALL existing listings from:

database
MercadoLibre API
eBay API
Amazon API

For each listing collect:

status
errors
impressions
clicks
sales
policy issues
missing attributes
missing images/videos
category correctness

---

# TASK 2 — LISTING CLASSIFICATION ENGINE

Classify each listing into:

GOOD
NEEDS_OPTIMIZATION
BROKEN
REJECTED
INACTIVE
LOW_PERFORMANCE
NOT_EXISTING

---

# TASK 3 — LISTING RECOVERY ENGINE

Create:

ListingRecoveryEngine

For each listing:

---

## If NEEDS_OPTIMIZATION

Improve:

title SEO
attributes
description
price competitiveness
category mapping

---

## If BROKEN or PENDING_FIX

Fix automatically:

missing attributes
invalid category
shipping config
images/videos
policy issues

Then REPUBLISH

---

## If INACTIVE

Attempt reactivation:

fix issues
update listing
republish

---

## If REJECTED

Retry with improved data

If fails multiple times:

mark for removal

---

## If LOW_PERFORMANCE

If:

no impressions OR no clicks OR no sales

THEN:

optimize OR remove

---

## If NOT_EXISTING

Remove from database

---

# TASK 4 — MASS CLEANUP SYSTEM

If listing:

has zero impressions for long period
has zero sales
fails multiple corrections
violates marketplace policies

THEN:

DELETE listing
remove from DB
free capacity

---

# TASK 5 — MARKETPLACE-SPECIFIC FIXES

---

## MercadoLibre

Fix:

pending corrections
missing clips
policy violations
category mismatch
shipping settings

---

## eBay

Fix:

ended listings
item specifics
pricing competitiveness
category mapping

---

## Amazon

Fix:

suppressed listings
compliance issues
missing attributes
price violations

---

# TASK 6 — CONTINUOUS REALITY SYNC

Run sync every few hours:

update listing statuses
detect changes
apply corrections

---

# TASK 7 — COST & PROFIT CONTROL

Calculate per listing:

supplier cost
shipping cost
marketplace fee

If:

profit < MIN_ALLOWED_MARGIN

THEN:

DO NOT publish
OR remove listing

---

# TASK 8 — PUBLICATION QUALITY FILTER

Before publishing:

validate:

SEO title
attributes
category
price competitiveness
images quality

Reject weak listings.

---

# TASK 9 — MULTI-MARKETPLACE VOLUME OPTIMIZATION

Control number of listings:

reduce if many failures
increase if profitable
balance marketplaces dynamically

---

# TASK 10 — REAL METRICS ONLY

Use ONLY real data from:

MercadoLibre API
eBay API
Amazon API

No simulated data allowed.

---

# TASK 11 — DASHBOARD CORRECTION

Dashboard must reflect:

real listings
real statuses
real performance
real profit

---

# TASK 12 — LISTING LIFECYCLE CONTROL

Each listing must go through:

CREATE
VALIDATE
PUBLISH
SYNC
MONITOR
OPTIMIZE
SCALE
OR REMOVE

---

# TASK 13 — AUTOMATED MAINTENANCE SYSTEM

System must:

continuously monitor listings
auto-fix errors
auto-remove bad listings
auto-optimize active listings

---

# TASK 14 — FINAL SYSTEM VALIDATION

Confirm:

system matches marketplace reality
listings are maintained automatically
invalid listings are removed
only profitable listings remain
system operates autonomously

---

# FINAL OBJECTIVE

Transform Ivan Reseller Web into a system that:

RECOVERS broken listings
CLEANS bad listings
OPTIMIZES active listings
SYNCS with real marketplaces
CONTROLS costs and profit
OPERATES autonomously across ALL marketplaces
GENERATES real sustainable revenue
