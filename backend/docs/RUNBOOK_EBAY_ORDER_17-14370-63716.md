# Runbook: Orden eBay 17-14370-63716

Guía para asegurar que la venta real eBay **17-14370-63716** entre al flujo de dropshipping y no se pierda.

## Datos de la orden

| Campo | Valor |
|-------|--------|
| **eBay Order ID** | 17-14370-63716 |
| **Comprador** | Jenuin Santana Navarro |
| **Dirección** | calle 12 par. 41 San Isidro, Canovanas, PR 00729-2831, United States |
| **SKU ítem** | IVAN-31897 |
| **Total** | USD 61.41 (venta) / 56.42 (ítem) |

---

## 1. Comprobar si la orden está en BD

- **UI:** Ir a **Órdenes** (`/orders`) y buscar una orden cuyo ID interno o cuyo detalle muestre `paypalOrderId: ebay:17-14370-63716` (o que por fecha/importe coincida).
- **API:** `GET /api/orders` (autenticado) y en la respuesta buscar un ítem con `paypalOrderId === "ebay:17-14370-63716"`.
- **BD:** `SELECT id, status, paypalOrderId, price, createdAt FROM orders WHERE paypalOrderId = 'ebay:17-14370-63716';`

Si **no existe**, la orden no fue creada por el webhook eBay. Pasa al paso 2.

---

## 2. Importar la orden manualmente (si no está en BD)

1. Ir a **Órdenes** → botón **Importar orden eBay** (o abrir `/orders?import=ebay`).
2. Rellenar:
   - **eBay Order ID:** `17-14370-63716`
   - **Listing ID / Item ID:** ID del ítem en eBay (el que corresponde al SKU IVAN-31897). Si no lo tienes, en **Product ID** pon el ID interno del producto que tiene ese listing en la app.
   - **Importe (USD):** 61.41 (o 56.42 si solo ítem)
   - **Comprador:** Jenuin Santana Navarro
   - **Dirección:** calle 12 par. 41 San Isidro, Ciudad: Canovanas, Estado: PR, Código postal: 00729-2831, País: US
3. Pulsar **Importar orden**.
4. La orden se crea con `status = PAID` y entra al flujo: en los siguientes minutos el cron **process-paid-orders** (cada 5 min sin Redis, o vía cola con Redis) intentará cumplirla; si hay fondos y producto con `aliexpressUrl`, pasará a PURCHASED. Si falla (p. ej. fondos insuficientes), aparecerá en **Compras pendientes** (Orders to Fulfill).

**API directa:**  
`POST /api/orders/import-ebay-order` (autenticado), body:

```json
{
  "ebayOrderId": "17-14370-63716",
  "listingId": "<eBay item ID del listing>",
  "amount": 61.41,
  "buyerName": "Jenuin Santana Navarro",
  "shippingAddress": {
    "addressLine1": "calle 12 par. 41 San Isidro",
    "city": "Canovanas",
    "state": "PR",
    "zipCode": "00729-2831",
    "country": "US"
  }
}
```

(Si no tienes `listingId`, usa `productId` con el ID interno del producto que tenga `aliexpressUrl`.)

---

## 3. Si la orden está PAID pero no se cumple

- El cron debería procesarla en breve. Si quieres forzar:
  - **Sin código:** Esperar siguiente ejecución de process-paid-orders (cada 5 min si no hay Redis).
  - **Con acceso al servidor:** Ejecutar el job de process-paid-orders (según tu scheduler/Redis).

---

## 4. Si la orden está FAILED (p. ej. fondos insuficientes)

- Ir a **Compras pendientes** (Orders to Fulfill). La orden aparecerá con "Order failed — fulfill manually" y el mensaje de error.
- Si el error es **FAILED_INSUFFICIENT_FUNDS** y el reintento es &lt; 3:
  - En **Órdenes** → abrir la orden → botón **Reintentar** (o `POST /api/orders/:id/retry-fulfill` con el `id` interno de la orden).
- Si el error es otro (p. ej. envío / etiqueta eBay):
  - Completar la compra manualmente en AliExpress con la dirección del comprador, luego añadir el tracking en la venta/orden. Cuando el sistema tenga tracking (Sale o PurchaseLog), si la orden es de eBay (`paypalOrderId` empieza por `ebay:`), el flujo enviará el tracking a eBay (ver sección 6).

---

## 5. Verificar que el fulfillment se ejecutó

- **Orden en BD:** `status = PURCHASED` y `aliexpressOrderId` rellenado.
- **UI:** En **Órdenes**, el estado de la orden debe ser "PURCHASED" y en el detalle verse el ID de AliExpress.

---

## 6. Verificar que el tracking se subió a eBay

Cuando exista tracking (en Sale o en PurchaseLog asociado a la orden):

- El flujo en [automated-business.service.ts](../src/services/automated-business.service.ts) (`updateOrderTracking`) detecta órdenes con `paypalOrderId` empezando por `ebay:` y llama al servicio [ebay-fulfillment.service.ts](../src/services/ebay-fulfillment.service.ts) para enviar el tracking a la API de eBay (createShippingFulfillment).
- **Comprobar en eBay:** En la cuenta de vendedor eBay, abrir la orden 17-14370-63716 y confirmar que aparece como enviada y con número de seguimiento.
- **Logs:** Buscar en logs del backend `[EBAY-FULFILLMENT] Tracking submitted` o `[EBAY] createShippingFulfillment success` con el `orderId` correspondiente.

Si el envío a eBay falla (credenciales, formato, etc.), el error se registra pero el flujo interno no falla; la Sale queda con tracking en BD y se puede reintentar el envío a eBay más adelante o de forma manual si se implementa un endpoint específico.

---

## 7. Resumen de flujo completo

```text
eBay vende → Webhook (o importación manual) → Order PAID
  → process-paid-orders / fulfillOrder → Order PURCHASED + Sale
  → tracking en PurchaseLog/Sale → updateOrderTracking → eBay createShippingFulfillment
```

Si en cualquier paso falla (webhook no configurado, listing no encontrado, fondos insuficientes, error de AliExpress), la orden puede quedar en PAID o FAILED y aparece en **Compras pendientes** para acción manual; la importación manual permite recuperar la orden si el webhook no la creó.
