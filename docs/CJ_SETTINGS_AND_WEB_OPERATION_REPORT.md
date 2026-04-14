# CJ — Configuración web, credenciales y operación (informe)

**Fecha:** 2026-04-14  
**Alcance:** administración segura de la CJ API Key desde la UI, test de conexión integrado con el sistema de credenciales, enmascarado en API, flujo operador y pruebas ejecutadas.

---

## 1. Resumen ejecutivo

Se integró **CJ Dropshipping** en el **mismo sistema de credenciales** que el resto del producto (`ApiCredential` + `CredentialsManager`), con **endpoints estándar** (`GET/POST /api/credentials`, `POST /api/credentials/cj-dropshipping/test`), **sin devolver la API key completa al navegador** (máscara `****` + últimos 4 caracteres vía `maskSecretTailFour`), y **test de conexión real** (`authentication/getAccessToken` + `setting/get`) reutilizando `testCjDropshippingConnectionWithApiKey` en el adapter.

La **UI de integraciones** (`/api-settings`) incluye tarjeta **CJ Dropshipping API** con campo de clave, guardado, borrado/toggle según el resto de APIs, y **Probar conexión** (incl. prueba automática tras guardar, alineada a eBay/ML).

El **flujo operador** en Listings/órdenes CJ enlaza explícitamente la **configuración en API / integraciones**.

**Veredicto:** **GO CONDICIONAL** — listo para uso real una vez validada una CJ API Key en el entorno objetivo; no se ejecutó smoke contra producción CJ en esta pasada automatizada.

**Porcentaje actualizado (flujo CJ completo: credenciales web + pipeline + postventa técnica): ~94%**  
(El gap principal sigue siendo **validación de negocio** en cuenta CJ real y políticas de pago/publicación, no el cableado de settings.)

---

## 2. Estado previo

- CJ ya resolvía API key vía `ApiCredential` `apiName` **`cj-dropshipping`** o variables de entorno `CJ_API_KEY` / `CJ_DROPSHIPPING_API_KEY`.
- No había entrada dedicada en **`/api/settings/apis`** ni tarjeta consistente en **`APISettings`** para CJ.
- `POST /api/credentials/:apiName/test` **no tenía** rama `cj-dropshipping` y caía en **Invalid API name**.

---

## 3. Qué se implementó

| Área | Detalle |
|------|---------|
| Resolver de nombres | `cj-dropshipping` y alias (`cj`, `cj_dropshipping`, …) en `api-name-resolver.ts`. |
| Validación | `CredentialsManager.validateCredentials` exige `apiKey` para `cj-dropshipping`. |
| Test real | `testCjDropshippingConnectionWithApiKey` en `cj-supplier.adapter.ts`; `checkCjDropshippingAPI` en `api-availability.service.ts` (incluido en `getAllAPIStatus`). |
| Rutas credenciales | Máscara en `GET /api/credentials/:apiName` para CJ; `POST .../test` con credenciales guardadas o **temporales** (prueba real antes de guardar). |
| Cola health | `api-health-check-queue.service.ts`: caso `cj-dropshipping`. |
| Settings API catalog | Entrada en `settings.routes.ts` + `API_NAMES` / `API_IDS` en `api-keys.config.ts`. |
| Frontend | `API_DEFINITIONS['cj-dropshipping']`, mapeo `CJ_API_KEY` → `apiKey`, APIs esenciales, test automático tras guardar. |
| UX | `CjEbayOperatorPathCallout`: enlace a `/api-settings` para credencial CJ. |

---

## 4. Cómo funciona la configuración web/admin

1. El usuario abre **`/api-settings`** (rol admin o user según permisos de credenciales globales).
2. Completa **CJ API Key** y guarda → `POST /api/credentials` con `apiName: 'cj-dropshipping'` y `credentials: { apiKey }` (cifrado en BD como el resto).
3. **GET** de credenciales devuelve `apiKey` **solo enmascarada** (`****abcd`).
4. **Probar conexión** llama a `POST /api/credentials/cj-dropshipping/test` (o el nombre alias resuelto), que ejecuta el check de disponibilidad o la prueba con credenciales del formulario.

