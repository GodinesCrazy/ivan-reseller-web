# Lista exacta — Gaps antes de prueba real vía web (compra tercero)

Cada ítem: **prerequisite para prueba real** salvo que se indique lo contrario.

---

## 1. Configuración y entorno (NV en esta auditoría)

1. **Mercado Libre OAuth** producción (o sandbox coherente) para la cuenta que publicará — **NV**.
2. **Webhook Mercado Libre** apuntando a URL pública estable, secreto configurado, tópico órdenes — **NV**.
3. **AliExpress Dropshipping API** (credenciales por `userId` según handlers internos) — **NV**.
4. **Capital / working capital** suficiente y límites diarios adecuados — **NV**.
5. **Base de datos y backend desplegados** con mismas variables que local — **NV**.

---

## 2. Datos del producto (verificado como requisito en código)

6. **`aliexpressUrl`** en formato `.../item/{id}.html` en el `Product` vinculado al listing — **Prerequisite** (`order-fulfillment.service.ts`).
7. **`marketplaceListing`** con `listingId` que coincide con el item ML publicado — **Prerequisite** (`recordSaleFromWebhook`).
8. **Imágenes:** `publishSafe: true` en resolución publish (o direct pass válido) — **Prerequisite** para publicación automática sin bloqueo (`mercadolibre.publisher.ts`).

---

## 3. Economía (P — riesgo)

9. **Precio publicado** coherente con coste proveedor + fees ML Chile + envío + margen — **Prerequisite** recomendado (F-003 / P-001).
10. **Moneda** listing vs cálculo interno (CLP/USD) revisada — **Prerequisite** recomendado.

---

## 4. Contenido (P)

11. **Título/descripción** en español aceptable para ML Chile (policy idioma cumplida + calidad comercial) — **Recomendado** manual o asistido.

---

## 5. Observabilidad de la prueba

12. **Runbook:** quién mira `Orders`, `PendingPurchases`, logs `[WEBHOOK]`, `[ORDER-FULFILLMENT]` durante la venta — **Prerequisite operativo**.
13. **Criterio de éxito:** PURCHASED + `aliexpressOrderId` vs solo venta capturada — **Definir antes**.

---

## 6. UI (mejora, no siempre bloqueante)

14. Panel que muestre último `mlChileCanonicalPipeline.trace` (floor, publishSafe) en detalle producto — **No bloqueante** pero reduce error humano.

---

### Mínimo absoluto para intentar prueba

Items **1–3, 6–8, 12–13**.  
Items **9–11** altamente recomendados para no perder dinero.
