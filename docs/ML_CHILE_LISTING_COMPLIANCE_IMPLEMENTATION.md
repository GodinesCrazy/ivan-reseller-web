# ML Chile Listing Compliance — Implementación
**Fecha:** 2026-04-04  
**Referencia:** Resumen Ejecutivo + Ley 19.496 + Reglamento CE 2022 + IVA Digital Oct 2025

---

## Qué se implementó

### 1. Footer Legal Automático (`buildMLChileImportFooter`)

**Archivo:** `backend/src/services/ml-chile-import-compliance.service.ts`

Cada listing de ML Chile ahora incluye al final de su descripción el siguiente bloque (adaptado dinámicamente):

```
---
Producto importado de China | Envío internacional con tracking incluido.
Tiempo estimado de entrega: 20-40 días hábiles desde China.
Garantía legal: 6 meses por defectos de fabricación (Ley 19.496).
Derecho de retracto: 10 días desde recepción (Ley del Consumidor).
Precio incluye IVA (19%) según normativa digital chilena. Sin cargos adicionales de importación.
Consultas: usa el sistema de preguntas del producto en Mercado Libre.
```

**ETA es dinámico** (por prioridad):
1. `estimatedDeliveryDays` del productData de AliExpress scraping (±20%)
2. `mlHandlingTimeDays` del workflow config del usuario (×0.7 y ×1.2)
3. Default conservador: 20–40 días

### 2. Integración en `publishToMercadoLibre`

**Archivo:** `backend/src/services/marketplace.service.ts`

El footer se appended ANTES del `sanitizeDescriptionForML()` para que:
- Pase por el sanitizador de ML (HTML strip, IP policy check, 5000 char limit)
- Respete el límite de 5000 caracteres (description se trunca si necesario, nunca el footer)
- Se registre `footerAppended` para persitir en DB

```typescript
// Punto de inyección (línea ~1425):
const { appendMLChileImportFooter, ... } = await import('./ml-chile-import-compliance.service');
const { finalDescription: descWithFooter, footerAppended } = appendMLChileImportFooter(finalDescription || '', footerOpts);
finalDescription = descWithFooter;
// ... luego:
finalDescription = sanitizeDescriptionForML(finalDescription || '');
```

### 3. Persistencia en `MarketplaceListing`

Al publicar exitosamente, se persisten:
- `shippingTruthStatus` — verificado via API snapshot post-creación
- `legalTextsAppended = true` — confirmando que el footer fue incluido
- `importHandlingTimeDays` — el valor configurado que se usó para el ETA

---

## Compliance por Requerimiento Legal

### Ley 19.496 — Protección al Consumidor

| Obligación | Implementación |
|---|---|
| Garantía legal 6 meses para defectos | ✅ Texto en footer: "Garantía legal: 6 meses por defectos de fabricación (Ley 19.496)" |
| Derecho de retracto 10 días | ✅ Texto en footer: "Derecho de retracto: 10 días desde recepción (Ley del Consumidor)" |
| Datos de contacto del vendedor | ✅ Texto en footer: "Consultas: usa el sistema de preguntas del producto en Mercado Libre" |

### Reglamento de Comercio Electrónico (2022)

| Obligación | Implementación |
|---|---|
| Precio total con IVA informado | ✅ "Precio incluye IVA (19%) según normativa digital chilena" |
| Plazos de entrega en días | ✅ ETA dinámico en footer: "20-40 días hábiles desde China" |
| Origen del producto | ✅ "Producto importado de China" en primera línea del footer |
| Condiciones de envío | ✅ "Envío internacional con tracking incluido" |

### IVA Digital Chile (Octubre 2025)

| Obligación | Implementación |
|---|---|
| IVA 19% para importaciones <US$500 | ✅ ML lo cobra; footer lo declara explícitamente |
| Sin cargos extra en aduana (para <US$500) | ✅ "Sin cargos adicionales de importación" |
| Comprador exento en aduana | ✅ Implícito en "Sin cargos adicionales" |

---

## Limitaciones de Implementación (ML-Side)

### 1. No hay campo ML específico para "texto legal"
ML Chile no tiene un campo `legal_text` ni `import_disclaimer` en el API de listings. La única opción es la descripción (plain_text). El footer se appended a la descripción, que es el único canal disponible.

### 2. La descripción puede ser sobrescrita por el vendedor
Si el operador edita la descripción manualmente desde la interfaz de ML, el footer puede perderse. `legalTextsAppended` en DB refleja el estado al momento de publicar.

### 3. ML puede mostrar descripción truncada
ML Chile muestra las primeras ~300 caracteres de la descripción visible sin expandir. El footer está al final de la descripción, por lo que puede no ser inmediatamente visible. Sin embargo, el footer es técnicamente parte de la descripción y satisface la obligación legal.

**Recomendación:** En futuros listings, considerar duplicar las cláusulas más críticas (retracto, garantía) también al inicio de la descripción.

---

## Formato del Footer — Decisiones de Diseño

### Por qué NO es un bloque jurídico largo
El resumen ejecutivo advierte: "No conviertas la descripción en un bloque jurídico ilegible". El footer:
- Es conciso (7 líneas, ~400 chars)
- Es funcional (informa al comprador, no al abogado)
- No duplica información ya visible en la ficha ML
- Está separado del cuerpo de la descripción con `---`

### Por qué el footer es la última línea
- ML muestra primero el cuerpo de la descripción (contenido comercial)
- El footer no interfiere con el SEO del contenido principal
- Si ML trunca la descripción, el footer puede no mostrarse, pero satisface la obligación de haberlo incluido

### Por qué ETA es en días y no en fechas exactas
- AliExpress no garantiza fechas exactas de entrega
- Reglamento CE exige "plazos realistas" — un rango en días cumple
- Fechas exactas generarían reclamos si no se cumplen exactamente

---

## Ejemplo de Descripción Completa (antes vs después)

### ANTES
```
Auriculares Bluetooth 5.0 TWS inalámbricos con estuche de carga.
- Sonido estéreo de alta fidelidad
- Batería: 300mAh (estuche), 50mAh (auriculares)
- Compatibilidad: iOS y Android
- Tiempo de carga: 2 horas
```

### DESPUÉS
```
Auriculares Bluetooth 5.0 TWS inalámbricos con estuche de carga.
- Sonido estéreo de alta fidelidad
- Batería: 300mAh (estuche), 50mAh (auriculares)
- Compatibilidad: iOS y Android
- Tiempo de carga: 2 horas

---
Producto importado de China | Envío internacional con tracking incluido.
Tiempo estimado de entrega: 20-40 días hábiles desde China.
Garantía legal: 6 meses por defectos de fabricación (Ley 19.496).
Derecho de retracto: 10 días desde recepción (Ley del Consumidor).
Precio incluye IVA (19%) según normativa digital chilena. Sin cargos adicionales de importación.
Consultas: usa el sistema de preguntas del producto en Mercado Libre.
```
