# ML_NEXT_STEP_AFTER_REPUBLISH — 2026-04-03

## Estado actual

- **Listing activo**: MLC1911535343
- **URL**: https://articulo.mercadolibre.cl/MLC-1911535343-soporte-escritorio-decorativo-gatito-para-celular-_JM
- **Precio**: 11305 CLP
- **Status**: active, sub_status: []

---

## SIGUIENTE PASO INMEDIATO: Vigilancia de 24h

### Tarea 1: Monitoreo de status (próximas 24h)

Ejecutar cada 2-4 horas:
```bash
cd backend && npx tsx scripts/p33-check-status.ts MLC1911535343
```

Señales de alerta:
- `status: inactive` → intervención necesaria
- `sub_status: [waiting_for_patch]` → imagen o atributo rechazado
- `health` con flags → degradación de calidad

### Tarea 2: Confirmar precio en panel ML

Verificar manualmente en el panel de vendedor que:
- Precio mostrado = 11305 CLP
- Listing visible públicamente
- Categoría correcta

### Tarea 3: Cobertura de imagen a largo plazo

La portada actual funciona pero es mejorable. Para el siguiente ciclo de mantenimiento:

1. **Opción A (sin API externa)**: Usar script p41 con img3 recortada al soporte amarillo derecho
2. **Opción B (con API)**: Integrar remove.bg o fal.ai RMBG para aislamiento real
3. **Opción C (mejor)**: Solicitar al proveedor AliExpress una imagen del soporte amarillo sobre fondo blanco puro

### Tarea 4: Fix pendiente — shipping ME1

El warning persistente `shipping.lost_me1_by_user: User has not mode me1` sugiere que la cuenta ML no tiene habilitado el modo de envío ME1. Aunque no bloquea la publicación, podría limitar la visibilidad. Verificar en panel ML → Configuración → Envíos.

---

## NO HACER TODAVÍA

- ❌ No entrar al flujo postventa aún
- ❌ No cambiar el producto objetivo (32722)
- ❌ No abrir nuevas publicaciones de otros productos
- ❌ No tocar Redis, PORT o Railway base

## LISTO PARA EL SIGUIENTE HITO

Una vez confirmado que MLC1911535343 sigue activo después de 24h sin moderación:

**→ Escalar a: Prueba del primer pedido real**

El path queda habilitado. El producto está publicado, activo, con precio correcto y en la categoría correcta. El siguiente milestone es validar el flujo completo de una orden: compra → notificación → fulfillment con proveedor AliExpress.

---

## Artefactos generados en este ciclo

| Archivo | Descripción |
|---|---|
| `artifacts/ml-image-packs/product-32722/cover_main.jpg` | Cover V2 compliant (crop+softNeutral, 100/100) |
| `artifacts/ml-image-packs/product-32722/ml-asset-pack.json` | Manifest actualizado |
| `backend/scripts/p41-gen-cover-cropped.ts` | Script de generación de cover por crop+softNeutral |
| `backend/scripts/p41b-gen-cover-img4.ts` | Script alternativo img4 (descartado) |
| `backend/scripts/p43-republish-new-cover.ts` | Script de republicación final |
| `backend/scripts/p44-v2-compliance-check.ts` | Script de validación V2 |
| `backend/p43-output.txt` | Log completo de la publicación |
