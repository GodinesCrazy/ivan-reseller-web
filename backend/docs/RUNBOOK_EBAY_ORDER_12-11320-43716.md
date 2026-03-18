# Runbook: Orden eBay 12-11320-43716

Guía para asegurar que la venta real eBay **12-11320-43716** entre al flujo de dropshipping y se despache al comprador.

## Datos de la orden (eBay Seller Hub)

| Campo | Valor |
|-------|--------|
| **eBay Order ID** | 12-11320-43716 |
| **Comprador** | Jehuin Santana Navarro |
| **Username comprador** | jersantana_0 |
| **Dirección** | Código postal 00729-2631 (completar desde eBay si hace falta) |
| **SKU ítem** | IVAN-31897 |
| **Item ID (eBay)** | 147204163174 |
| **Título ítem** | Lockable 24 Slot Home Storage Watch Box Double Layer Carbon Fiber Organizer |
| **Subtotal** | US $56.42 |
| **Envío** | US $12.05 |
| **Total** | US $68.47 |
| **Enviar antes de** | mar 20 |
| **Fecha venta** | 17 mar (21:47 PDT) |

---

## 1. Comprobar si la orden está en BD

- **UI:** Ir a **Órdenes** (`/orders`) y buscar una orden con `paypalOrderId: ebay:12-11320-43716` (o por fecha/importe 68.47).
- **API:** `GET /api/orders` (autenticado) y buscar `paypalOrderId === "ebay:12-11320-43716"`.
- **BD:** `SELECT id, status, paypalOrderId, price, createdAt FROM orders WHERE paypalOrderId = 'ebay:12-11320-43716';`

Si **no existe**, la orden no fue creada por webhook ni por sync. Pasa al paso 2.

---

## 2. Importar la orden manualmente (si no está en BD)

1. Ir a **Órdenes** → **Importar orden eBay** (o `/orders?import=ebay`).
2. Rellenar:
   - **eBay Order ID:** `12-11320-43716`
   - **Listing ID / Item ID:** `147204163174`
   - **Importe (USD):** `68.47`
   - **Comprador:** Jehuin Santana Navarro
   - **Dirección:** la que muestre eBay para este pedido (ej. addressLine1, city, state PR, zipCode 00729-2631, country US)
3. Pulsar **Importar orden**.
4. La orden se crea con `status = PAID`; **process-paid-orders** intentará la compra en AliExpress. Si falla (fondos, etc.) → **Compras pendientes** → compra manual y **Enviar tracking**.

**API directa:**  
`POST /api/orders/import-ebay-order` (autenticado), body:

```json
{
  "ebayOrderId": "12-11320-43716",
  "listingId": "147204163174",
  "amount": 68.47,
  "buyerName": "Jehuin Santana Navarro",
  "buyerEmail": "<email del comprador si lo tienes>",
  "shippingAddress": {
    "addressLine1": "<desde eBay>",
    "city": "<desde eBay>",
    "state": "PR",
    "zipCode": "00729-2631",
    "country": "US"
  }
}
```

Si el listing no está mapeado, usa **productId** con el ID interno del producto que tenga SKU IVAN-31897 y `aliexpressUrl`.

---

## 3. Traer pedido desde eBay (nuevo flujo)

Si en la app existe el botón **Traer pedido desde eBay**:

1. En **Órdenes**, abrir el formulario e ingresar **eBay Order ID:** `12-11320-43716`.
2. El sistema obtendrá el pedido desde la API de eBay, lo creará/actualizará en BD y disparará el fulfillment si hay producto mapeado.

---

## 4. Si la orden está PAID pero no se cumple

- Esperar la siguiente ejecución de **process-paid-orders** (cada 5 min) o usar **Reintentar** en el detalle de la orden.
- Si falla por fondos → **Compras pendientes** → añadir capital o comprar manual y **Enviar tracking**.

---

## 5. Si la orden está FAILED

- **Compras pendientes**: ver mensaje de error, enlace al proveedor y formulario **Enviar tracking** tras comprar manualmente.
- Reintentos automáticos (retry engine) volverán a intentar si el error es por fondos; tras 5 reintentos se marca NEEDS_MANUAL_INTERVENTION.

---

## 6. Verificar fulfillment y tracking en eBay

- **Orden en BD:** `status = PURCHASED`, `aliexpressOrderId` rellenado.
- **Tracking:** Cuando exista en Sale/PurchaseLog, el sistema enviará el tracking a eBay (`createShippingFulfillment`). Comprobar en eBay Seller Hub que la orden 12-11320-43716 figure como enviada con número de seguimiento.

---

## Resumen

```text
eBay vende (12-11320-43716) → Import manual o "Traer desde eBay" → Order PAID
  → process-paid-orders / fulfillOrder → Order PURCHASED + Sale
  → tracking → updateOrderTracking → eBay marcada como enviada
```

Si el sync automático no trajo esta orden (límite 50, Redis inactivo, etc.), la importación manual o **Traer pedido desde eBay** asegura que entre al flujo y se pueda despachar hoy.
