# 🛒 P0.2: AliExpress Auto-Purchase Integration Status

**Fecha:** 2025-01-28  
**Prioridad:** P0 (Crítico)  
**Estado:** ✅ **IMPLEMENTED** - ⚠️ **REQUIRES PRODUCTION VALIDATION**

---

## ✅ IMPLEMENTACIÓN ACTUAL

### Código Existente

**Archivos:**
- `backend/src/services/aliexpress-auto-purchase.service.ts` (640+ líneas)
- `backend/src/services/automation.service.ts:417` - Integración en flujo automático
- `backend/src/services/autopilot.service.ts` - Integración en autopilot

### Funcionalidades Implementadas

1. **✅ Estrategia Dual:**
   - **Primero:** AliExpress Dropshipping API (preferido, más confiable)
   - **Fallback:** Puppeteer browser automation (stealth scraping)

2. **✅ Dropshipping API:**
   - `executePurchase()` intenta usar Dropshipping API primero
   - Credenciales vía `CredentialsManager` (tipo: `aliexpress-dropshipping`)
   - Soporta sandbox/production environments

3. **✅ Puppeteer Fallback:**
   - Login automático a AliExpress
   - Agregar producto al carrito
   - Checkout automático
   - Stealth mode (undetected-chromedriver compatible)

4. **✅ Validación de Capital:**
   - `automation.service.ts:309` - Valida capital antes de comprar
   - Fórmula: `availableCapital = totalCapital - pendingCost - approvedCost`
   - Falla si capital insuficiente

5. **✅ Guardrails y Kill-Switch:**
   - Workflow config `stagePurchase: 'manual' | 'automatic' | 'guided'`
   - Si `'manual'`, compras no se ejecutan automáticamente
   - Dry-run mode (si configurado)

6. **✅ Idempotencia:**
   - Verifica `PurchaseLog` existente antes de comprar
   - Usa `orderId` único para evitar duplicados

7. **✅ Logging y Tracking:**
   - `PurchaseLog` creado antes de comprar (estado: `PENDING`)
   - Actualizado a `SUCCESS` si compra exitosa
   - Guarda `supplierOrderId`, `trackingNumber`, `completedAt`

8. **✅ Retry Logic:**
   - Máximo 3 reintentos con backoff exponencial
   - Rollback si falla después de retries

---

## ⚠️ REQUIERE VALIDACIÓN EN PRODUCCIÓN

### Prerequisitos para Validación

1. **Opción A: AliExpress Dropshipping API (Preferido)**
   - Credenciales Dropshipping API
   - Configurar vía `CredentialsManager`:
   ```typescript
   await CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', {
     accessToken: '...',
     // ... otros campos
   }, 'production');
   ```

2. **Opción B: Puppeteer (Fallback)**
   - Credenciales AliExpress (email/password)
   - Chromium disponible (Puppeteer)
   - Puede requerir CAPTCHA manual (documentado)

---

## 🧪 CÓMO VALIDAR

### Test 1: Validación de Capital

**Prerequisitos:**
- Venta simulada (webhook)
- Capital configurado en `UserWorkflowConfig.workingCapital`
- `stagePurchase: 'automatic'`

**Simulación:**
```bash
# Webhook de venta
POST /api/webhooks/ebay
{
  "event": "sale",
  "orderId": "12345",
  "productId": 123,
  "items": [{
    "productId": 123,
    "quantity": 1,
    "price": 299.99
  }],
  "shipping": {
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "country": "US"
    }
  }
}
```

**Expected Logs:**
```
[AutomationService] Validando capital de trabajo
[AutomationService] Capital disponible: 500.00, Costo requerido: 200.00
[AutomationService] Capital suficiente, procediendo con compra automática
```

**Evidencia de código:**
- `backend/src/services/automation.service.ts:309` - Validación de capital
- `backend/src/services/autopilot.service.ts:754` - `getAvailableCapital()`

---

### Test 2: Compra Automática (Dropshipping API)

**Prerequisitos:**
- Credenciales Dropshipping API configuradas
- Capital suficiente
- `stagePurchase: 'automatic'`

