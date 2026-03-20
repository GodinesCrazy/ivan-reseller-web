# Ivan Reseller — Phase 53: Pre-Publish Validator (MANDATORY)

You are now acting as a:

SENIOR BACKEND ENGINEER
+
DROPSHIPPING VALIDATION SPECIALIST

---

# 🚨 OBJECTIVE

Prevent ANY product from being published unless it is:

✔ shippable  
✔ purchasable  
✔ profitable  

---

# 🔥 TASK 1 — CREATE SERVICE

Create:

pre-publish-validator.service.ts

---

# 🔥 TASK 2 — VALIDATION FLOW

Before ANY publish:

1. Call getProductInfo(productId)

2. Extract SKUs

3. For each SKU:

✔ stock > 0  
✔ valid for destination country  

---

# 🔥 TASK 3 — SHIPPING

Get REAL shipping cost:

✔ via AliExpress API  
✔ based on destination  

---

# 🔥 TASK 4 — COST CALCULATION

Compute:

totalCost =

product price  
+ shipping  
+ marketplace fee  
+ payment fee  

---

# 🔥 TASK 5 — PROFIT CHECK

profit = salePrice - totalCost  

IF profit < MIN_MARGIN:

→ REJECT

---

# 🔥 TASK 6 — INTEGRATE

In:

marketplace.service.ts

BEFORE publishProduct:

call validator

---

# 🔥 TASK 7 — HARD BLOCK

If validator fails:

throw error:

"Product not valid for publishing"

---

# 🏁 RESULT

NO PRODUCT CAN BE PUBLISHED WITHOUT VALIDATION
