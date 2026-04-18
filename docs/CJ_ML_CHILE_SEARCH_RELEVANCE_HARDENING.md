# CJ → ML Chile: Search Relevance Hardening

**Estado**: Implementado — 2026-04-18  
**Módulo afectado**: `CJ → ML Chile / Products` únicamente

---

## 1. Problema anterior

La ruta `POST /api/cj-ml-chile/cj/search` enviaba la query tal cual a `CJ product/listV2`, tomaba los resultados en el orden bruto de la API y solo los ordenaba por operabilidad (operable → stock_unknown → unavailable). No existía ninguna capa de relevancia textual local.

**Consecuencia**: búsquedas como `"air buds"` podían devolver flores, wigs y accesorios sin ninguna relación semántica, porque CJ API usa su propio matching fuzzy interno (puede matchear términos parciales como `"air"` en productos completamente distintos). Los productos más cercanos a la intención del operador podían quedar enterrados debajo de resultados inútiles.

---

## 2. Causa raíz

| Capa | Situación anterior |
|------|--------------------|
| CJ API `keyWord` | Fuzzy matching propio de CJ — no controlable |
| Backend ML Chile | Solo ordenaba por operabilidad, sin scoring de texto |
| Frontend ML Chile | Solo agrupaba por tier operabilidad, sin señal de relevancia |

En contraste, **CJ → eBay USA** tiene `cjSearchRankScore()` que ya incluye señales operacionales (stock, precio, imagen, título). ML Chile tenía una versión simplificada de esa lógica pero tampoco incluía relevancia textual. **Ninguno de los dos módulos tenía scoring textual** — la diferencia era que eBay USA tenía mejor señal operacional (US warehouse probe). ML Chile ahora tiene scoring textual + señal operacional recalibrada.

---

## 3. Solución implementada

### 3.1 Nuevo servicio

**Archivo**: `backend/src/modules/cj-ml-chile/services/cj-ml-chile-search-ranking.ts`

Pipeline de ranking en 3 pasos:

```
CJ API results (raw, unordered)
        ↓
1. expandQuery(rawQuery)
   - normalización: lowercase + strip punctuation + colapsar espacios
   - tokenización: split + remove stopwords (the, a, for, with…)
   - expansión sinónimos: "air buds" → ["earbuds", "wireless earbuds", "tws", …]

2. Por cada producto:
   - operabilityStatus = classify(inventoryTotal)
   - relevanceScore (0–100) = textRelevanceScore(query, title)
   - relevanceTier = alta (≥60) | media (30–59) | baja (<30)
   - operationalScore (0–90) = stock + precio + imagen + título depth

3. Sort final:
   - Primary:   operabilityStatus tier (operable=0, unknown=1, unavailable=2)
   - Secondary: relevanceScore DESC
   - Tertiary:  operationalScore DESC
```

### 3.2 Fórmula textRelevanceScore (0–100)

| Señal | Puntos | Descripción |
|-------|--------|-------------|
| A — Exact phrase | 50 | Frase completa de la query encontrada en el título |
| B — Token coverage | 0–35 | % de tokens de la query presentes en el título × 35 |
| C — Synonym hit | 10 | Al menos un término del diccionario de sinónimos matcheó en el título |
| D — Prefix bonus | 5 | El título comienza con uno de los tokens clave de la query |

**Score 0** = ningún token ni sinónimo encontrado → casi seguramente irrelevante.  
**Score ≥60** = tier "alta" → alta confianza de match semántico.

### 3.3 Diccionario de sinónimos (conservador)

Categorías cubiertas:

| Dominio | Ejemplos |
|---------|---------|
| Audio | air buds → earbuds, tws, wireless earbuds; headset → headphones |
| Carga | charger → charging cable, fast charger; cable → usb cable |
| Protección | case → protective case, cover, casing; funda → case |
| Wearables | watch → smartwatch, fitness tracker; band → smart band |
| Joyería | ring → finger ring, fashion ring |
| Redes | router → wifi router, wireless router |
| Móviles | holder → stand, mount; stand → phone stand |
| Iluminación | led → led strip, led lamp; lamp → desk lamp |
| Genérico | wireless ↔ bluetooth |

**Principio de diseño**: conservador. Solo se añaden sinónimos cuando la relación semántica es fuerte y comercialmente precisa. No se sobreexpande para no degradar la precisión.

---

## 4. Cambios en backend route

**Archivo**: `backend/src/modules/cj-ml-chile/cj-ml-chile.routes.ts`

Antes:
```typescript
const items = rawItems
  .map(item => ({ ...item, operabilityStatus: classifyInv(item.inventoryTotal) }))
  .sort((a, b) => RANK[a.operabilityStatus] - RANK[b.operabilityStatus]);
```