---

## 5. Cómo se protege la API key

- Almacenamiento: **misma ruta** que otras APIs (`ApiCredential`, cifrado).
- Respuestas HTTP: **máscara** para `cj-dropshipping` en GET de credenciales.
- Logs: ya se usaban cuerpos redactados en el cliente HTTP CJ; guardado usa `redactSensitiveData` en logs de POST.
- **No** se incluye la clave en el informe ni en ejemplos.

---

## 6. Test connection

- **Con clave guardada o solo env:** `checkCjDropshippingAPI` usa `getUserCredentials` → incluye **fallback de env** vía `getCredentialEntry`.
- **Con clave temporal (formulario):** validación de formato + llamada real `testCjDropshippingConnectionWithApiKey` **antes** del retorno genérico “credenciales válidas”.
- Misma semántica que `POST /api/cj-ebay/cj/test-connection` (verify auth), pero **integrada** en el flujo estándar de integraciones.

---

## 7. Flujo web/admin-user (CJ → eBay)

1. **Credenciales:** `/api-settings` → CJ Dropshipping API → guardar → probar conexión.  
2. **Oportunidades / Product Research:** draft / publicar (ya documentado en informes previos).  
3. **Listings:** `/cj-ebay/listings` — estado de borrador/publicación.  
4. **Postventa vertical:** `/cj-ebay/orders`.  
5. **Orders globales:** `/orders` — puede mostrar metadata `supplier=cj` si el sync emparejó SKU (complementario).

---

## 8. Archivos modificados (principal)

- `backend/src/utils/api-name-resolver.ts`
- `backend/src/utils/redact.ts` (`maskSecretTailFour`)
- `backend/src/services/credentials-manager.service.ts`
- `backend/src/services/api-availability.service.ts`
- `backend/src/services/api-health-check-queue.service.ts`
- `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.ts`
- `backend/src/api/routes/api-credentials.routes.ts`
- `backend/src/config/api-keys.config.ts`
- `backend/src/routes/settings.routes.ts`
- `frontend/src/pages/APISettings.tsx`
- `frontend/src/components/cj-ebay/CjEbayOperatorPathCallout.tsx`

---

## 9. Migraciones

**Ninguna.** Se reutiliza el modelo `ApiCredential` existente.

---

## 10. Pruebas ejecutadas

| Prueba | Resultado |
|--------|-----------|
| `npm run type-check` (backend) | OK |
| `npm run type-check` (frontend) | OK |
| Smoke API real CJ | No ejecutado (requiere API key válida en el entorno del agente). |

**Validación manual recomendada:** guardar clave en `/api-settings`, comprobar que la respuesta GET muestra solo máscara, ejecutar “Probar conexión”, publicar un draft CJ→eBay de prueba.

---

## 11. Veredicto

**GO CONDICIONAL** — integración de producto coherente con el resto de credenciales; falta evidencia runtime con cuenta CJ real en el despliegue objetivo.

---

## 12. Riesgos residuales

- **Precedencia:** credenciales en BD (user/global) **antes** que variables de entorno, por diseño de `getCredentialEntry`.
- **Rate limits CJ:** el test real consume cuota; no abusar del botón en producción.
- **Redis/BullMQ:** si Redis no está disponible, el health check encolado puede degradarse (igual que otras APIs).

---

## 13. Origen de credenciales (resumen)

| Origen | Uso |
|--------|-----|
| `ApiCredential` `cj-dropshipping` (user o global) | Preferido para multi-tenant y auditoría. |
| `CJ_API_KEY` / `CJ_DROPSHIPPING_API_KEY` en entorno backend | Fallback si no hay fila activa o como respaldo operativo en despliegues controlados. |