**Expected Behavior:**
1. Venta recibida (webhook)
2. Capital validado
3. `PurchaseLog` creado (estado: `PENDING`)
4. `executePurchase()` ejecutado
5. Dropshipping API crea orden
6. `PurchaseLog` actualizado (estado: `SUCCESS`, `supplierOrderId`, `trackingNumber`)

**Expected DB State:**
```sql
SELECT * FROM "PurchaseLog" WHERE "orderId" = '12345';
-- status: 'SUCCESS'
-- supplierOrderId: 'AE123456789'
-- trackingNumber: 'LY123456789CN'
-- completedAt: <timestamp>
```

**Evidencia de código:**
- `backend/src/services/aliexpress-auto-purchase.service.ts:163` - `executePurchase()`
- `backend/src/services/automation.service.ts:417` - Integración

---

### Test 3: Compra Automática (Puppeteer Fallback)

**Prerequisitos:**
- NO hay credenciales Dropshipping API
- Credenciales AliExpress (email/password) configuradas
- Capital suficiente
- `stagePurchase: 'automatic'`

**Expected Behavior:**
1. Venta recibida
2. `executePurchase()` intenta Dropshipping API → falla
3. Fallback a Puppeteer
4. Login a AliExpress
5. Agregar producto al carrito
6. Checkout
7. `PurchaseLog` actualizado

**Nota:** Puede requerir CAPTCHA manual (ver manejo de CAPTCHA abajo)

**Evidencia de código:**
- `backend/src/services/aliexpress-auto-purchase.service.ts:210+` - Fallback a Puppeteer

---

### Test 4: Kill-Switch (Modo Manual)

**Prerequisitos:**
- `UserWorkflowConfig.stagePurchase = 'manual'`

**Expected Behavior:**
- Venta recibida → Sale creado
- Compra automática **NO se ejecuta**
- Notificación al usuario: "Venta recibida, requiere compra manual"

**Evidencia de código:**
- `backend/src/services/workflow-config.service.ts` - `getStageMode(userId, 'purchase')`
- `backend/src/services/automation.service.ts` - Verifica modo antes de comprar

---

### Test 5: Manejo de CAPTCHA

**Si CAPTCHA requerido:**
- Sistema debe detectar CAPTCHA
- Marcar `PurchaseLog` como `MANUAL_AUTH_REQUIRED`
- Notificar al usuario
- Usuario resuelve CAPTCHA manualmente
- Sistema retoma compra después

**Evidencia de código:**
- `backend/src/services/aliexpress-auto-purchase.service.ts` - Manejo de CAPTCHA (verificar implementación exacta)

---

## 📝 NOTAS Y LIMITACIONES

### Limitaciones Conocidas

1. **CAPTCHA Manual:**
   - AliExpress puede requerir CAPTCHA
   - Sistema debe manejar esto (verificar implementación)
   - Documentar proceso de resolución

2. **Rate Limits:**
   - AliExpress puede limitar requests
   - Sistema usa retries y delays (verificar si es suficiente)

3. **Sesión AliExpress:**
   - Puppeteer requiere mantener sesión activa
   - Si sesión expira, login debe reejecutarse

4. **Tracking:**
   - Tracking number puede no estar disponible inmediatamente
   - Sistema debe manejar actualización asíncrona

---

## ✅ DEFINITION OF DONE (DoD)

Para marcar como "validado":

- [ ] Credenciales configuradas (Dropshipping API O Puppeteer)
- [ ] Test: Validación de capital funciona correctamente
- [ ] Test: Compra automática funciona (Dropshipping API O Puppeteer)
- [ ] Test: `PurchaseLog` se actualiza correctamente
- [ ] Test: Kill-switch (modo manual) funciona
- [ ] Test: Manejo de CAPTCHA documentado y probado
- [ ] Test end-to-end: Venta → Compra automática → Tracking guardado

---

## 🔗 REFERENCIAS

- **Código:** `backend/src/services/aliexpress-auto-purchase.service.ts`
- **Integración:** `backend/src/services/automation.service.ts:417`
- **Capital Validation:** `backend/src/services/automation.service.ts:309`

---

**Última actualización:** 2025-01-28  
**Estado:** ⚠️ Implementado - Requiere validación producción

