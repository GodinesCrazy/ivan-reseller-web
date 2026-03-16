# PROMPT PARA CURSOR

```markdown
# Ivan Reseller Web — Listing State Reconciliation & Publishing Validation

You are performing a critical reliability upgrade for Ivan Reseller Web. A bug has been detected: Some listings appear as "published" inside the system but are not actually active in the marketplace.

Example behavior:
- Marketplace URL returns error page
- System dashboard shows listing as active

This indicates a state synchronization failure. Your task is to implement a **Listing State Reconciliation Engine**.

---

# CRITICAL RULES

Do not remove existing features. Only extend and repair the system. All Phase 1–14 modules must remain intact.

---

# OBJECTIVE

Guarantee that the system always reflects the real state of listings in:
- MercadoLibre Chile
- eBay US

The internal system state must never diverge from marketplace reality.

---

# TASK 1 — LISTING STATE RECONCILIATION ENGINE

Create a new service: listing-state-reconciliation.service.ts

Purpose: Verify that every listing marked as published actually exists and is active in the marketplace.

---

# RECONCILIATION PROCESS

For each listing in database where status = published:

1. Query the marketplace API.
   - MercadoLibre: GET /items/{item_id}
   - eBay: GetItem API

---

# STATE VERIFICATION

Possible results:
- ACTIVE
- PAUSED
- NOT_FOUND
- ERROR

---

# DATABASE CORRECTION

Update local listing status accordingly.

If NOT_FOUND: mark listing as: status = failed_publish and store error message.

---

# TASK 2 — AUTO RE-PUBLISH

If listing failed due to:
- temporary error
- rate limit
- API timeout

enqueue automatic re-publication job.

---

# TASK 3 — ERROR CLASSIFICATION

Create error categories:
- marketplace_rejection
- validation_error
- api_error
- rate_limit

Store in table: listing_publish_errors

Fields:
- listingId
- marketplace
- errorType
- errorMessage
- createdAt

---

# TASK 4 — DASHBOARD CORRECTION

Ensure frontend dashboard only counts listings where: status = ACTIVE in marketplace.

Remove incorrect counts caused by stale state.

---

# TASK 5 — RECONCILIATION WORKER

Create BullMQ worker: listing-state-reconciliation

Run every: 30 minutes

Worker responsibilities:
- scan published listings
- verify marketplace status
- correct database state
- enqueue re-publish if needed.

---

# TASK 6 — INITIAL FULL AUDIT

Run reconciliation across all existing listings.

Expected outcomes:
- remove false positives
- correct status
- repair listings.

---

# TASK 7 — PUBLISH VALIDATION

After publishing a listing:
- validate publication immediately by querying marketplace.
- Only mark listing as ACTIVE if marketplace confirms it.

---

# TASK 8 — DEPLOYMENT

After implementing changes:
- commit all updates
- push to GitHub
- Verify CI pipeline builds successfully.

---

# TASK 9 — DEPLOYMENT VERIFICATION

Ensure correct deployment:
- Backend → Railway
- Frontend → Vercel

Verify:
- build succeeded
- environment variables loaded
- workers running.

---

# TASK 10 — SYSTEM VERIFICATION

After deployment run reconciliation scan.

Ensure: no listings marked active if marketplace returns error.

---

# FINAL OBJECTIVE

Ivan Reseller Web must maintain perfect synchronization between:
- internal system state
- marketplace reality

The system must only count listings that truly exist and are active in the marketplace.
```

---

# Qué va a solucionar esto

Esto arregla exactamente el problema que ves: Tu sistema tiene:

```
ACTIVE (database)
```

pero MercadoLibre devuelve:

```
ERROR PAGE
```

Con este motor el sistema:
1️⃣ detecta el error
2️⃣ corrige el estado
3️⃣ intenta republicar
4️⃣ evita que el dashboard muestre datos falsos

---

# Algo muy importante que veo en tu captura

El error de MercadoLibre:

```
VIP67-RKR3XDH0NSUY
```

normalmente ocurre cuando:
- el item **no existe**
- el item **fue rechazado**
- el item **fue eliminado por la API**

Eso confirma que el sistema **marcó el listing como publicado sin validar respuesta**.

---

# Lo que ocurrirá después de aplicar este prompt

Tu sistema tendrá:

```
State Reconciliation Engine + Publish Validation + Error Classification + Auto Re-Publish
```

Eso es exactamente lo que usan **los sistemas profesionales de marketplace automation**.
