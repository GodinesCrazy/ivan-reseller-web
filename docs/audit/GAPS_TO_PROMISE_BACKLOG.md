# 🎯 GAPS TO PROMISE BACKLOG
## Priorización P0/P1/P2 para Alcanzar "Promise-Ready"

**Fecha:** 2025-01-28  
**Objetivo:** Identificar gaps específicos y acciones concretas para que la promesa (claims A-E) sea 100% verdadera

---

## 📊 RESUMEN EJECUTIVO

| Prioridad | Count | Estado |
|-----------|-------|--------|
| **P0 (Crítico)** | 2 | Requiere atención inmediata |
| **P1 (Alto)** | 3 | Importante para producción |
| **P2 (Medio)** | 2 | Mejoras y optimizaciones |

---

## 🚨 P0 - CRÍTICO (Debe completarse antes de "Promise-Ready")

### P0.1: Validación y Testing Completo de Amazon SP-API

**Gap identificado:**
- Amazon SP-API está implementado (`backend/src/services/amazon.service.ts`)
- **NO se ha validado en producción** con credenciales reales
- Requiere aprobación de aplicación (5-7 días)
- Requiere Professional Seller account ($39.99/mes)

**Impacto:**
- ⚠️ **Claim C (Publicación simultánea)** no es 100% verdadero sin Amazon validado

**Evidencia de código:**
- `backend/src/services/amazon.service.ts:63` - Clase `AmazonService`
- `backend/src/services/marketplace.service.ts:388` - Integración en `publishProduct`

**Acciones requeridas:**

1. **Obtener credenciales reales de Amazon SP-API:**
   - Crear Professional Seller account
   - Crear aplicación en Amazon Developer Console
   - Solicitar aprobación (5-7 días)
   - Obtener `clientId`, `clientSecret`, `refreshToken`

2. **Validar integración completa:**
   - `testConnection()` debe retornar `success: true`
   - `createListing()` debe crear listing real en Amazon
   - Verificar que `listingId` (ASIN) se retorna correctamente
   - Verificar que `listingUrl` es válida

3. **Testing end-to-end:**
   - Publicar producto real en Amazon sandbox
   - Verificar que aparece en seller central
   - Publicar en producción (si sandbox OK)

4. **Documentación:**
   - Crear `docs/audit/P0_AMAZON_STATUS.md` con resultados
   - Documentar pasos de configuración
   - Documentar limitaciones conocidas

**Estimación:** 1-2 semanas (incluyendo tiempo de aprobación Amazon)

**DoD (Definition of Done):**
- [ ] Credenciales Amazon SP-API configuradas y validadas
- [ ] `testConnection()` retorna `success: true` en sandbox y production
- [ ] `createListing()` crea listing real en Amazon
- [ ] Test end-to-end: Publicación simultánea (eBay + Amazon + ML) funciona
- [ ] Documentación completa en `docs/audit/P0_AMAZON_STATUS.md`

---

### P0.2: Validación de AliExpress Auto-Purchase en Producción

**Gap identificado:**
- AliExpress Auto-Purchase está implementado (`backend/src/services/aliexpress-auto-purchase.service.ts`)
- Usa dos estrategias: Dropshipping API (preferido) y Puppeteer (fallback)
- **NO se ha validado compra real en producción** con sesión activa
- Puede requerir CAPTCHA manual (documentado pero no completamente manejado)

**Impacto:**
- ⚠️ **Claim D (Auto-purchase)** funciona en teoría pero necesita validación real

**Evidencia de código:**
- `backend/src/services/aliexpress-auto-purchase.service.ts:163` - `executePurchase`
- `backend/src/services/automation.service.ts:417` - Integración en flujo automático

**Acciones requeridas:**

1. **Validar Dropshipping API:**
   - Obtener credenciales AliExpress Dropshipping API
   - Configurar en `CredentialsManager` (tipo: `aliexpress-dropshipping`)
   - Test: `executePurchase()` con API debe crear orden real

2. **Validar Puppeteer fallback:**
   - Si API no disponible, validar que Puppeteer funciona
   - Test: Login a AliExpress, agregar al carrito, checkout
   - Manejar CAPTCHA manual (documentar proceso)

3. **Testing end-to-end:**
   - Simular venta (webhook)
   - Verificar que compra automática se ejecuta
   - Verificar que `PurchaseLog` se actualiza con `status: 'SUCCESS'`
   - Verificar que tracking number se guarda

4. **Mejorar manejo de CAPTCHA:**
   - Si CAPTCHA requerido, marcar como `MANUAL_AUTH_REQUIRED`
   - Notificar al usuario para intervención manual
   - Documentar proceso de resolución

5. **Documentación:**
   - Crear `docs/audit/P0_ALIEXPRESS_STATUS.md` con resultados
   - Documentar estrategia dual (API vs Puppeteer)
   - Documentar manejo de CAPTCHA

