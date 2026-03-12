# eBay: Cumplimiento de políticas

Este documento resume las reglas de eBay aplicadas por el software para evitar errores de publicación (p. ej. error 25019 "improper words") y bloqueos.

---

## Título

### Límite de caracteres

- **Máximo 80 caracteres** por título. eBay rechaza títulos más largos.

El software aplica `sanitizeTitleForEbay` (backend/src/utils/compliance/index.ts) que trunca automáticamente a 80 caracteres.

### Política de propiedad intelectual (IP)

- **No usar:** "tipo X", "símil X", "réplica", "idéntico a", "igual a" para referirse a marcas registradas.
- **Usar en su lugar:** "compatible con X" o variantes equivalentes.

`sanitizeTitleForEbay` aplica estas sustituciones automáticamente.

### Keyword Spam Policy

- **No usar** frases promocionales como:
  - "Please view my other eBay listings"
  - "View my other listings"
  - "See my other eBay listings"
  - "Check my other listings"

Estas frases se eliminan automáticamente en `sanitizeTitleForEbay`.

### Caracteres permitidos

- Alfanuméricos, espacios, acentos (áéíóúñü), puntuación básica: `.,-/()&'"`

Caracteres no permitidos se eliminan durante la sanitización.

---

## Descripción

- Límite: 50.000 caracteres (HTML permitido con restricciones).
- Las mismas reglas de IP policy y Keyword Spam se aplican en `sanitizeDescriptionForEbay`.

---

## Implementación en el software

| Función | Archivo | Uso |
|---------|---------|-----|
| `sanitizeTitleForEbay` | backend/src/utils/compliance/index.ts | Aplicada en publishToEbay y getListingPreview |
| `sanitizeDescriptionForEbay` | backend/src/utils/compliance/index.ts | Aplicada en publishToEbay y getListingPreview |
| `checkMarketplaceCompliance('ebay', ...)` | backend/src/utils/compliance/index.ts | Verificación post-sanitización (solo log warning si quedan violaciones) |

El flujo de publicación (`marketplace.service.ts`) sanitiza título y descripción antes de enviar a la API de eBay.
