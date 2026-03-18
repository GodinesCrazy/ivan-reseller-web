# Ivan Reseller — Post-Sale Fulfillment Guarantee Engine

You are now acting as a:

GLOBAL ORDER ORCHESTRATION SYSTEM
+
DROPSHIPPING FULFILLMENT ENGINE
+
PAYMENT VALIDATION SYSTEM
+
FAILSAFE AUTOMATION CONTROLLER

Your mission is:

ENSURE THAT EVERY SALE IS FULFILLED CORRECTLY
WITHOUT ERRORS
WITHOUT DELAYS
WITHOUT LOSSES

---

# GLOBAL OBJECTIVE

From the moment a sale is detected:

→ verify it is REAL
→ ensure supplier order is created
→ ensure product is shipped
→ ensure tracking exists
→ ensure system updates correctly

---

# PHASE 1 — SALE VALIDATION (CRITICAL)

---

## TASK 1 — VERIFY REAL SALE

Check:

- orderId exists in marketplace (eBay / ML / Amazon)
- payment status = paid
- buyer data present

If NOT:

mark as INVALID_SALE
do NOT proceed

---

## TASK 2 — DUPLICATE CHECK

Ensure:

order not already processed

If already processed:

stop flow

---

# PHASE 2 — FULFILLMENT DECISION ENGINE

---

## TASK 3 — DETERMINE FULFILLMENT METHOD

Check:

- AUTO_PURCHASE_ENABLED
- supplier availability
- product mapping (marketplace → supplier product)

If mapping missing:

mark as NEEDS_MANUAL_MAPPING

---

# PHASE 3 — AUTO PURCHASE (ALiEXPRESS)

---

## TASK 4 — CHECK FUNDS

Check:

available balance (payment method)

If sufficient:

→ proceed AUTO PURCHASE

If NOT:

→ create MANUAL_ORDER

---

## TASK 5 — AUTO PURCHASE EXECUTION

Use:

AliExpress API / automation

Steps:

- open supplier product
- add to cart
- fill buyer shipping data EXACTLY
- select best shipping method
- complete purchase

---

## TASK 6 — TRACKING EXTRACTION

After purchase:

- extract tracking number
- extract supplier orderId

Store in system:

order.trackingNumber
order.supplierOrderId

---

# PHASE 4 — MARKETPLACE UPDATE

---

## TASK 7 — UPDATE MARKETPLACE

Push to marketplace:

- tracking number
- shipping confirmation

Ensure:

status = shipped

---

# PHASE 5 — FAILSAFE MANUAL MODE

---

## TASK 8 — CREATE MANUAL ORDER (IF NEEDED)

If auto purchase fails OR insufficient funds:

Create record:

ManualOrder:
- product
- supplier link
- buyer data
- price
- urgency

---

## TASK 9 — FRONTEND INTEGRATION

Display in UI:

SECTION: "Orders to Fulfill"

Show:

- product
- buyer address
- supplier link (clickable)
- required action

---

## TASK 10 — USER ALERT

Trigger:

notificationService

Message:

"⚠ Action required: order pending fulfillment"

---

# PHASE 6 — ERROR HANDLING

---

## TASK 11 — HANDLE FAILURES

If:

AliExpress error
timeout
invalid address

Then:

retry (max 2)
else → manual fallback

---

# PHASE 7 — ORDER STATUS TRACKING

---

## TASK 12 — ORDER STATE MACHINE

Each order must have:

PENDING
PROCESSING
ORDERED
SHIPPED
DELIVERED
FAILED

---

## TASK 13 — REAL-TIME SYNC

Sync order status with:

marketplace
supplier
internal DB

---

# PHASE 8 — PROFIT PROTECTION

---

## TASK 14 — COST VALIDATION

Before purchase:

calculate:

product cost
shipping cost
fees

If profit < MIN_ALLOWED_MARGIN:

DO NOT AUTO BUY
→ manual review

---

# PHASE 9 — LOGGING & TRACEABILITY

---

## TASK 15 — FULL TRACE

Log:

- timestamps
- actions taken
- errors
- retries

---

# PHASE 10 — FINAL VALIDATION

---

## TASK 16 — SUCCESS CHECK

Order is SUCCESS only if:

✔ purchased from supplier  
✔ tracking assigned  
✔ marketplace updated  

Else:

NOT COMPLETE

---

# PHASE 11 — TEST WITH REAL ORDER

---

## TASK 17 — VALIDATE CURRENT ORDER

Use the order shown in UI:

- confirm exists in DB
- confirm purchase executed
- confirm tracking exists
- confirm marketplace updated

---

# FINAL OBJECTIVE

Guarantee:

EVERY SALE → IS FULFILLED CORRECTLY

WITH:

automation
fallback
visibility
zero loss
