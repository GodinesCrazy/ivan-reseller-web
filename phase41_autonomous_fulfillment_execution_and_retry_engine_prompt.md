# Ivan Reseller — Autonomous Fulfillment Execution & Retry Engine

You are now acting as a:

REAL DROPSHIPPING EXECUTION ENGINE
+
AUTONOMOUS FULFILLMENT SYSTEM
+
PAYMENT FAILURE HANDLER
+
ORDER PRIORITY QUEUE MANAGER

Your mission is:

ENSURE THAT EVERY REAL SALE IS:

✔ PROCESSED  
✔ PURCHASED FROM SUPPLIER  
✔ SHIPPED TO CUSTOMER  
✔ TRACKED  
✔ RECOVERED IF FAILED  

---

# GLOBAL OBJECTIVE

For EVERY order coming from:

- eBay
- MercadoLibre
- Amazon

System must:

1. Detect sale
2. Attempt supplier purchase (AliExpress)
3. Handle failure (no funds / error)
4. Retry automatically
5. Allow manual intervention if needed

---

# PHASE 1 — TRIGGER FULFILLMENT FROM SALE

---

## TASK 1 — AUTO TRIGGER

When new Order is created (status = PAID):

Automatically trigger:

orderFulfillmentService.processOrder(orderId)

NO manual trigger required

---

# PHASE 2 — SUPPLIER PURCHASE EXECUTION

---

## TASK 2 — VALIDATE PRODUCT LINK

Ensure:

- AliExpress product URL exists
- Mapping is correct

If missing:

→ move to MANUAL_PENDING

---

## TASK 3 — EXECUTE PURCHASE

Attempt:

- open AliExpress product
- add to cart
- fill buyer address EXACTLY
- use PayPal
- confirm order

---

# PHASE 3 — PAYMENT FAILURE HANDLING (CRITICAL)

---

## TASK 4 — DETECT PAYMENT FAILURE

If:

PayPal insufficient funds
payment rejected
transaction error

Then:

DO NOT FAIL SYSTEM

---

## TASK 5 — CREATE PENDING ORDER

Move order to:

status = PENDING_PURCHASE

Add to queue:

pendingPurchases

Fields:

- orderId
- product
- buyer
- supplier link
- required amount
- createdAt
- retryCount

---

## TASK 6 — FRONTEND VISIBILITY

Display in:

"Compras pendientes"

Show:

⚠ Required action  
Buyer info  
Supplier link  
Amount needed  

---

# PHASE 4 — RETRY ENGINE (CRITICAL)

---

## TASK 7 — CREATE RETRY WORKER

Worker:

fulfillment-retry-engine

Runs every 24 hours

---

## TASK 8 — PRIORITY ORDERING

Sort pending orders by:

createdAt ASC

(oldest first)

---

## TASK 9 — RETRY PURCHASE

For each pending order:

Attempt purchase again

If success:

→ move to ORDERED

---

## TASK 10 — MAX RETRY LOGIC

If retryCount > 5:

mark:

NEEDS_MANUAL_INTERVENTION

---

# PHASE 5 — SUCCESS FLOW

---

## TASK 11 — STORE PURCHASE DATA

After success:

save:

supplierOrderId  
trackingNumber  
purchaseDate  

---

## TASK 12 — UPDATE MARKETPLACE

Send:

trackingNumber → eBay / ML / Amazon

Set:

status = SHIPPED

---

# PHASE 6 — SHIPPING CORRECTION (CRITICAL)

---

## TASK 13 — FIX SHIPPING ORIGIN

DO NOT use Chile

Use:

supplier → customer

Ensure:

AliExpress ships to USA (Puerto Rico)

---

# PHASE 7 — MANUAL MODE (FAILSAFE)

---

## TASK 14 — USER ACTION FLOW

User can:

open pending order  
click supplier link  
purchase manually  

---

## TASK 15 — MANUAL CONFIRMATION

User inputs:

tracking number

System resumes:

normal flow

---

# PHASE 8 — FULL TRACEABILITY

---

## TASK 16 — ORDER LOGGING

Track:

- attempts
- failures
- retries
- success

---

# PHASE 9 — VALIDATION WITH REAL ORDER

---

## TASK 17 — VALIDATE CURRENT ORDER

Order:

17-14370-63716

Check:

✔ detected  
✔ in system  
✔ fulfillment triggered  
✔ purchase attempted  
✔ status correct  

---

# FINAL OBJECTIVE

Create a system that:

NEVER LOSES A SALE

and ensures:

AUTOMATED FULFILLMENT  
INTELLIGENT RETRY  
MANUAL BACKUP  
FULL CONTROL  
