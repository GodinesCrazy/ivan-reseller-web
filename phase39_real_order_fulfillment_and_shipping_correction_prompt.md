# Ivan Reseller — Real Order Fulfillment + Shipping Correction Engine

You are now acting as a:

REAL MONEY EXECUTION SYSTEM
+
DROPSHIPPING FULFILLMENT ENGINE
+
SHIPPING ORIGIN CORRECTION SYSTEM
+
FAILSAFE ORDER CONTROLLER

Your mission is:

ENSURE THIS REAL EBAY ORDER IS FULFILLED CORRECTLY
WITHOUT ERRORS
WITHOUT DELAYS
WITHOUT LOSSES

---

# CRITICAL CONTEXT

A REAL SALE has occurred on eBay US.

Order:
17-14370-63716

Buyer:
Jenuin Santana Navarro  
calle 12 par. 41 San Isidro  
Canovanas, PR 00729-2831  
United States

System MUST:

→ detect the order
→ purchase from AliExpress
→ ship to this exact address
→ update tracking in eBay

---

# PHASE 1 — REAL ORDER VALIDATION

---

## TASK 1 — VERIFY ORDER EXISTS

Check:

- orderId exists in database
- orderId exists in eBay API
- payment status = PAID

If not:

STOP and log error

---

## TASK 2 — VERIFY ORDER NOT PROCESSED

Check:

order.status

If already ORDERED or SHIPPED:

STOP (avoid duplicate purchase)

---

# PHASE 2 — PRODUCT MAPPING

---

## TASK 3 — VERIFY SUPPLIER PRODUCT

Check:

- product linked to AliExpress URL
- supplier available
- stock available

If missing:

→ create MANUAL ORDER immediately

---

# PHASE 3 — SHIPPING ORIGIN CORRECTION (CRITICAL)

---

## TASK 4 — FIX SHIPPING LOGIC

Problem detected:

eBay requires US shipping origin

System currently using Chile → ERROR

---

### REQUIRED FIX:

DO NOT use Chile as shipping origin

Instead:

Use dropshipping logic:

supplier → buyer

---

## TASK 5 — SELECT CORRECT SHIPPING METHOD

When purchasing in AliExpress:

- choose shipping TO USA (Puerto Rico)
- NOT from Chile
- use supplier shipping (AliExpress Standard / ePacket / Cainiao)

Ensure:

delivery possible to PR (Puerto Rico)

---

# PHASE 4 — AUTO PURCHASE EXECUTION

---

## TASK 6 — CHECK PAYMENT METHOD

Check:

PayPal balance / payment method

---

## TASK 7 — AUTO PURCHASE

IF funds available:

Execute:

- open AliExpress product
- add to cart
- fill buyer address EXACTLY
- pay using PayPal
- confirm order

---

## TASK 8 — STORE DATA

Save:

supplierOrderId
trackingNumber
purchase timestamp

---

# PHASE 5 — FAILSAFE (CRITICAL)

---

## TASK 9 — IF NO FUNDS

If PayPal balance insufficient:

DO NOT FAIL silently

Create:

ManualOrder

Include:

- supplier link
- buyer address
- cost
- urgency

---

## TASK 10 — FRONTEND ACTION

Show in:

"Orders to Fulfill"

With:

⚠ Required action

---

## TASK 11 — NOTIFICATION

Send:

"⚠ Action required: order pending fulfillment"

---

# PHASE 6 — EBAY UPDATE

---

## TASK 12 — UPDATE EBAY

Once tracking exists:

- upload tracking number
- mark as shipped

---

# PHASE 7 — DELIVERY VALIDATION

---

## TASK 13 — VERIFY SHIPPING VALIDITY

Ensure:

- supplier ships to Puerto Rico
- no restricted shipping
- estimated delivery acceptable

---

# PHASE 8 — ERROR HANDLING

---

## TASK 14 — HANDLE EBAY SHIPPING ERROR

Error detected:

"ship from address must be in the United States"

Solution:

DO NOT use eBay label system

Instead:

mark as "shipped externally"
use tracking from AliExpress

---

# PHASE 9 — FINAL VALIDATION

---

## TASK 15 — ORDER SUCCESS CRITERIA

Order is SUCCESS only if:

✔ purchased from supplier  
✔ shipped to correct address  
✔ tracking assigned  
✔ eBay updated  

---

# PHASE 10 — REAL EXECUTION (THIS ORDER)

---

## TASK 16 — PROCESS THIS ORDER NOW

Execute full flow for:

orderId: 17-14370-63716

Verify:

- was purchase executed?
- is there tracking?
- is it in correct state?

---

# FINAL OBJECTIVE

Guarantee:

THIS FIRST SALE

→ is fulfilled correctly  
→ reaches the customer  
→ no refund / no issue  
→ validates system capability  
