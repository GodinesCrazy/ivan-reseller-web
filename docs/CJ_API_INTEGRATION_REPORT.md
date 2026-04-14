# CJ Open API — Informe de integración (backend)

**Fecha:** 2026-04-13  
**Alcance:** lectura de API key desde `APIS2.txt` (local, gitignored), variables de entorno canónicas, reutilización del cliente/adapter existente (`cj-ebay` / `cj-dropshipping`), smoke test.  
**Sin** hardcode de secretos en código fuente; **sin** subir `.env` ni `APIS2.txt` al repositorio.

---

## 1. Resumen ejecutivo

- Se integró la variable canónica **`CJ_API_KEY`** como alias preferido frente a **`CJ_DROPSHIPPING_API_KEY`**, reutilizando **`CredentialsManager`** y el flujo ya existente en **`CjSupplierAdapter`** (token en memoria por `userId`, refresh, throttling, timeouts vía `fetch` + `AbortSignal.timeout`).
- Se añadió un script para copiar la clave desde **`APIS2.txt`** (raíz del monorepo, línea `CJ Key : …`) hacia **`backend/.env`** sin imprimir el valor completo.
- El smoke **`npm run cj-api:smoke`** confirmó **`authentication/getAccessToken`** correcto (access + refresh + fechas parseables). Las llamadas autenticadas probadas (`setting/get`, `product/query`) devolvieron **HTTP 500** en el entorno y momento de la prueba → resultado declarado **PARTIAL-GO** hasta verificar con CJ o repetir en otra ventana temporal.

---

## 2. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/src/services/credentials-manager.service.ts` | `CJ_API_KEY` antes que `CJ_DROPSHIPPING_API_KEY` en env fallback y normalización `cj-dropshipping`. |
| `backend/src/config/env.ts` | Variables opcionales documentadas: `CJ_API_KEY`, `CJ_DROPSHIPPING_API_KEY`. |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.ts` | Mensaje de error actualizado (menciona `CJ_API_KEY`). |
| `backend/src/modules/cj-ebay/services/cj-ebay-system-readiness.service.ts` | Hint de readiness alineado con `CJ_API_KEY`. |
| `backend/.env.example` | Comentarios para `CJ_API_KEY` y alias legacy. |
| `backend/package.json` | Scripts `cj-api:sync-from-apis2`, `cj-api:smoke`. |
| `backend/scripts/sync-cj-api-key-from-apis2.ts` | **Nuevo** — sync desde `APIS2.txt` → `.env`. |
| `backend/scripts/cj-api-smoke.ts` | **Nuevo** — prueba token + llamadas autenticadas (sin loguear tokens). |
| `docs/CJ_API_INTEGRATION_REPORT.md` | Este informe. |

**Archivo local no versionado:** `backend/.env` (actualizado por el script de sync; contiene secretos).

---

## 3. Variables de entorno

| Variable | Uso | Valor en informe |
|----------|-----|------------------|
| `CJ_API_KEY` | Canónica; preferida | *(valor solo en `.env`; no documentar aquí)* |
| `CJ_DROPSHIPPING_API_KEY` | Alias legacy; mismo valor que `CJ_API_KEY` si se usa sync | *(idem)* |
| `ENABLE_CJ_EBAY_MODULE` | Expone `/api/cj-ebay/*` | Sin cambio en esta tarea |

Los valores completos solo residen en **`backend/.env`** y **`APIS2.txt`** (ambos excluidos por `.gitignore` en la raíz).

---

## 4. Flujo implementado (sin duplicar arquitectura)

1. **`CJ_API_KEY`** / **`CJ_DROPSHIPPING_API_KEY`** → `CredentialsManager.loadFromEnv` / `normalizeCredentialShape` para `apiName` **`cj-dropshipping`**.
2. **`CjSupplierAdapter.ensureAccessToken`** (existente): `getAccessToken` → caché en memoria `Map<userId:env, …>`; refresh con `refreshAccessToken`; sin exponer tokens al frontend.
3. **`verifyAuth`** (existente): token + `POST setting/get` (comportamiento ya usado por **`POST /api/cj-ebay/cj/test-connection`**).
4. **Producción multi-instancia:** la caché es en memoria por proceso; para compartir entre réplicas haría falta Redis u otro store (no implementado en este cambio).

---

## 5. Pruebas ejecutadas

```bash
cd backend
npm run cj-api:sync-from-apis2
npm run cj-api:smoke
npx tsc --noEmit
```

**Resultado smoke (resumen):**

- `getAccessToken`: OK; `accessToken` y `refreshToken` presentes (longitudes logueadas, no valores).
- `accessTokenExpiryDate` / `refreshTokenExpiryDate`: parseables.
- `setting/get` y `product/query` autenticados: **CJ HTTP 500** en la corrida.
- `adapter.verifyAuth`: falló con **CJ HTTP 500** (misma familia de error).

---

## 6. Resultado GO / NO-GO

| Criterio | Estado |
|----------|--------|
| Clave leída desde `APIS2.txt` y escrita en `.env` local | **GO** |
| Sin secretos en código/commit | **GO** |
| Backend obtiene tokens reales vía API oficial (`getAccessToken`) | **GO** |
| Llamadas autenticadas de verificación en CJ | **NO-GO / degradado** (HTTP 500 en el momento de prueba) |
| Pruebas ejecutadas de verdad | **GO** |
| Informe en `docs/` | **GO** |

**Veredicto global:** **PARTIAL-GO** — integración de configuración y capa de token **operativa**; validación end-to-end contra endpoints autenticados **pendiente** de estabilidad CJ o revisión de cuenta/API.

---

## 7. Próximos pasos sugeridos

1. Reintentar `npm run cj-api:smoke` o `POST /api/cj-ebay/cj/test-connection` más tarde; si persiste 500, abrir ticket con CJ (incluir hora UTC, sin pegar tokens).
2. **Product sync / inventory / orders / tracking:** ya hay módulo `cj-ebay` y adapter oficial; continuar sobre **`CjSupplierAdapter`** y rutas existentes.
3. Opcional: persistir refresh token por usuario en `ApiCredential` cifrado para menos `getAccessToken` (diseño de producto; no hecho aquí).

---

*Fin del informe.*
