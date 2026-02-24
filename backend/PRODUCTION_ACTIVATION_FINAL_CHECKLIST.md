# Production Activation Final Checklist � Railway

Pasos exactos para activar compras reales, generaci�n de Sale e ingresos autom�ticos en Railway.

---

## 1. Variables de entorno (Railway)

Railway Dashboard ? Proyecto ? Servicio **ivan-reseller-backend** ? **Variables** ? a�adir o editar:

| Variable | Valor |
|----------|--------|
| `ALLOW_BROWSER_AUTOMATION` | `true` |
| `AUTOPILOT_MODE` | `production` |
| `ALIEXPRESS_USER` | \<tu email/usuario AliExpress\> |
| `ALIEXPRESS_PASS` | \<tu contrase�a AliExpress\> |
| `INTERNAL_RUN_SECRET` | \<secreto fuerte, ej. 32+ caracteres\> |

Opcional: `DISABLE_BROWSER_AUTOMATION` = `false` (si no se setea, con `ALLOW_BROWSER_AUTOMATION=true` ya se considera false).

Opcional si Chromium no se encuentra en runtime:
- `PUPPETEER_EXECUTABLE_PATH` = ruta al binario (ej. salida de `which chromium` en el contenedor).

Guardar. Redesplegar el servicio si Railway no redeploya solo.

---

## 2. Verificar despliegue

- Railway ? **Deployments** ? �ltimo deployment en **Success**.
- **View Logs**: buscar l�nea `Chromium executable ready:` o `Chromium encontrado` o `Chromium obtenido` (indica que Chromium se resolvi�). Si no aparece, el primer request que use Puppeteer mostrar� la resoluci�n o error.

---

## 3. Verificar health interno

```bash
curl -s -o /dev/null -w "%{http_code}" -H "x-internal-secret: <INTERNAL_RUN_SECRET>" "https://<BACKEND_URL>/api/internal/health"
```

Esperado: `200`. Respuesta JSON con `"hasSecret": true`.

---

## 4. Prueba controlada de compra real

Endpoint:

```http
POST https://<BACKEND_URL>/api/internal/test-post-sale-flow
Content-Type: application/json
x-internal-secret: <INTERNAL_RUN_SECRET>
```

Body (reemplazar `<PRODUCT_URL_REAL>` por URL real de producto AliExpress):

```json
{
  "productUrl": "https://www.aliexpress.com/item/<PRODUCT_ID>.html",
  "price": 10.99,
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "address": "123 Main St, Miami, FL, US"
  }
}
```

Esperado (�xito):

- HTTP 200.
- Body: `"finalStatus": "PURCHASED"`, `"aliexpressOrderId": "<id real>"` (no `SIMULATED_ORDER_ID`).
- Logs: `[FULFILLMENT] START` ? `[FULFILLMENT] PURCHASED` / `[FULFILLMENT] ALIEXPRESS OK`.

Base de datos: tabla `orders` � nueva fila con `status = PURCHASED` y `aliexpress_order_id` con id real.

Nota: este test crea un Order **sin** `userId`, por tanto **no** se crea Sale. Para flujo completo (Sale + Commission + payout) las �rdenes deben crearse con `userId` (ej. flujo PayPal capture).

---

## 5. Verificar generaci�n de Sale (flujo con userId)

Cuando un Order se crea **con** `userId` (ej. desde PayPal capture) y pasa a PURCHASED:

- Order: `status = PURCHASED`, `aliexpress_order_id` asignado.
- Se llama a `createSaleFromOrder(orderId)`.
- Tabla `sales`: nueva fila con `order_id` = ese order.
- Tabla `commissions` (y/o `admin_commissions`): filas asociadas a la venta.
- Payout: si PayPal/Payoneer configurados, `sales.admin_payout_id` y/o `sales.user_payout_id` se rellenan; logs `[PAYOUT_EXECUTED]` / `[REAL_PAYOUT_EXECUTED]`.

Verificaci�n en DB:

```sql
SELECT id, order_id, user_id, sale_price, status, admin_payout_id, user_payout_id
FROM sales
WHERE order_id = '<order_id>';
```

---

## 6. Resumen de activaci�n

1. Configurar las 5 variables obligatorias en Railway (paso 1); opcionalmente `DISABLE_BROWSER_AUTOMATION=false`.
2. Redesplegar y comprobar logs Chromium (paso 2).
3. Comprobar `/api/internal/health` con header (paso 3).
4. Ejecutar una prueba con `test-post-sale-flow` (paso 4).
5. Para ingresos completos: asegurar Orders con `userId` y configuraci�n PayPal/Payoneer seg�n PRODUCTION_ENV_REQUIRED.md.

Sistema listo para: comprar productos reales autom�ticamente, crear Sale y generar ingresos autom�ticos.
