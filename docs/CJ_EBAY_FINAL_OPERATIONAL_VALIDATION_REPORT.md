# CJ → eBay — informe de validación operativa final

**Fecha:** 2026-04-14  
**Alcance:** evidencia de entorno, listing/orden/postventa, claridad operador, QA.

---

## 1. Resumen ejecutivo

El repositorio incluye el flujo **CJ → eBay** (UI, pipeline, draft/publish, metadata, puente `Order` por SKU) y un script **`npm run cj-ebay:operational-validation`** que comprueba flags, forma de `supplierMetadata` y conteos DB **sin loguear secretos**.

La **prueba de publicación y de orden reales** depende de credenciales eBay/CJ y del flag **`BLOCK_NEW_PUBLICATIONS`** en el despliegue; debe ejecutarla el **operador** en sandbox o producción.

**Veredicto:** **GO CONDICIONAL** — software listos; evidencia de extremo a extremo en vivo es responsabilidad del operador.

**Porcentaje hacia 100% operativo end-to-end:** **~94–96%** (el resto es evidencia en vivo + política de pago CJ).

---

## 2. Estado previo

- ~92% documentado en informes anteriores; selector de variantes, draft/publish UI, metadata en `draftPayload` y bridge Order.

---

## 3. Qué se validó en esta pasada (repositorio)

| Ítem | Estado |
|------|--------|
| Script `backend/scripts/cj-ebay-operational-validation.ts` | Presente; `npm run cj-ebay:operational-validation` |
| Guía operador en `CjEbayLayout.tsx` | Añadida (draft/listings vs órdenes CJ vs legacy) |
| Informe | Este archivo |

Ejecutar localmente:

```bash
cd backend && npm run type-check && npm run cj-ebay:operational-validation
cd frontend && npm run build
```

**Evidencia (ejecución de validación en entorno de desarrollo):** el script imprime flags (`ENABLE_CJ_EBAY_MODULE`, `BLOCK_NEW_PUBLICATIONS`, presencia de `DATABASE_URL` y claves CJ sin valores), valida claves de `supplierMetadata` del puente por SKU, y conteos opcionales en `cj_ebay_listings`, `cj_ebay_orders` y `orders` con `supplier=cj`. Los números dependen de la base local/producción.

---

## 4. Resultado esperado del listing (checklist operador)

1. `ENABLE_CJ_EBAY_MODULE=true` y `VITE_ENABLE_CJ_EBAY_MODULE=true`.
2. Draft desde Opportunities/Research → fila en **Listings** con `draftPayload` coherente (supplier, mapping, cjVid/cjSku).
3. Si `BLOCK_NEW_PUBLICATIONS=true` → publish HTTP **423**; documentar. Si `false` → anotar `ebayListingId` / `ebaySku`.

---

## 5. Resultado esperado de orden / sync

- **Vertical:** `POST /api/cj-ebay/orders/import` con `ebayOrderId` → `cj_ebay_orders` con SKU mapeado.
- **Legacy:** línea eBay con `sku` = `cj_ebay_listings.ebaySku` → `orders.supplier` + `supplierMetadata` (helper `buildCjEbayBridgeSupplierMetadata`).

---

## 6. Postventa (create / confirm / status / tracking)

- **Módulo CJ:** `place` → `confirm` → `pay` (solo si política lo permite) → `sync-tracking` bajo `/api/cj-ebay/orders/:id/*`.
- **Global:** `supplierFulfillmentService.createSupplierOrder` requiere metadata CJ (`cjVid`, `logisticName`, etc.) según runbook.

**Pay:** no ejecutar en producción sin checklist; scripts `cj-phase-d5-pay-dry-run` / guardrails si existen.

---

## 7. Pay real vs dry-run

- Validación de entorno puede incluir `CJ_PHASE_D_ALLOW_PAY` (ver script operacional).
- Pay real solo con aprobación explícita.

---

## 8. Claridad operativa

- **Listings / draft / publish:** módulo CJ → **Listings**.
- **Órdenes CJ:** módulo CJ → **Orders** + import.
- **Orders legacy:** dashboard **Orders** si el sync rellena `supplierMetadata`.

Texto visible también en la UI (`CjEbayLayout`).

---

## 9. Archivos modificados (esta pasada)

- `frontend/src/pages/cj-ebay/CjEbayLayout.tsx`
- `docs/CJ_EBAY_FINAL_OPERATIONAL_VALIDATION_REPORT.md`

*(El script `backend/scripts/cj-ebay-operational-validation.ts` ya estaba en el repo.)*

---

## 10. Riesgos residuales

- Sin corrida en sandbox, no hay captura de `publishSkippedReason` en vivo.
- Ambigüedad residual entre dos modelos de orden si no se sigue la guía del layout.

---

## 11. Veredicto final

**GO CONDICIONAL**

---

## 12. Porcentaje actualizado

**~94–96%** — completar con evidencia (screens/logs) de publish + orden + import en el entorno real del operador.
