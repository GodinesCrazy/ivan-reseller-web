# Ivan Reseller — Real Sales Sync & Frontend Reflection Engine

You are now acting as a:

MARKETPLACE DATA INTEGRATION ENGINE
+
REAL SALES SYNCHRONIZATION SYSTEM
+
FRONTEND DATA CONSISTENCY ENGINE
+
BUSINESS TRANSPARENCY CONTROLLER

Your mission is:

MAKE THE SYSTEM REFLECT EXACTLY WHAT HAPPENS IN MARKETPLACES

(NO FAKE DATA — NO MISSING DATA — NO DESYNC)

---

# GLOBAL OBJECTIVE

Ensure that:

EVERY SALE from:
- eBay
- MercadoLibre
- Amazon

is:

✔ captured  
✔ stored  
✔ processed  
✔ displayed in frontend  

with FULL detail and FULL accuracy

---

# PHASE 1 — EBAY SALES INGESTION (CRITICAL)

---

## TASK 1 — FETCH REAL ORDERS FROM EBAY

Use eBay API:

- getOrders / Fulfillment API
- filter: PAID / AWAITING_SHIPMENT

Extract:

- orderId
- buyer name
- buyer username
- full shipping address
- product title
- SKU
- item price
- shipping cost
- total amount
- quantity
- order date

---

## TASK 2 — STORE IN DATABASE

Create/update table:

Order / Sale

Fields:

orderId (unique)
marketplace = "ebay"
buyerName
buyerUsername
address (FULL STRUCTURED)
productTitle
sku
price
shippingCost
total
status (PAID / PROCESSING / SHIPPED)
createdAt

---

## TASK 3 — DEDUPLICATION

Ensure:

no duplicate orders

(orderId must be unique)

---

# PHASE 2 — CROSS-MARKETPLACE STANDARDIZATION

---

## TASK 4 — NORMALIZE STRUCTURE

Apply SAME schema for:

- MercadoLibre
- Amazon

So frontend uses ONE unified model

---

# PHASE 3 — REAL-TIME SYNC

---

## TASK 5 — CREATE SYNC WORKER

Create worker:

marketplace-order-sync

Runs:

every 5–10 minutes

---

## TASK 6 — INCREMENTAL SYNC

Only fetch:

new orders
updated orders

---

# PHASE 4 — FRONTEND INTEGRATION

---

## TASK 7 — SALES PAGE (CRITICAL)

Update:

/ventas

Display EXACTLY:

- product image
- product name
- buyer name
- buyer username
- full address
- total sale amount
- shipping
- status
- order date

---

## TASK 8 — ORDER DETAIL VIEW

When clicking a sale:

Show FULL detail:

- buyer info
- shipping address
- financial breakdown
- fulfillment status
- tracking (if exists)

---

## TASK 9 — STATUS VISIBILITY

Statuses must reflect REAL state:

PAID
PROCESSING
ORDERED
SHIPPED
DELIVERED

---

# PHASE 5 — DATA TRUST (CRITICAL)

---

## TASK 10 — REMOVE FAKE DATA

Eliminate:

- test sales
- mock data
- simulated orders

Only real marketplace data allowed

---

## TASK 11 — SOURCE TAGGING

Each sale must show:

source = eBay / ML / Amazon

---

## TASK 12 — LAST SYNC INFO

Display:

"Last synced: X minutes ago"

---

# PHASE 6 — BACKEND ↔ FRONTEND CONSISTENCY

---

## TASK 13 — STRICT DATA FLOW

Frontend must ONLY consume:

real backend APIs

NO hardcoded values
NO fake counters

---

## TASK 14 — ERROR DETECTION

If mismatch:

frontend ≠ backend ≠ marketplace

log error

---

# PHASE 7 — VALIDATION WITH REAL ORDER

---

## TASK 15 — VALIDATE CURRENT ORDER

Use:

orderId = 17-14370-63716

Check:

✔ exists in DB  
✔ matches eBay data  
✔ appears in frontend  
✔ shows correct buyer + address  
✔ shows correct total (US$68.47)  

---

# PHASE 8 — MULTI-MARKETPLACE SCALING

---

## TASK 16 — APPLY SAME LOGIC TO:

- MercadoLibre
- Amazon

Ensure:

same level of detail and accuracy

---

# FINAL OBJECTIVE

Transform system into:

A REAL SALES CONTROL PANEL

where:

what you see = what actually happened

NO discrepancies
NO missing data
FULL visibility of revenue
