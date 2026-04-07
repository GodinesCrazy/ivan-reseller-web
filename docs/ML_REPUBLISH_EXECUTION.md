# ML_REPUBLISH_EXECUTION — 2026-04-03

## E. Publicación Controlada Real

### Historial de listings para producto 32722

| Listing | Estado | Fecha | Motivo cierre/fallo |
|---|---|---|---|
| MLC3828307770 | closed | 2026-04-02 | Reemplazado por P37 |
| MLC3828313306 | inactive/waiting_for_patch | 2026-04-02 | Cover gris + multi-producto |
| **MLC1911535343** | **active** | **2026-04-03** | **Nuevo — cover V2 compliant** |

### E.1 Datos de ejecución P43

| Campo | Valor |
|---|---|
| Script | `p43-republish-new-cover.ts` |
| Timestamp publish | 2026-04-03 00:44:10 UTC |
| Producto reset | PUBLISHED → VALIDATED_READY antes de publish |
| Token refresh | Interno (marketplace service) |
| Imágenes subidas | 2 |

### E.2 Imágenes subidas a ML

| Asset | Picture ID | Tamaño ML |
|---|---|---|
| cover_main.jpg (P41 crop+softNeutral) | 797909-MLC109989301947_042026 | 1056×1057 |
| detail_mount_interface.jpg | 732456-MLC109147832874_042026 | 1200×1200 |

**Nota**: Cover reportado 1056×1057 por ML (por compresión interna de ML). El archivo original es 1200×1200. ML acepta imágenes >600px y recomienda ≥1200px. El threshold real de rechazo es <600px.

### E.3 Listing nuevo

| Campo | Valor |
|---|---|
| **Listing ID** | **MLC1911535343** |
| **URL** | https://articulo.mercadolibre.cl/MLC-1911535343-soporte-escritorio-decorativo-gatito-para-celular-_JM |
| Título | Soporte Escritorio Decorativo Gatito para Celular... |
| **Precio** | **11305 CLP** ✅ |
| **currency_id** | **CLP** ✅ |
| Category | MLC439917 |
| Listing type | gold_special |
| **Status inicial** | **active** |
| sub_status | [] (vacío — sin issues) |

### E.4 Corrección de DB

El publish service detectó y corrigió el estado inconsistente:
- Antes: status=PUBLISHED, isPublished=true (de P37)
- Reset a: status=VALIDATED_READY, isPublished=false
- Después de publish: status=PUBLISHED, isPublished=true

### E.5 Pre-validación ML

```
[ML Pre-validation] warning: shipping.lost_me1_by_user: User has not mode me1
```
Este warning persiste desde P37. No bloqueó la publicación. El listing quedó activo.
