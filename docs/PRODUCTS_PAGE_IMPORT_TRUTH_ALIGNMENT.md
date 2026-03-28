# Products page — alignment with opportunity import truth

## Cómo Products obtiene el estado

`GET /api/products` enriquece cada fila con `getProductValidationSnapshot` (`backend/src/api/routes/products.routes.ts`):

- `validationState` / `blockedReasons` vienen del snapshot de catálogo + `status` en DB.

## Ajuste de UI

- Nuevo código de bloqueo **`preventiveAuditPending`** con etiqueta en español en `frontend/src/pages/Products.tsx` (`formatBlockedReason`), para distinguir “auditoría preventiva pendiente tras import” de `policyIncomplete` genérico.

## Comportamiento esperado tras el fix

1. **Import desde Opportunities** con credenciales Affiliate: fila suele mostrar `BLOCKED` con menos ruido falso (`supplierUnavailable` / `invalidMarketplaceContext` por JSON mal colocado ya no debería aparecer por el mismo defecto).
2. **`missingSku` / `missingShipping`**: solo si la API no devolvió datos o el ítem no es resoluble — estados honestos, no “caparazón” por mapeo roto.
3. **`LEGACY_UNVERIFIED`**: no debería aparecer **solo** por envío = 0 cuando el resto del contexto máquina está completo; sigue siendo válido para catálogo congelado u otras reglas de negocio.

## Lectura de “TRUTH OPERATIONAL”

El panel de verdad operativa (operations-truth) sigue derivando bloqueadores a partir de `getProductValidationSnapshot` y metadatos; al corregir raíz de `productData` y columnas `aliexpressSku` / `shippingCost`, la fila refleja mejor la realidad importada.