Después:
```typescript
const { rankedItems, query: expandedQuery } = rankMlChileSearchResults(parsed.data.query, rawItems);
```

Response adicional:
- `relevanceSummary: { alta, media, baja }` — conteo por tier para el UI
- `queryExpansions: string[]` — lista de términos de expansión usados (mostrados en UI)
- `note` actualizado describiendo el nuevo pipeline

---

## 5. Cambios en frontend

**Archivo**: `frontend/src/pages/cj-ml-chile/CjMlChileProductsPage.tsx`

### Nuevos campos en tipos
- `CjProductSummary`: + `relevanceScore?: number`, `relevanceTier?: RelevanceTier`
- `SearchResult`: + `relevanceSummary?`, `queryExpansions?`

### Nuevo componente `RelevanceBadge`
- `▲ Alta` (esmeralda) — score ≥60
- `▶ Media` (ámbar) — score 30–59
- `▼ Baja` (slate) — score <30
- Tooltip con score numérico exacto al hover
- Aparece en cada product card junto a `OperabilityBadge`

### Stats banner mejorado
- Muestra conteo de relevancia: `▲ N alta | ▶ N media | ▼ N baja coincidencia`
- Muestra términos de expansión: `Búsqueda expandida con: earbuds, tws, wireless earbuds…`
- Toggle "Solo alta coincidencia" con badge del conteo

### Filtro "Solo alta coincidencia"
- Checkbox en el banner
- Cuando activo: muestra solo items con `relevanceTier === 'alta'`
- Si el filtro resulta en 0 items: muestra aviso en lugar de pantalla vacía

---

## 6. Ejemplos de mejora (simulados con scoring)

| Query | Producto | Score antes | Score después | Tier |
|-------|---------|-------------|---------------|------|
| "air buds" | Wireless TWS Earbuds Bluetooth 5.0 | sin score | 85 | alta |
| "air buds" | Air Buds Pro Noise Cancelling | sin score | 100 | alta |
| "air buds" | Artificial Flower Clips Hair Wig | sin score | 0 | baja |
| "charger" | USB Fast Charger 65W PD | sin score | 85 | alta |
| "charger" | Phone Case TPU Transparent | sin score | 0 | baja |
| "watch" | Smart Watch Fitness Tracker | sin score | 85 | alta |
| "watch" | LED Watch Display Digital | sin score | 95 | alta |
| "watch" | Artificial Flower Decoration | sin score | 0 | baja |
| "ring" | Sterling Silver Ring Women | sin score | 95 | alta |
| "ring" | WiFi Router Antenna External | sin score | 0 | baja |

---

## 7. Convivencia con operabilidad/stock

El nuevo ranking NO rompe la lógica de operabilidad:

**Orden de sort:**
1. Operability tier (operable siempre primero) — **no cambia**
2. Relevance score — **nuevo**
3. Operational score — refinado para ML Chile

Esto significa: un producto operable con baja relevancia todavía rankea **por encima** de un producto stock_unknown con alta relevancia. La prioridad comercial de "primero lo que tiene stock" se preserva. La relevancia textual solo decide el orden **dentro** de cada tier operacional.

---

## 8. Limitaciones conocidas

1. **CJ devuelve basura desde el origen**: si CJ no incluye un producto relevante en sus primeras N páginas, no podemos rescatarlo. El ranking local solo mejora el orden de lo que CJ ya devuelve.

2. **Diccionario de sinónimos finito**: cubre los casos de uso más comunes del módulo. Para queries muy específicas o en español nativo que CJ no mapea bien, el CJ API puede seguir siendo el cuello de botella.

3. **No hay stemming ni fuzzy local**: "earbud" (singular) y "earbuds" (plural) están cubiertos por entradas separadas en el diccionario. No hay stemmer automático para variantes morfológicas.

4. **Relevance score basado en título solamente**: no se usa descripción ni tags del producto. Los títulos de CJ son el campo más confiable y normalizable.

5. **Sin feedback loop**: el score es estático. No aprende de qué productos el operador realmente evalúa o aprueba. Mejora futura posible: ponderar por conversión histórica en DB.

---

## 9. Cómo extender el diccionario de sinónimos

Editar `SYNONYM_MAP` en `cj-ml-chile-search-ranking.ts`. Reglas:

- Key: query normalizada (lowercase, sin puntuación)
- Value: array de strings que deben aparecer en títulos de productos relacionados
- NO agregar sinónimos ambiguos (e.g., "ring" → "boxing ring" introduciría ruido)
- Testear con búsquedas reales antes de añadir
