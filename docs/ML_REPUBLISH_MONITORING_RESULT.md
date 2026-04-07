# ML_REPUBLISH_MONITORING_RESULT — 2026-04-03

## F. Monitoreo Post-Publicación

### F.1 Checks realizados

| Momento | Status | sub_status | Health | Notas |
|---|---|---|---|---|
| T+90s (durante P43) | **active** | [] | null | Primer check post-publish |
| T+~8 min (check manual) | **active** | [] | null | Confirmado activo |

### F.2 Evidencia real

**Check T+90s (output P43):**
```json
{
  "id": "MLC1911535343",
  "status": "active",
  "health": null,
  "sub_status": [],
  "permalink": "https://articulo.mercadolibre.cl/MLC-1911535343-soporte-escritorio-decorativo-gatito-para-celular-_JM",
  "pictures": [
    { "id": "797909-MLC109989301947_042026" },
    { "id": "732456-MLC109147832874_042026" }
  ]
}
```

**Check manual T+~8min (p33-check-status.ts):**
```json
{
  "id": "MLC1911535343",
  "status": "active",
  "sub_status": [],
  "pictures": [...]
}
```

### F.3 Comparativa con listing anterior

| Listing | Status final | sub_status | Causa |
|---|---|---|---|
| MLC3828313306 | inactive | [waiting_for_patch] | Cover gris + multi-producto |
| **MLC1911535343** | **active** | **[]** | **Cover V2 compliant** |

### F.4 Señales de rechazo

❌ No hay mensajes de moderación  
❌ No hay sub_status de rechazo  
❌ No hay health check fallando  
✅ sub_status: [] — limpio  
✅ status: active — activo  

### F.5 Análisis de causa del éxito

La diferencia entre el listing anterior (rechazado) y el nuevo (activo) fue exactamente la calidad de la portada:

| Factor | Anterior (rechazado) | Nuevo (activo) |
|---|---|---|
| Fondo | Gris/beige (no blanco) | Blanco puro (borderLuma=255) |
| Productos | 2 (multi-producto) | 1 (single product) |
| V2 score | No calculado (portadaGateBypass) | 100/100 |
| ML resultado | inactive/waiting_for_patch | active |

### F.6 Ventana de observación

La ventana de 90s + check manual a ~8min son insuficientes para garantizar que ML no baje el listing más tarde (moderación asíncrona puede tomar horas). Sin embargo, el comportamiento es radicalmente diferente al anterior: el listing anterior ya mostraba `under_review` en el primer poll de 120s.

**Recomendación**: Monitorear manualmente el listing en las próximas 24h via MLC API o panel de vendedor.
