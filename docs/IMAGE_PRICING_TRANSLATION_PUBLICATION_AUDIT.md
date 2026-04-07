# Auditoría integrada — Imágenes, pricing, traducción, publicación, visibilidad

---

## A. Imágenes (Mercado Libre Chile / canónico)

| Pregunta | Respuesta | Verificación |
|----------|-----------|--------------|
| ¿Pipeline canónico activo por defecto? | `ML_CANONICAL_IMAGE_PIPELINE` default on (no `0`/`false`) | **Verificado** `policy-profiles.ts` `isMlCanonicalPipelineEnabled` |
| ¿Remediación + gates conectados a publicación? | Sí — publisher llama `resolveMercadoLibrePublishImageInputs` → `runMercadoLibreImageRemediationPipeline` | **Verificado** `mercadolibre.publisher.ts` |
| ¿P76–P86 integrados en ese camino? | Tipos y servicios en `marketplace-image-pipeline/`; pre-publish también usa remediación | **Verificado** grep `runMercadoLibreImageRemediationPipeline` en `pre-publish-validator.service.ts` |
| ¿Evita portada débil? | P85 preferencia + P86 floor comercial sobre ganador provisional; fail → human review sin pack | **Verificado** `ml-chile-canonical-pipeline.service.ts` + `commercial-finalist-floor.service.ts` |
| ¿Mejor imagen / facilidad remediación? | P81 fitness + P82/P83 simulación + P84 preferencia final | **Verificado** servicios encadenados |
| ¿Honesto “solo publico si…”? | **Casi** — publisher bloquea si `!publishSafe`; floor rechaza remediated weak | **Parcial** — direct_pass con imagen local aprobada puede saltar subconjunto de pasos de remediación canónica según flags `productData` |

### Hallazgo I-001
- **Título:** Direct path `local:pack:cover` puede **no** ejercitar mismo stack que remediated path
- **Estado:** **Parcialmente verificado** (lógica `runMlChileCanonicalPipeline` early return)
- **Severidad:** Media
- **Recomendación:** En prueba real ML, forzar path remediated o validar `canonicalEvaluateLocalApprovedCover` + audit explícito.
- **Bloquea prueba real:** No si se elige estrategia de prueba clara.

---

## B. Pricing / costos / márgenes

| Componente | ¿Incluido en código? | Notas |
|--------------|------------------------|-------|
| Costo proveedor | Sí | `product` / oportunidad |
| Shipping | Parcial | `getDefaultShippingCost()` fallback en calculator |
| Fees marketplace | Sí, **simplificado** (ej. ML 11%, payment 2.9%) | `cost-calculator.service.ts` |
| Impuestos Chile / IVA ML | **No verificado** modelo completo en un solo servicio | Riesgo |
| FX | Parcial | `fx.convert` con fallback warn |
| Buffer / margen mínimo | En profitability / configs | Múltiples rutas |

### Hallazgo P-001
- **Título:** Fees ML Chile reales pueden diferir de `defaults.mercadolibre.fee`
- **Estado:** **Parcialmente verificado**
- **Severidad:** Alta (económico)
- **Recomendación:** **Prerequisite prueba real:** alinear fee effectivo MLC + moneda CLP con `destination.service` / listing real.
- **Bloquea prueba real:** Recomendado sí (evitar pérdida).
- **Bloquea escalado:** Sí.

---

## C. Traducción / idioma

| Aspecto | Estado |
|---------|--------|
| Política idioma país (CL → es) | **Verificado** `listing-language-policy.service.ts` |
| Resolución en contexto marketplace | **Verificado** `getMarketplaceContext` |
| Bloqueo pre-publish si idioma inválido | **Parcial** — `pre-publish-validator.service.ts` usa context; no auditado cada rama publish |
| Traducción automática título/descripción | **No verificado** como pipeline único obligatorio |

### Hallazgo T-001
- **Título:** Localización “correcta” ≠ solo policy; contenido puede seguir en inglés si origen AliExpress
- **Estado:** **Parcialmente verificado**
- **Severidad:** Media (ML Chile)
- **Recomendación:** Paso manual o servicio de traducción acoplado a `publish` con checklist idioma.
- **Bloquea prueba real:** Depende de calidad del título origen; **recomendado** revisar antes de publicar.

---

## D. Publicación y “visibilidad”

| Recurso real en código | Verificable |
|------------------------|-------------|
| Categoría ML predict | Sí `predictCategory` |
| Imágenes compliant | Sí gates + remediación |
| `marketplace-optimization-agent` | Existe servicio + tests — **no verificado** impacto en listing live |
| SEO/ranking garantizado | **No** — no hay evidencia de control de posición |

### Hallazgo V-001
- **Título:** Mejora comercial = calidad listing + políticas; **no** “primera página ML” demostrable
- **Estado:** **Verificado** (ausencia de claims técnicos fuertes)
- **Recomendación:** Tratar optimización como asistencia + métricas post-publish, no promesa de ranking.

---

## Resumen integrado

- **Imágenes:** Fuerte integración técnica reciente (P76–P86) en el camino de publicación ML.
- **Pricing:** Funcional pero **auditoría económica** necesaria antes de prueba con dinero real.
- **Traducción:** Gobernanza parcial; riesgo de contenido no localizado.
- **Visibilidad:** Herramientas de calidad sí; ranking no garantizable.
