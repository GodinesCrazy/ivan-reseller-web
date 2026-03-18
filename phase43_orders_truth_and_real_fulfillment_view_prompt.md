# Ivan Reseller — Orders Truth & Real Fulfillment Engine

You are now acting as a:

SENIOR BACKEND ARCHITECT
+
DATA INTEGRITY ENGINE
+
MARKETPLACE INTEGRATION SPECIALIST
+
DROPSHIPPING OPERATIONS ENGINEER

Your mission is:

FIX THE ORDERS PAGE SO IT SHOWS ONLY REAL DATA
AND TRACKS THE TRUE POST-SALE FLOW

---

# CRITICAL PROBLEM

Current state:

❌ Orders page shows TEST data  
❌ Real sale (eBay) is NOT visible  
❌ No connection between marketplace reality and system  
❌ No reliable post-sale tracking  

This is a CRITICAL BUSINESS FAILURE

---

# GLOBAL OBJECTIVE

Transform Orders into:

A REAL POST-SALE CONTROL CENTER

Where:

✔ Only REAL orders are shown  
✔ Orders come from marketplaces APIs  
✔ Each order has a clear fulfillment state  
✔ Fake/test data is eliminated  

---

# PHASE 1 — REMOVE FAKE DATA (CRITICAL)

---

## TASK 1 — IDENTIFY TEST ORDERS

Find all orders where:

- orderId contains TEST / DEMO / MOCK
- source = internal test
- no marketplace reference

---

## TASK 2 — HARD REMOVE TEST DATA

In production:

DELETE or EXCLUDE permanently:

test orders  
fake fulfillment entries  

Orders page must NEVER show fake data

---

# PHASE 2 — MARKETPLACE AS SOURCE OF TRUTH

---

## TASK 3 — FORCE REAL DATA SOURCE

Orders MUST come ONLY from:

- eBay API
- MercadoLibre API
- Amazon API

NOT from:

mock data
manual inserts

---

## TASK 4 — SYNC REAL ORDERS

Ensure:

marketplace-order-sync is working

Fetch:

- PAID orders
- AWAITING_SHIPMENT orders

---

## TASK 5 — VALIDATE REAL ORDER

Specifically validate:

orderId: 17-14370-63716

Ensure:

✔ exists in DB  
✔ linked to eBay  
✔ has full buyer + address  
✔ has correct amount  

---

# PHASE 3 — UNIFIED ORDER MODEL

---

## TASK 6 — SINGLE ORDER ENTITY

Ensure ONE table:

Order

Fields:

orderId  
marketplace  
buyerName  
address  
product  
amount  
status  
tracking  
createdAt  

---

## TASK 7 — REMOVE DUPLICATES

Ensure:

no duplicate records per orderId

---

# PHASE 4 — ORDERS PAGE FIX

---

## TASK 8 — CONNECT FRONTEND TO REAL API

Orders page MUST use:

GET /api/orders (REAL DATA ONLY)

---

## TASK 9 — DISPLAY REAL DATA

Each row must show:

✔ orderId  
✔ product title  
✔ buyer  
✔ real amount  
✔ date  
✔ marketplace  

---

## TASK 10 — REMOVE STATIC DATA

Eliminate:

hardcoded entries  
cached fake values  

---

# PHASE 5 — FULFILLMENT STATE INTEGRATION

---

## TASK 11 — REAL STATUS

Orders must reflect:

PAID  
PENDING_PURCHASE  
ORDERED  
SHIPPED  
FAILED  

---

## TASK 12 — LINK TO FULFILLMENT ENGINE

Orders page must reflect:

actual fulfillment state from backend

---

# PHASE 6 — POST-SALE TRACKING (CRITICAL)

---

## TASK 13 — FULL VISIBILITY

Each order must show:

✔ if purchase attempted  
✔ if purchase failed  
✔ if pending  
✔ if shipped  
✔ tracking number  

---

## TASK 14 — ORDER DETAIL VIEW

Clicking order shows:

buyer full address  
supplier link  
cost breakdown  
timeline  

---

# PHASE 7 — REAL-TIME CONSISTENCY

---

## TASK 15 — AUTO REFRESH

Orders must update:

every few minutes OR manual refresh

---

## TASK 16 — LAST SYNC DISPLAY

Show:

"Last sync: X min ago"

---

# PHASE 8 — VALIDATION

---

## TASK 17 — FINAL CHECK

Orders page must:

✔ show ONLY real orders  
✔ include eBay order 17-14370-63716  
✔ show correct amount (US$68.47)  
✔ show buyer info  
✔ show correct status  

---

# PHASE 9 — SYSTEM INTEGRITY

---

## TASK 18 — PREVENT FUTURE ISSUES

Ensure:

NO test data can enter production

Add safeguards:

if NODE_ENV=production → block test inserts

---

# FINAL OBJECTIVE

Create a system where:

ORDERS PAGE = REALITY

No fake data  
No missing sales  
No confusion  

And where:

EVERY ORDER IS:

VISIBLE  
REAL  
TRACKED  
ACTIONABLE  

(Ningún valor puede ser hardcodeado, todos reales.)
