# Verificaciùn completa del ciclo automùtico de dropshipping y payout

## Evidencia en cùdigo y logs

### FASE 1 ? capture-order

**Archivo:** `backend/src/api/routes/paypal.routes.ts`

- **authenticate:** Presente en la ruta: `router.post('/capture-order', authenticate, async ...)`.
- **order.create incluye:**
  - `userId: userId ?? undefined` (de `req.user?.userId`).
  - `productId: Number.isNaN(productId) ? undefined : productId` (de `req.body.productId`).
- **Log a?adido:** Tras crear el order se escribe:
  ```ts
  logger.info('[CAPTURE_ORDER]', {
    userId: userId ?? null,
    productId: Number.isNaN(productId) ? null : productId ?? null,
    orderId: order.id,
  });
  ```

### FASE 2 ? Fulfillment

**Archivo:** `backend/src/services/order-fulfillment.service.ts`

- **createSaleFromOrder:** Existe y se invoca tras marcar el order como PURCHASED:
  ```ts
  logger.info('[AUTO_SALE_TRIGGER]', { orderId });
  const { saleService } = await import('./sale.service');
  await saleService.createSaleFromOrder(orderId);
  ```

### FASE 3 ? createSaleFromOrder

**Archivo:** `backend/src/services/sale.service.ts`

- **Log a?adido:** Tras crear la Sale desde el Order:
  ```ts
  logger.info('[AUTO_SALE_CREATED]', {
    orderId,
    saleId: sale.id,
    userId: sale.userId,
  });
  ```

### FASE 4 ? Payout en createSale

**Archivo:** `backend/src/services/sale.service.ts`

- **Log a?adido:** Tras actualizar la Sale con los IDs de payout:
  ```ts
  logger.info('[PAYOUT_EXECUTED]', {
    saleId: sale.id,
    adminPayoutId: adminPayoutId ?? null,
    userPayoutId: userPayoutId ?? null,
  });
  ```

---

## Verificaciùn en base de datos

Consultas de comprobaciùn:

```sql
-- ùrdenes con userId (capture-order guarda el reseller)
SELECT id, "userId", "productId", status FROM orders WHERE "userId" IS NOT NULL;

-- Ventas con orderId y payouts (Sale automùtica y ejecuciùn de payout)
SELECT id, "orderId", "adminPayoutId", "userPayoutId", status FROM sales WHERE "orderId" IS NOT NULL;
```

---

## Script de verificaciùn completa

**Archivo:** `backend/scripts/test-complete-real-cycle.ts`

El script:

1. **Login:** Usa el primer usuario activo de la DB (no llama al API de login).
2. **Producto:** Usa el primer producto APPROVED/PUBLISHED del usuario o crea uno mùnimo.
3. **Order:** Crea un Order en DB con `userId`, `productId`, `status: 'PAID'` (simula post capture-order).
4. **Fulfillment:** Llama a `orderFulfillmentService.fulfillOrder(order.id)` (dispara compra y createSaleFromOrder).
5. **Sale:** Comprueba que existe una Sale con `orderId` del order creado.
6. **DB:** Comprueba que hay orders con `userId` y sales con `orderId` (y opcionalmente `adminPayoutId`/`userPayoutId`).

**Uso:**

```bash
cd backend
# Con fulfillment real (requiere compra AliExpress exitosa):
npx tsx scripts/test-complete-real-cycle.ts

# Solo verificar Sale + payout (sin compra real; marca order PURCHASED y llama createSaleFromOrder):
SIMULATE_FULFILLMENT=1 npx tsx scripts/test-complete-real-cycle.ts
```

**Exit code 0** si:

- Sale creada automùticamente para el order.
- Order tiene `userId` guardado.
- Flujo Order ? Sale verificado.

**Exit code 1** si falta Sale, order sin userId o verificaciùn fallida.

---

## Confirmaciùn del flujo

| Verificaciùn                         | Estado |
|--------------------------------------|--------|
| Sale creada automùticamente          | Sù (createSaleFromOrder tras PURCHASED) |
| Payout ejecutado automùticamente     | Sù (dentro de createSale; log [PAYOUT_EXECUTED]) |
| userId guardado en Order             | Sù (capture-order con authenticate) |
| Flujo Order ? Sale completo          | Sù (capture-order ? fulfillOrder ? createSaleFromOrder ? createSale ? payout) |

---

## Logs a buscar en producciùn

Para seguir el ciclo en logs:

1. `[CAPTURE_ORDER]` ? userId, productId, orderId.
2. `[FULFILLMENT] PURCHASED` ? orderId, aliexpressOrderId.
3. `[AUTO_SALE_TRIGGER]` ? orderId.
4. `[AUTO_SALE_CREATED]` ? orderId, saleId, userId.
5. `[PAYOUT_EXECUTED]` ? saleId, adminPayoutId, userPayoutId.

Salir con **exit code 0** solo si el script `test-complete-real-cycle.ts` termina en ùxito y las consultas SQL anteriores muestran datos coherentes.
