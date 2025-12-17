# Runbook de Producción - Ivan Reseller Web

## 📋 Variables de Entorno Requeridas

### Base de Datos
```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Seguridad
```env
JWT_SECRET=tu-secreto-jwt-minimo-32-caracteres
ENCRYPTION_KEY=tu-clave-encryption-32-caracteres
```

### Redis (Opcional pero recomendado)
```env
REDIS_URL=redis://host:6379
```

### APIs Críticas

#### eBay
```env
EBAY_APP_ID=tu-app-id
EBAY_DEV_ID=tu-dev-id
EBAY_CERT_ID=tu-cert-id
WEBHOOK_SECRET_EBAY=secreto-para-validar-webhooks
```

#### MercadoLibre
```env
MERCADOLIBRE_CLIENT_ID=tu-client-id
MERCADOLIBRE_CLIENT_SECRET=tu-client-secret
WEBHOOK_SECRET_MERCADOLIBRE=secreto-para-validar-webhooks
```

#### PayPal
```env
PAYPAL_CLIENT_ID=tu-client-id
PAYPAL_CLIENT_SECRET=tu-client-secret
PAYPAL_ENVIRONMENT=sandbox|production
```

### Feature Flags

#### Health Checks
```env
API_HEALTHCHECK_ENABLED=true|false  # Default: false
API_HEALTHCHECK_MODE=async|sync     # Default: async (recomendado)
API_HEALTHCHECK_INTERVAL_MS=900000  # Default: 15 minutos (900000ms)
```

#### Scraping
```env
SCRAPER_BRIDGE_ENABLED=true|false   # Default: true
SCRAPER_BRIDGE_URL=http://host:8077 # URL del microservicio Python
SCRAPER_FALLBACK_TO_STEALTH=true    # Default: true
```

#### Webhooks
```env
WEBHOOK_VERIFY_SIGNATURE=true|false              # Default: true
WEBHOOK_VERIFY_SIGNATURE_EBAY=true|false         # Por marketplace
WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true|false
WEBHOOK_VERIFY_SIGNATURE_AMAZON=true|false
WEBHOOK_SECRET_EBAY=secreto-hmac
WEBHOOK_SECRET_MERCADOLIBRE=secreto-hmac
WEBHOOK_SECRET_AMAZON=secreto-hmac
WEBHOOK_ALLOW_INVALID_SIGNATURE=false            # Solo dev (NUNCA true en prod)
```

#### Auto-Purchase (Crítico - Seguridad Financiera)
```env
AUTO_PURCHASE_ENABLED=false                      # Default: false (IMPORTANTE)
AUTO_PURCHASE_MODE=sandbox|production            # Default: sandbox
AUTO_PURCHASE_DRY_RUN=false                      # Default: false
AUTO_PURCHASE_DAILY_LIMIT=1000                   # Default: $1000/día
AUTO_PURCHASE_MONTHLY_LIMIT=10000                # Default: $10k/mes
AUTO_PURCHASE_MAX_PER_ORDER=500                  # Default: $500/orden
```

#### Rate Limiting
```env
RATE_LIMIT_ENABLED=true|false                    # Default: true
RATE_LIMIT_DEFAULT=200                           # Requests por 15 min (usuarios)
RATE_LIMIT_ADMIN=1000                            # Requests por 15 min (admin)
RATE_LIMIT_LOGIN=5                               # Intentos login por 15 min
RATE_LIMIT_WINDOW_MS=900000                      # Ventana en ms (default: 15 min)
```

### Otros
```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://tu-dominio.com
LOG_LEVEL=info|warn|error
```

---

## 🚀 Despliegue

### 1. Preparación
```bash
# Instalar dependencias
npm install

# Generar cliente Prisma
npx prisma generate

# Verificar configuración
npm run verify  # Si existe script de verificación
```

### 2. Migraciones
```bash
# En producción: migraciones fail-fast
npx prisma migrate deploy

# Verificar que las migraciones fueron exitosas
npx prisma migrate status
```

### 3. Build
```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

### 4. Iniciar Servidor
```bash
# Producción (con migraciones automáticas)
npm run start:with-migrations

# O manualmente
npx prisma migrate deploy && npm start
```

---

## 🔍 Troubleshooting

### Problema: Servidor no inicia - "DATABASE_URL not configured"
**Solución:**
1. Verificar que `DATABASE_URL` está configurada en variables de entorno
2. Verificar formato: `postgresql://user:password@host:5432/database`
3. Verificar conectividad: `psql $DATABASE_URL`

### Problema: Migraciones fallan
**En Producción:**
- El servidor se detiene automáticamente (fail-fast)
- Revisar logs para error específico
- Verificar permisos de la base de datos
- Verificar que todas las migraciones previas están aplicadas

