# CJ → ML Chile — Controlled Test Readiness

**Fecha:** 2026-04-17
**Estado del módulo:** C — Listo para pruebas controladas reales
**Autor:** Principal Delivery Engineer

---

## Qué significa "estado C"

El módulo ha pasado de B (MVP técnico funcional) a C (listo para pruebas reales), lo que significa:

- El flujo completo puede ejecutarse con datos reales de producción.
- Los principales riesgos operacionales están cubiertos con guardrails.
- Existen limitaciones conocidas, todas documentadas y sin impacto bloqueante para una primera prueba controlada.

---

## Checklist del operador — ANTES de publicar

### 1. Credenciales

- [ ] **CJ Dropshipping** conectado en Settings → API Credentials
- [ ] **Mercado Libre** conectado con OAuth (token activo)
- [ ] `ENABLE_CJ_ML_CHILE_MODULE=true` en Railway
- [ ] `VITE_ENABLE_CJ_ML_CHILE_MODULE=true` en Vercel
- [ ] Verificar sistema: `GET /api/cj-ml-chile/system-readiness` → todos `ok: true`

### 2. Webhook ML Chile (notificaciones de órdenes)

- [ ] Ir a: https://vendedores.mercadolibre.cl/notifications (o https://developers.mercadolibre.com/apps)
- [ ] Configurar `notification_url` como:
  ```
  https://{RAILWAY_DOMAIN}/api/cj-ml-chile/webhooks/ml
  ```
- [ ] Tópico a suscribir: `orders_v2`
- [ ] **Sin esto**: las órdenes no llegan automáticamente — deben importarse manualmente por ID.

### 3. Configuración ML post-publicación

- [ ] Después de publicar un listing, entrar al portal ML Chile y configurar el envío personalizado.
- [ ] El listing se publica con `shipping.mode: 'not_specified'` (operador define logística post-publish).
- [ ] **Importante**: si no se configura el envío, ML puede no mostrar el listing a compradores.

---

## Flujo de prueba controlada — paso a paso

### Paso 1: Evaluar producto
1. Ir a `/cj-ml-chile/products`
2. Buscar un producto CJ con stock conocido
3. Ingresar Variant ID (se obtiene del detalle del producto CJ)
4. Hacer click en **Evaluate (persistir)**
5. Verificar: `warehouseChileConfirmed: true` y decisión `APPROVED`
6. Si `NOT_VIABLE`: el producto no tiene warehouse Chile — buscar otro

### Paso 2: Seleccionar categoría ML
1. Usar el buscador de categorías que aparece post-evaluación
2. Click en **Sugerir** con el título del producto
3. Seleccionar la categoría más relevante de las sugerencias
4. Verificar el ID de categoría (ej: `MLC3975` para auriculares)
5. **No usar MLC9999** — el publish lo bloqueará