**Estimación:** 1 semana

**DoD:**
- [ ] Dropshipping API validado O Puppeteer validado
- [ ] Test end-to-end: Compra automática funciona con venta real
- [ ] Manejo de CAPTCHA documentado y probado
- [ ] Documentación completa en `docs/audit/P0_ALIEXPRESS_STATUS.md`

---

## 🔴 P1 - ALTO (Importante para producción robusta)

### P1.1: Validación de MercadoLibre en Producción (Multi-Country)

**Gap identificado:**
- MercadoLibre está implementado (`backend/src/services/mercadolibre.service.ts`)
- Soporta múltiples países (Argentina, Brasil, México, etc.)
- **NO se ha validado en todos los países objetivo**
- OAuth flow puede variar por país

**Impacto:**
- ⚠️ **Claim C (Publicación simultánea)** funciona pero no validado en todos los países

**Acciones requeridas:**

1. **Validar OAuth por país:**
   - Test: OAuth flow en Argentina (MLA)
   - Test: OAuth flow en Brasil (MLB)
   - Test: OAuth flow en México (MLM)
   - Documentar diferencias si las hay

2. **Validar publicación por país:**
   - Test: `createListing()` en cada país
   - Verificar que categorías se asignan correctamente
   - Verificar que precios se convierten correctamente (moneda)

3. **Testing end-to-end:**
   - Publicar producto simultáneamente en eBay + ML Argentina + ML Brasil
   - Verificar que todos los listings se crean correctamente

4. **Documentación:**
   - Documentar países soportados
   - Documentar diferencias por país (si las hay)
   - Actualizar `docs/audit/P0_MERCADOLIBRE_STATUS.md` (si se crea)

**Estimación:** 3-5 días

**DoD:**
- [ ] OAuth validado en al menos 2 países (ej: Argentina, México)
- [ ] Publicación validada en al menos 2 países
- [ ] Documentación actualizada

---

### P1.2: Validación de Google Trends/SerpAPI en Producción

**Gap identificado:**
- Google Trends está implementado (`backend/src/services/google-trends.service.ts`)
- Usa SerpAPI como fuente principal
- **NO se ha validado con API key real en producción**
- Si falla, sistema continúa pero con baja confianza (correcto)

**Impacto:**
- ⚠️ **Claim A (Búsqueda con Google Trends)** funciona pero no validado completamente

**Acciones requeridas:**

1. **Obtener SerpAPI key:**
   - Crear cuenta en SerpAPI
   - Obtener API key
   - Configurar en `CredentialsManager` (tipo: `serpapi`)

2. **Validar integración:**
   - Test: `validateProductViability()` con API key real
   - Verificar que `searchVolume`, `trend`, `viable` se retornan correctamente
   - Verificar que falla gracefully si API key inválida

3. **Testing end-to-end:**
   - Búsqueda de oportunidades con Google Trends habilitado
   - Verificar que items con baja demanda se descartan
   - Verificar que items con alta demanda tienen alta confianza

4. **Documentación:**
   - Documentar configuración de SerpAPI
   - Documentar fallback si no está configurado
   - Actualizar `docs/audit/P0_GOOGLE_TRENDS_STATUS.md` (si se crea)

**Estimación:** 2-3 días

**DoD:**
- [ ] SerpAPI key configurada y validada
- [ ] `validateProductViability()` retorna datos reales
- [ ] Test end-to-end: Búsqueda con Google Trends funciona
- [ ] Documentación actualizada

---

### P1.3: Validación de PayPal Payouts en Sandbox y Producción

**Gap identificado:**
- PayPal Payouts está implementado (`backend/src/services/paypal-payout.service.ts`)
- **NO se ha validado payout real en sandbox**
- Requiere aprobación de PayPal Payouts en producción (1-2 días)
- Costos: $0.25 USD por pago

**Impacto:**
- ⚠️ **Claim E (Pagos automáticos)** funciona pero no validado completamente

**Acciones requeridas:**

1. **Validar en Sandbox:**
   - Crear cuenta PayPal Developer
   - Obtener `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` (sandbox)
   - Test: `sendPayout()` con cuenta de prueba
   - Verificar que dinero aparece en cuenta de prueba

2. **Solicitar aprobación Producción:**
   - Si sandbox OK, solicitar aprobación de Payouts en producción
   - Tiempo estimado: 1-2 días

3. **Validar en Producción:**
   - Test: `sendPayout()` con cuenta real (pequeño monto)
   - Verificar que `batchId` y `transactionId` se guardan
   - Verificar que comisión se marca como `PAID`

4. **Testing end-to-end:**
   - Crear comisión manualmente
   - Ejecutar `processCommissions()` (manual o cron)
   - Verificar que payout se envía
   - Verificar que comisión se actualiza a `PAID`

