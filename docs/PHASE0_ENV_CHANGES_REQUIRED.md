# PHASE 0 — ENVIRONMENT VARIABLES REQUIRED
**Date**: 2026-03-31

---

## Variables aplicadas en `.env` local (ya en repositorio)

```bash
# Filtros de calidad de proveedores
MIN_SUPPLIER_ORDERS=100
MIN_SUPPLIER_RATING=4.0
MIN_SUPPLIER_REVIEWS=10
MAX_SHIPPING_DAYS=30
MIN_SUPPLIER_SCORE_PCT=70

# Filtros de oportunidad
MIN_SEARCH_VOLUME=500
MIN_TREND_CONFIDENCE=60
MIN_OPPORTUNITY_MARGIN=0.18        # ACTUALIZADO: era 0.15
OPPORTUNITY_DUPLICATE_THRESHOLD=0.75
```

---

## Variables CRÍTICAS para aplicar en Railway (producción)

Entrar en Railway → proyecto → servicio backend → Variables → RAW Editor y pegar:

```
MIN_SUPPLIER_ORDERS=100
MIN_SUPPLIER_RATING=4.0
MIN_SUPPLIER_REVIEWS=10
MAX_SHIPPING_DAYS=30
MIN_SUPPLIER_SCORE_PCT=70
MIN_SEARCH_VOLUME=500
MIN_TREND_CONFIDENCE=60
MIN_OPPORTUNITY_MARGIN=0.18
OPPORTUNITY_DUPLICATE_THRESHOLD=0.75
```

---

## Variables OPCIONALES para desbloquear competitor data ML (Fix #4)

Si el scraper-bridge está corriendo (o cuando se despliegue):

```
SCRAPER_BRIDGE_ENABLED=true
SCRAPER_BRIDGE_URL=<URL del scraper bridge en producción>
```

Sin estas variables, el sistema opera con las rutas OAuth ML y catálogo público ML. El 403 de Railway IPs quedará registrado en logs con instrucciones, pero no bloqueará la operación.

---

## Variables de debug ML (solo para diagnóstico)

```
ML_COMPARABLES_DEBUG=1
ML_COMPARABLES_DEBUG_USER_ID=<user_id>    # opcional: solo loguear para este usuario
```

---

## Verificación post-deploy

En los logs de Railway, buscar:
```
[OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100, ... }
```

Si los valores son 0 o los defaults codificados, significa que las env vars no se aplicaron en Railway.
