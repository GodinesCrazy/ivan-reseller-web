# Opportunities duplicate import — UI flow

## Trace

| Step | Location |
|------|-----------|
| Botón Importar | `frontend/src/pages/Opportunities.tsx` → `importProduct` |
| Request | `POST /api/products` vía `api` (axios) |
| Éxito | `201` → `data.id` → toast éxito → `navigate('/products')` |
| Duplicado | `409` → **no** tratar como “falta ID” |

## UX implementada

- Función `handleDuplicateProductResponse` lee `existingProductId` (top-level o `details`).
- **Toast de error** con título `Ya está importado — producto #<id>`, descripción con mensaje del backend + título existente + texto claro de que no se duplicó.
- **Acción primaria:** “Abrir producto” → `/products/<id>/preview`.
- **Acción secundaria (cancel):** “Ir a Productos” → `/products`.
- Misma lógica en `createAndPublishProduct` para el paso de creación (antes de publicar).

## Anti-patrón evitado

No lanzar ni mostrar *“No se pudo obtener el ID del producto creado”* cuando la respuesta es un **409 de duplicado** (axios entra en `catch` antes de leer `id` de un 201; el mensaje genérico confundía si algún proxy devolvía cuerpo ambiguo).

## Resiliencia

Si en el futuro el backend respondiera `2xx` con `success: false` y `existingProductId`, el flujo también llama a `handleDuplicateProductResponse` antes de validar `id`.