5. **Documentación:**
   - Documentar configuración PayPal
   - Documentar proceso de aprobación
   - Documentar costos ($0.25 por pago)
   - Actualizar `docs/audit/P0_PAYPAL_STATUS.md` (si se crea)

**Estimación:** 3-5 días (incluyendo tiempo de aprobación)

**DoD:**
- [ ] PayPal Payouts validado en sandbox
- [ ] Payout real enviado en sandbox, dinero recibido
- [ ] Aprobación producción solicitada (o completada)
- [ ] Test end-to-end: Procesamiento automático de comisiones funciona
- [ ] Documentación completa

---

## 🟡 P2 - MEDIO (Mejoras y optimizaciones)

### P2.1: Mejora de Análisis de Competencia (Amazon SP-API)

**Gap identificado:**
- Análisis de competencia usa eBay principalmente
- Amazon SP-API tiene método `searchCatalog()` pero no se usa en análisis
- **NO se analiza competencia de Amazon** en búsqueda de oportunidades

**Impacto:**
- ⚠️ **Claim B (Análisis de rentabilidad)** no incluye competencia de Amazon

**Acciones requeridas:**

1. **Integrar Amazon SP-API en análisis:**
   - Usar `amazon.service.ts:searchCatalog()` en `competitor-analyzer.service.ts`
   - Agregar análisis de precios de Amazon
   - Agregar `competitionLevel` basado en Amazon también

2. **Testing:**
   - Test: Análisis de competencia incluye Amazon
   - Verificar que precios de Amazon se muestran en `marketplacePrices`

**Estimación:** 2-3 días

**DoD:**
- [ ] Análisis de competencia incluye Amazon
- [ ] Precios de Amazon se muestran en resultados de búsqueda
- [ ] Test validado

---

### P2.2: Optimización de Búsqueda de Oportunidades (Caching)

**Gap identificado:**
- Búsqueda de oportunidades puede ser lenta (scraping + IA + Trends)
- **NO hay caching** de resultados
- Múltiples búsquedas del mismo query ejecutan todo de nuevo

**Impacto:**
- ⚠️ UX mejorable (búsquedas repetidas son lentas)

**Acciones requeridas:**

1. **Implementar caching:**
   - Cachear resultados de búsqueda por query + marketplaces (TTL: 1 hora)
   - Usar Redis para caching
   - Invalidar cache cuando haya nuevas oportunidades

2. **Testing:**
   - Test: Primera búsqueda es lenta, segunda es rápida (cache hit)
   - Verificar que cache se invalida correctamente

**Estimación:** 2-3 días

**DoD:**
- [ ] Caching implementado (Redis)
- [ ] Búsquedas repetidas son más rápidas
- [ ] Test validado

---

## 📊 MATRIZ DE PRIORIZACIÓN

| Gap | Prioridad | Impacto | Esfuerzo | Bloquea Promise-Ready? |
|-----|-----------|---------|----------|------------------------|
| P0.1: Amazon SP-API | P0 | Alto | Alto | ⚠️ Sí (Claim C) |
| P0.2: AliExpress Auto-Purchase | P0 | Alto | Medio | ⚠️ Sí (Claim D) |
| P1.1: MercadoLibre Multi-Country | P1 | Medio | Bajo | ❌ No |
| P1.2: Google Trends/SerpAPI | P1 | Medio | Bajo | ❌ No (fallback OK) |
| P1.3: PayPal Payouts | P1 | Alto | Medio | ❌ No (funciona sin validar) |
| P2.1: Análisis Competencia Amazon | P2 | Bajo | Bajo | ❌ No |
| P2.2: Caching Búsquedas | P2 | Bajo | Bajo | ❌ No |

---

## 🎯 DECISIÓN: PROMISE-READY STATUS

### Estado Actual: ⚠️ **PARTIAL PROMISE-READY**

**Razones:**
1. ✅ Claims A, B, E están **funcionando** (con validaciones pendientes)
2. ⚠️ Claim C requiere **P0.1 (Amazon SP-API)** completado
3. ⚠️ Claim D requiere **P0.2 (AliExpress Auto-Purchase)** validado

### Después de P0:
**Estado esperado:** ✅ **FULL PROMISE-READY**

**Razones:**
- Todos los claims tendrán evidencia de funcionamiento real
- Integraciones críticas validadas en producción
- Documentación completa de estado y limitaciones

---

## 📝 NOTAS FINALES

- **P0 es crítico** para alcanzar "Promise-Ready"
- **P1 es importante** para producción robusta pero no bloquea
- **P2 es mejoras** que pueden hacerse después

**Recomendación:** Completar P0 antes de marcar como "Promise-Ready", luego P1 según disponibilidad, P2 como mejoras continuas.

---

**Última actualización:** 2025-01-28  
**Próximo paso:** ETAPA 2 - Completar P0 (Amazon SP-API y AliExpress Auto-Purchase)