### Paso 3: Crear draft
1. Click en **Crear draft (MLC####)**
2. Ir a `/cj-ml-chile/listings`
3. Verificar que el listing aparece con status `DRAFT`
4. Verificar precio CLP y FX rate mostrados

### Paso 4: Revisar precio
1. Si aparece badge "FX stale", click en **Re-evaluar precio**
2. Verificar el nuevo precio con FX actualizado
3. Decidir si publicar con ese precio

### Paso 5: Publicar
1. Click en **Publicar en ML Chile**
2. Si error `CATEGORY_NOT_SET`: re-crear draft con categoría real
3. Si error `ML_CREDENTIALS_NOT_FOUND`: verificar credenciales ML
4. Si éxito: listing pasa a `ACTIVE` con ML ID asignado

### Paso 6: Configurar envío en ML
1. Ir al portal ML Chile con el ML ID obtenido
2. Configurar método de envío (ej: Chilexpress, Correos Chile, envío propio)
3. Configurar precio de envío si aplica

### Paso 7: Primera orden de prueba
1. Realizar una compra de prueba (account propio o test account si disponible)
2. **Opción A (sin webhook)**: copiar el ID de la orden en ML → ir a `/cj-ml-chile/orders` → **Importar**
3. **Opción B (con webhook configurado)**: la orden aparece automáticamente en DETECTED
4. Click en **Fetch de ML** para traer datos reales de la orden
5. Verificar: `totalCLP` poblado, listing vinculado, status `VALIDATED`

---

## Tabla REAL / ESTIMATED / DEFAULT / BLOCKED (estado actual)

| Campo | Estado | Valor/Fuente |
|-------|--------|-------------|
| supplierCostUsd | **REAL** | Precio CJ API en USD |
| shippingUsd CJ→Chile | **REAL** | freightCalculate CJ con postal=7500000 |
| IVA 19% | **REAL** | Régimen importaciones bajo valor Ley 21.271 |
| fxRate CLP/USD | **REAL** | fxService externo, TTL 1h, persistido en evaluación |
| FX staleness check | **REAL** | Guardrail 24h, badge en UI, reprice disponible |
| categoryId | **REAL** (operador) | ML Category Predictor + selección guiada en UI |
| listing_type_id | DEFAULT `gold_pro` | Tipo estándar MLC accesible para vendedores nuevos |
| shipping.mode | DEFAULT `not_specified` | Correcto para dropshipping; operador configura post-publish |
| ML fee (mlcFeePct) | **ESTIMADO** 12% | Default; varía por categoría. Configurable en Settings |
| Mercado Pago fee | **ESTIMADO** 5.18% | Default estándar MP. Configurable en Settings |
| incident buffer | **ESTIMADO** 2% | Default buffer riesgos. Configurable en Settings |
| profit por listing | **ESTIMADO** | Real solo cuando orden está COMPLETED |
| Webhook ML órdenes | **BLOQUEADO** portal | Operador debe configurar notification_url en portal ML |
| shipping post-publish | **BLOQUEADO** portal | Operador debe configurar en portal ML tras publicar |
| fulfillment CJ auto | **NO IMPLEMENTADO** | Órdenes requieren colocación manual en CJ |
| tracking sync | **PARCIAL** | Tabla existe, sync manual requerido |

---

## Guardrails activos

| Guardrail | Qué protege |
|-----------|-------------|
| `publish` bloquea si `categoryId === 'MLC9999'` | Evita publicación con categoría inválida |
| `draft` lanza `FX_RATE_MISSING` si evaluación sin tasa | Evita precio sin FX persistido |
| `draft` lanza `NOT_VIABLE` si sin warehouse CL | Evita dropshipping desde China a ML Chile |
| `fxStale` badge si FX > 24h | Alerta visual antes de publicar con precio viejo |
| `reprice` disponible para DRAFT y ACTIVE | Permite actualizar precio sin re-evaluar todo |
| Token ML requerido en publish | Error claro si credenciales no configuradas |

---

## Limitaciones conocidas del MVP (no bloqueantes para primera prueba)

1. **Un listing por evaluación** — multi-variante batch es fase futura
2. **No gestión de stock automática** — no se decrementa stock ML post-venta
3. **Fulfillment CJ manual** — operador debe colocar orden en CJ manualmente
4. **Sin repricing automático** — FX stale es guardrail informativo, no acción automática
5. **ML fee estimado** — 12% por defecto; fee real depende de categoría
6. **Webhook sin verificación de firma** — MVP acepta cualquier POST; agregar verificación en producción sostenida

---

## En caso de problema

| Error | Causa probable | Acción |
|-------|---------------|--------|
| `CATEGORY_NOT_SET` | Draft con MLC9999 | Re-crear draft con categoryId real |
| `ML_CREDENTIALS_NOT_FOUND` | Token ML no configurado | Conectar ML en Settings |
| `NOT_VIABLE` | Sin warehouse CL | Buscar otro producto |
| `FX_RATE_MISSING` | Evaluación sin tasa | Re-evaluar el producto |
| `FX stale` badge | FX > 24h | Usar "Re-evaluar precio" |
| Listing FAILED con error ML | Categoría inválida, título largo, etc | Ver `lastError` en UI + logs |
| Orden no aparece | Webhook no configurado | Importar manualmente por ID |
