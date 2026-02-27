EBAY_ENV: production (validado por `auth.ebay.com` en URL OAuth firmada de producción)
CLIENT_ID_OK: true (OAuth URL remota generada con client_id válido)
TOKEN_REFRESH_STATUS: FAILED_BEFORE_OAUTH_400 -> IMPROVED_AFTER_OAUTH (ya no devuelve refresh 400; ahora llega a endpoints sell/*)
NEW_TOKEN_CREATED: true (tras autorizar OAuth, el error cambió de refresh failure a llamadas de negocio)
TOKEN_VALIDATED: true (token aceptado por eBay Sell API; errores recibidos son de datos/listing, no 401 OAuth)
ITEM_ID: N/A (publicación bloqueada antes de `publish`)
PUBLIC_URL: N/A
HTTP_STATUS: N/A
VISIBLE_PUBLICLY: false
DB_PERSISTENCE_OK: likely_true (comportamiento post-OAuth indica credenciales nuevas aplicadas en backend remoto)
FULL_CYCLE_STATUS: BLOCKED_BY_LISTING_CONSTRAINTS
SYSTEM_READY_FOR_REAL_PROFIT: false

