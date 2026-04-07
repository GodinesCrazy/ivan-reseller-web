# PHASE 1 — COMPETITOR DATA SOURCE STATUS
**Date**: 2026-03-31  
**Status**: ML 403 activo — sin fuente real disponible actualmente

---

## MercadoLibre OAuth

| Item | Estado |
|------|--------|
| `MERCADOLIBRE_CLIENT_ID` | `your-mercadolibre-client-id` — placeholder, NO real |
| `MERCADOLIBRE_CLIENT_SECRET` | `your-mercadolibre-client-secret` — placeholder, NO real |
| Token activo | ❌ No hay token OAuth válido |
| Intento OAuth en Cycle 1 y 2 | ❌ Rechazado (401) |

**Estado**: No operativo. Las credenciales son placeholders, no credenciales reales de una app MercadoLibre.

---

## Scraper Bridge

| Item | Estado |
|------|--------|
| `SCRAPER_BRIDGE_ENABLED` | No definida (false por defecto) |
| `SCRAPER_BRIDGE_URL` | `http://127.0.0.1:8077` — localhost, solo local |
| Bridge accesible desde Railway | ❌ No (Railway no puede llegar a localhost local) |
| Bridge como alternativa | ❌ No disponible en producción |

**Estado**: No operativo en Railway. La URL `127.0.0.1:8077` solo funciona localmente.

---

## Fuente usada en Cycle 1 y Cycle 2

**`ML_PUBLIC_CATALOG_HTTP_FORBIDDEN`** en 100% de los casos.

MercadoLibre rechaza requests desde IPs de Railway (403/401) tanto para OAuth como para catálogo público. Es un bloqueo de la plataforma por IP de hosting compartido.

---

## Fuente fallback activa (post-fix)

Con el fix de Cycle 2, cuando no hay competitor data:
- El precio sugerido se calcula con `computeMinimumViablePrice` (canonical cost engine)
- Los fees canónicos se incluyen correctamente
- El margen calculado es >= `MIN_OPPORTUNITY_MARGIN` por construcción
- `feesConsidered` contiene el breakdown completo

**El pricing es correcto aunque el competitor data sea estimado.**

---

## Para desbloquear competitor data real

### Opción A — MercadoLibre OAuth real (prioritaria)
1. Crear una app en MercadoLibre Developers (developers.mercadolibre.com)
2. Obtener `client_id` y `client_secret` reales
3. Completar el flujo OAuth para obtener un access token
4. Configurar en Railway: `MERCADOLIBRE_CLIENT_ID` y `MERCADOLIBRE_CLIENT_SECRET` con valores reales
5. El `competitor-analyzer.service.ts` ya tiene el código de OAuth + refresh implementado

### Opción B — Scraper Bridge en producción
1. Desplegar un servicio bridge (Python/Node) en Railway u otro hosting
2. Configurar en Railway: `SCRAPER_BRIDGE_ENABLED=true` + `SCRAPER_BRIDGE_URL=<url-pública>`
3. El `scraper-bridge.service.ts` ya tiene el código implementado (`searchMLCompetitors()`)

**Ambas opciones son mejoras para Cycle 3/Fase 2. No bloquean el cierre de Cycle 2.**

---

## Impacto en Cycle 2

Sin competitor data real:
- **Precios sugeridos**: calculados correctamente con fees canónicos (margen ≥ 18%)
- **Competitividad de precios**: NO verificable contra mercado real ML
- **Riesgo**: precio sugerido puede ser competitivo o puede estar por encima del mercado
- **Decisión**: Los precios calculados son **el precio mínimo rentable**, no el precio de mercado

Para una publicación controlada segura, el operador debería verificar manualmente que el precio calculado sea competitivo en ML antes de publicar.
