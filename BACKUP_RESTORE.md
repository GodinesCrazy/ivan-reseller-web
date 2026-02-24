# Backup y Restauración - Ivan Reseller RC1

Guía para respaldar y restaurar datos.

## Base de datos (PostgreSQL)

### Backup

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

O con compresión:

```bash
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
psql $DATABASE_URL < backup_20250206.sql
```

O desde comprimido:

```bash
gunzip -c backup_20250206.sql.gz | psql $DATABASE_URL
```

## Tablas críticas

- users
- products
- sales
- orders
- api_credentials (encriptados)
- platform_config

## Variables de entorno

No incluir en backups. Documentar en lugar seguro:
- JWT_SECRET
- ENCRYPTION_KEY
- INTERNAL_RUN_SECRET
- PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
- ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET

## Frecuencia recomendada

- Backup diario automático (cron o servicio externo)
- Retención: mínimo 7 días, ideal 30 días
