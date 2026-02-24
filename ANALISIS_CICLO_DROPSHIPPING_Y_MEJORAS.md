# Análisis del Ciclo de Dropshipping ? Salida y Propuestas de Mejora

**Fecha:** 19 de febrero de 2025  
**Origen:** `npm run test:dropshipping-cycle`

---

## 1. Resumen de la salida

### Stages que pasaron (real)
| Stage | Estado | Descripción |
|-------|--------|-------------|
| trends | ? (real) | API de tendencias funcionando |
| aliexpressSearch | ? (real) | Búsqueda AliExpress OK |
| pricing | ? (real) | Cálculo de precios OK |
| marketplaceCompare | ? (real) | Comparativa de marketplace OK |
| sale | ? (real) | Creación de orden en DB OK |

### Stages en fallback/skip
| Stage | Estado | Causa |
|-------|--------|-------|
| publish | ? (fallback/skip) | eBay no validado como "real" (falta OAuth o conexión) |
| paypalCapture | ? | **401 Unauthorized** ? create failed |
| aliexpressPurchase | ? | Depende de paypalCapture |
| tracking | ? | Depende de aliexpressPurchase |
| accounting | ? | Depende de order completado |

### Diagnóstico principal
```
paypalCapture: create failed
Request failed with status code 401
```

**Causa:** La API de PayPal está devolviendo 401 (no autorizado). Suele deberse a:
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` de sandbox usados en modo live (o al revés)
- Credenciales caducadas o incorrectas
- `PAYPAL_MODE` no coincide con el tipo de credenciales (sandbox/live)

---

## 2. Propuestas de mejora

### A) Corregir el error 401 de PayPal

**Acción inmediata (configuración):**
1. Revisar en `.env.local` o Railway:
   - `PAYPAL_MODE` = `sandbox` o `live` según las credenciales
   - `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` del mismo entorno (developer.paypal.com ? Apps ? Sandbox o Live)
2. Si usas sandbox, asegurarte de usar las credenciales de la app **Sandbox**, no las de Live.

**Mejora en código (opcional):**
- A?adir un endpoint de verificación PayPal (`GET /api/health/paypal`) que valide credenciales sin crear órdenes.
- Mejorar el mensaje de error cuando PayPal devuelve 401: incluir hint sobre sandbox vs live.

---

### B) Mejorar el stage publish (eBay)

**Estado actual:** publish está en fallback (no se valida como "real").

**Propuestas:**
1. Completar OAuth de eBay en la web: Settings ? APIs ? eBay ? Conectar.
2. Comprobar que en la base de datos o en variables de entorno existan `EBAY_OAUTH_TOKEN` o `EBAY_REFRESH_TOKEN`.
3. En el test, documentar qué implica "real" para publish (eBay API conectada y validada).

---

### C) Mejorar mensajes del test

**En el script `test-full-dropshipping-cycle.ts`:**
- Cuando paypalCapture falle con 401, a?adir un mensaje como:
  ```
  ?? PayPal 401: Verifica PAYPAL_MODE (sandbox/live) y que CLIENT_ID/SECRET 
     correspondan al mismo entorno en developer.paypal.com
  ```
- Sugerir comandos o pasos para verificar PayPal y eBay antes del ciclo completo.

---

### D) Pre-flight check de credenciales (opcional)

A?adir un script o flag que, antes del ciclo completo:
1. Verifique PayPal: intento de crear orden en modo dry-run o health check.
2. Verifique eBay: validación de conexión.
3. Liste qué está OK y qué falta.

Ejemplo:
```bash
npm run check:credentials
# PayPal: OK | eBay: OAuth pendiente | AliExpress: OK | Trends: OK
```

---

### E) Web y backend ? funcionamiento correcto

**Web (frontend):**
- El test no valida la web. Para asegurar que funciona:
  - Probar login, dashboard, oportunidades, productos, autopilot, checkout.
  - Revisar consola del navegador (errores JS, CORS, 401/403).

**Backend:**
- Boot correcto (según `Windows PowerShell.txt`).
- Servicios cargados: AliExpress Affiliate, Autopilot, PayPal, etc.
- CORS configurado para localhost y ivanreseller.com.

**Recomendaciones:**
1. Probar flujo completo en local: login ? buscar oportunidades ? crear producto ? checkout (con PayPal sandbox).
2. Verificar que el proxy de Vercel en producción apunte bien al backend de Railway.

---

## 3. Checklist para éxito del ciclo completo

| Requisito | Estado | Acción |
|-----------|--------|--------|
| DATABASE_URL | ? | - |
| INTERNAL_RUN_SECRET | ? | - |
| AliExpress (Affiliate/Scraper) | ? | - |
| Trends API | ? | - |
| eBay OAuth | ?? fallback | Completar OAuth en Settings |
| PayPal credentials | ? 401 | Revisar PAYPAL_MODE y credenciales |
| PayPal capture | ? | Corregir 401 primero |

---

## 4. Orden sugerido de implementación

1. **Corregir PayPal 401** (configuración + posible mejora de mensajes).
2. **Completar eBay OAuth** para que publish sea "real".
3. **Ajustar mensajes del script** de test para errores 401 y casos típicos.
4. **Opcional:** A?adir `check:credentials` o endpoint de health para PayPal/eBay.
5. **Validación manual:** Probar web y backend de punta a punta en local y en producción.

---

*Documento generado a partir del análisis de la salida del ciclo de dropshipping.*
