# Amazon: Cumplimiento de políticas

Este documento resume las reglas de Amazon aplicadas por el software para evitar rechazos por violaciones del Product Title Policy y otras políticas.

---

## Título (Product Title Policy)

### Límite de caracteres

- **Máximo 200 caracteres** por título. Amazon recomienda mantener títulos concisos y relevantes.

El software aplica `sanitizeTitleForAmazon` (backend/src/utils/compliance/index.ts) que trunca a 200 caracteres.

### Caracteres decorativos prohibidos

- **No usar:** `! * $ ? _ { } # | ; ^ ¬ ¦ ~ < > « »`

Estos caracteres se eliminan automáticamente en `sanitizeTitleForAmazon`.

### Frases promocionales prohibidas

- **No usar:** "free shipping", "100% quality guaranteed", "hot item", "best seller", "limited time", "act now", "buy now", "click here", "sale!", etc.

Estas frases se eliminan automáticamente durante la sanitización.

### ALL CAPS

- Títulos escritos completamente en mayúsculas (ALL CAPS) no están permitidos cuando superan 5 caracteres.

`sanitizeTitleForAmazon` normaliza ALL CAPS a formato de oración.

### Política de propiedad intelectual (IP)

- **No usar:** "tipo X", "símil X", "réplica", "idéntico a", "igual a" para marcas.
- **Usar en su lugar:** "compatible con X" o equivalentes.

El módulo de compliance aplica estas sustituciones automáticamente.

---

## Descripción

- Límite: 2000 caracteres para descripciones de producto (varía según categoría).
- Las mismas reglas de caracteres decorativos, frases promocionales, ALL CAPS e IP policy se aplican en `sanitizeDescriptionForAmazon`.

---

## Implementación en el software

| Función | Archivo | Uso |
|---------|---------|-----|
| `sanitizeTitleForAmazon` | backend/src/utils/compliance/index.ts | Aplicada en publishToAmazon y getListingPreview |
| `sanitizeDescriptionForAmazon` | backend/src/utils/compliance/index.ts | Aplicada en publishToAmazon y getListingPreview |
| `checkMarketplaceCompliance('amazon', ...)` | backend/src/utils/compliance/index.ts | Verificación post-sanitización (solo log warning si quedan violaciones) |

El flujo de publicación (`marketplace.service.ts`) sanitiza título y descripción antes de enviar a la API de Amazon.
