# AliExpress — consistencia env global vs BD

## Modelo

- **Variables `ALIEXPRESS_*` en Railway:** útiles para affiliate global, scripts y defaults; **no** son la única fuente si cada usuario guarda App Key/Secret en API Settings.
- El runtime **no** debe loguear “Disabled” cuando solo faltan env pero el flujo OAuth por usuario puede estar completo.

## Cambio

- `server.ts` `logConfiguration`: warnings específicos `ALIEXPRESS-AFFILIATE-ENV` y `ALIEXPRESS-OAUTH-ENV` en lugar de un único “Disabled”.
