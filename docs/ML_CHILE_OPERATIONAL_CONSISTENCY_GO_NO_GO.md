# ML Chile — Decisión Operativa GO / NO-GO
**Fecha:** 2026-04-04  
**Fase:** Post-Phase-0, Pre-Primera Prueba Real Controlada

---

## Decisión: PARTIAL GO ✅⚠️

---

## Motivo Exacto

El sistema **ya es usable y consistente** para ejecutar una prueba real controlada con un único producto en Mercado Libre Chile. Las inconsistencias remanentes son **conocidas, documentadas, y no bloquean la prueba** si el operador las tiene en cuenta.

---

## Qué está operativo y correcto (GO conditions)

### Publicación
- ✅ El listing se publica correctamente en ML Chile
- ✅ Título sanitizado (IP policy, 60 chars, typos)
- ✅ Descripción con textos legales de importación (footer garantizado desde esta implementación)
- ✅ Atributos obligatorios auto-resueltos desde ML category API
- ✅ Imágenes con pipeline de calidad + AI background removal
- ✅ Profitability gate activo: no publica si precio ≤ costo
- ✅ Token ML refresh automático antes de publicar

### Business Truth
- ✅ `shippingTruthStatus` persistido en DB post-publicación
- ✅ `legalTextsAppended` persistido en DB
- ✅ `importHandlingTimeDays` persistido en DB
- ✅ `logMLChilePublishTruth()` genera audit trail completo
- ✅ Endpoints `/ml-chile-truth/:productId` y `/ml-chile-checklist/:productId` disponibles

### Fulfillment
- ✅ Order sync ML → DB operativo
- ✅ Pipeline PAID → PURCHASED con gates de seguridad
- ✅ Freight truth a tiempo real en la orden
- ✅ Profitability gate en fulfillment (previene compra con pérdida)
- ✅ Escalación a `MANUAL_ACTION_REQUIRED` cuando algo falla

### Impuestos / IVA
- ✅ ML Chile cobra 19% IVA automáticamente (ley oct 2025)
- ✅ `taxCalculatorService` con CL config correcta (19% IVA + 6% arancel)
- ✅ Cláusula IVA en descripción del listing
- ✅ IVA incluido en `importTax` del Product model para profitability

### Compliance
- ✅ Garantía legal 6 meses declarada en descripción
- ✅ Retracto 10 días declarado en descripción
- ✅ Origen importado declarado en descripción
- ✅ ETA internacional declarado en descripción

---

## Limitaciones Controladas (no bloquean la prueba)

### L1 — Shipping mode me2 no enforced en MLC (limitación de plataforma ML)
**Impacto:** El comprador ve "Entrega a acordar con el vendedor" en lugar de ETA de me2.  
**Mitigación:** ETA real siempre visible en descripción del listing. Status documentado en DB.  
**Acción requerida:** Ninguna por parte del operador. Monitorear que ML no marque como `forbidden`.

### L2 — Frontend sin UI para truth model
**Impacto:** El operador debe consultar los endpoints directamente (API) para ver shipping truth y checklist.  
**Mitigación:** Endpoints disponibles, datos en DB. UI se implementa en próxima fase.  
**Acción requerida:** Para la prueba controlada, el operador consulta `/ml-chile-truth/:productId` directamente.

### L3 — Tracking AliExpress → ML no automático
**Impacto:** El operador debe ingresar el tracking number manualmente cuando AliExpress lo provea (24-72h post-compra).  
**Mitigación:** Proceso semimanual esperado para primera prueba. `MANUAL_ACTION_REQUIRED` escala correctamente.  
**Acción requerida:** El operador monitorea AliExpress admin y actualiza el tracking en ML.

### L4 — Listings publicados antes de esta implementación no tienen footer legal
**Impacto:** Listings existentes (ej. MLC3838127822) no tienen `legalTextsAppended = true`.  
**Mitigación:** Republicar esos listings para añadir el footer, o editar la descripción manualmente en ML.  
**Acción requerida:** Republicar el listing activo actual para que incluya el footer.

### L5 — UI del frontend no consume los nuevos endpoints
**Impacto:** La visibilidad operativa está en la API pero no en la UI.  
**Mitigación:** Endpoints funcionan. Operador puede consultar via API o curl.  
**Acción requerida:** Implementar en próxima fase: `<MLChileTruthPanel />` en ProductPreview.

---

## Condiciones de la Prueba Real Controlada

Para que el PARTIAL GO sea válido, la prueba debe realizarse bajo estas condiciones:

### Configuración recomendada
```
workflowMode: hybrid
stageFulfillment: manual   ← CRÍTICO: primera orden siempre manual
mlHandlingTimeDays: 30     ← o el valor que corresponda al proveedor elegido
environment: production
```

### Producto a usar
- [ ] 1 solo producto publicado (el activo)
- [ ] URL AliExpress válida en el producto (formato *.../item/NNNNNNNN.html)
- [ ] Precio sugerido > costo total (verificado con `/ml-chile-truth/:productId`)
- [ ] Listing republicado con footer legal (si era un listing anterior)

### Primera orden
- [ ] Monto bajo (≤US$30) para minimizar riesgo
- [ ] `stageFulfillment = manual` para que el operador confirme manualmente
- [ ] Operador disponible para intervenir dentro de 24h de recibida la orden

### Post-orden
- [ ] Verificar order en DB: `Order.status = PAID` → `PURCHASING` → `PURCHASED`
- [ ] Si queda en `MANUAL_ACTION_REQUIRED`: revisar la URL de AliExpress y el freight
- [ ] Obtener tracking de AliExpress admin (24-72h) e ingresarlo en ML

---

## Siguiente Paso Recomendado

**Inmediato (antes de la prueba):**
1. Republicar el listing activo (MLC3838127822) para que incluya el footer legal
2. Verificar con `/api/workflow/ml-chile-truth/:productId` que `overallReadiness = 'ready'`
3. Confirmar `stageFulfillment = manual` en WorkflowConfig

**Fase siguiente (post primera prueba):**
4. Implementar `<MLChileTruthPanel />` en `ProductPreview.tsx`
5. Implementar `<MLChileChecklist />` como modal pre-publicación
6. Agregar badge de `shippingTruthStatus` en lista de productos
7. Automatizar tracking sync AliExpress → ML (cron job)
8. Considerar republicar con `mode: not_specified` explícito si me2 sigue siendo revertido

---

## Resumen Ejecutivo

| Área | Estado | Bloquea prueba? |
|---|---|---|
| Publicación ML Chile | ✅ Operativo | No |
| Textos legales / compliance | ✅ Operativo (nuevos listings) | No |
| Shipping truth en DB | ✅ Implementado | No |
| Impuestos / IVA | ✅ Correcto | No |
| Fulfillment pipeline | ✅ Operativo | No |
| Profitability gates | ✅ Operativo | No |
| Order sync | ✅ Operativo | No |
| Tracking | ⚠️ Semimanual | No (operador monitorea) |
| me2 shipping mode | ⚠️ Limitación ML | No (ETA en descripción compensa) |
| UI truth panel | ❌ Pendiente | No (endpoints disponibles) |
| Listing activo anterior sin footer | ⚠️ Requiere republicar | Sí si no se republica antes |

**Veredicto: PARTIAL GO — proceder con prueba real controlada bajo las condiciones documentadas.**