**Solución:**
```bash
# Verificar estado de migraciones
npx prisma migrate status

# Si hay migraciones pendientes
npx prisma migrate deploy
```

### Problema: SIGSEGV crashes recurrentes
**Solución:**
1. Verificar `API_HEALTHCHECK_MODE=async` (NO sync)
2. Verificar que Redis está disponible (para BullMQ)
3. Revisar logs para identificar patrón
4. Si persiste, deshabilitar temporalmente: `API_HEALTHCHECK_ENABLED=false`

### Problema: Webhooks rechazados con 401
**Solución:**
1. Verificar que `WEBHOOK_VERIFY_SIGNATURE=true`
2. Verificar secretos configurados: `WEBHOOK_SECRET_{MARKETPLACE}`
3. Verificar que el marketplace envía el header correcto:
   - eBay: `X-EBAY-SIGNATURE`
   - MercadoLibre: `x-signature`
   - Amazon: `x-amzn-signature`

### Problema: Rate limiting muy restrictivo
**Solución:**
1. Ajustar `RATE_LIMIT_DEFAULT` según necesidad
2. Verificar que `RATE_LIMIT_ENABLED=true`
3. Si Redis está disponible, los límites son compartidos entre instancias

### Problema: Compra automática no funciona
**Verificaciones:**
1. `AUTO_PURCHASE_ENABLED=true` (debe estar explícitamente habilitado)
2. Verificar límites diarios/mensuales no excedidos
3. Verificar capital disponible
4. Verificar logs para razón específica de bloqueo

### Problema: Scraping falla
**Solución:**
1. Verificar `SCRAPER_BRIDGE_URL` si está habilitado
2. Si bridge no está disponible, sistema usa fallback automático
3. Verificar Chromium/Puppeteer si usa stealth-scraping:
   - `PUPPETEER_EXECUTABLE_PATH` configurado
   - Chromium instalado en sistema

---

## 📊 Health Checks

### Liveness Probe
```bash
curl http://localhost:3000/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "uptime": 12345,
  "service": "ivan-reseller-backend",
  "memory": { ... }
}
```

### Readiness Probe
```bash
curl http://localhost:3000/ready
```

**Respuesta esperada:**
```json
{
  "ready": true,
  "checks": {
    "database": { "status": "healthy", "connected": true },
    "redis": { "status": "healthy", "connected": true }
  }
}
```

**Si `ready: false`:**
- Revisar estado de base de datos
- Revisar logs del servidor
- Verificar conectividad de red

---

## 🔐 Seguridad

### Checklist Pre-Producción
- [ ] `AUTO_PURCHASE_ENABLED=false` (o con límites muy conservadores)
- [ ] `WEBHOOK_VERIFY_SIGNATURE=true` para todos los marketplaces
- [ ] Secretos de webhooks configurados y seguros
- [ ] `JWT_SECRET` y `ENCRYPTION_KEY` son únicos y seguros (32+ caracteres)
- [ ] `NODE_ENV=production`
- [ ] `LOG_LEVEL=info` o `warn` (no `debug` en prod)
- [ ] CORS configurado correctamente (`CORS_ORIGIN`)
- [ ] Rate limiting habilitado (`RATE_LIMIT_ENABLED=true`)

### Rotación de Secretos
1. Generar nuevos secretos
2. Actualizar variables de entorno
3. Reiniciar servicio
4. Verificar que webhooks siguen funcionando

---

## 📈 Monitoreo

### Logs Importantes
- **Health checks:** Buscar `[APIHealthCheckQueue]` en logs
- **Webhooks:** Buscar `[WebhookSignature]` en logs
- **Auto-purchase:** Buscar `[AutoPurchaseGuardrails]` en logs
- **Rate limiting:** Buscar respuestas `429` en logs

### Métricas Clave
- Uptime del servidor
- Tasa de errores (5xx)
- Latencia de respuestas
- Uso de memoria
- Conexiones a DB/Redis

---

## 🆘 Escalación

### Niveles de Severidad

**P0 - Crítico (Detener Servicio)**
- Base de datos no accesible
- Migraciones fallan
- Compra automática sin guardrails activa

**P1 - Alto (Degradación de Servicio)**
- Redis no disponible (afecta rate limiting multi-instancia)
- APIs críticas no disponibles
- Rate limiting bloqueando usuarios legítimos

**P2 - Medio (Impacto Limitado)**
- Health checks fallando
- Webhooks rechazados
- Scraping no disponible

**P3 - Bajo (Observación)**
- Logs con warnings
- Métricas degradadas
- Funcionalidades no críticas

---

## 📞 Contactos

- **Admin Backend:** [configurar]
- **DevOps:** [configurar]
- **Database Admin:** [configurar]
