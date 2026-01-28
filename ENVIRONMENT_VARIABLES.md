# Environment Variables Reference

Lista completa de variables de entorno para el backend de Ivan Reseller.

## ?? CRÍTICAS (Requeridas para arranque)

### Node.js Core
```bash
NODE_ENV=production                    # development | production | test
PORT=${{PORT}}                         # Railway lo inyecta automáticamente - NO configurar manualmente
```

### Seguridad
```bash
JWT_SECRET=<mínimo-32-caracteres>      # REQUERIDO - Secreto para firmar tokens JWT
ENCRYPTION_KEY=<mínimo-32-caracteres>  # Opcional - Usa JWT_SECRET si falta
```

### Base de Datos
```bash
DATABASE_URL=postgresql://user:pass@host:port/dbname
# Railway inyecta automáticamente si conectas servicio PostgreSQL
# Alternativas que Railway puede usar:
# - DATABASE_PUBLIC_URL
# - POSTGRES_URL
# - POSTGRES_PRISMA_URL
# - DATABASE_PRISMA_URL
```

### Redis (Opcional pero recomendado)
```bash
REDIS_URL=redis://host:port
# Railway inyecta automáticamente si conectas servicio Redis
# Default: redis://localhost:6379 (si no configurado)
```

### URLs y CORS
```bash
API_URL=https://tu-backend.up.railway.app
FRONTEND_URL=https://tu-frontend.com
CORS_ORIGIN=https://tu-frontend.com,https://www.tu-frontend.com
WEB_BASE_URL=https://www.ivanreseller.com  # Para OAuth callbacks
```

---

## ?? ALIEXPRESS

### AliExpress Affiliate API (Para scraping y extracción de datos)
```bash
ALIEXPRESS_APP_KEY=<tu-app-key>
ALIEXPRESS_APP_SECRET=<tu-app-secret>
ALIEXPRESS_TRACKING_ID=ivanreseller  # Opcional - ID de afiliado
ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync
ALIEXPRESS_ENV=production  # production | test
ALIEXPRESS_CALLBACK_URL=https://tu-backend.up.railway.app/aliexpress/callback
ALIEXPRESS_OAUTH_REDIRECT_URL=https://tu-backend.up.railway.app/aliexpress/auth
```

### AliExpress Dropshipping API (Para compras automatizadas)
```bash
ALIEXPRESS_DROPSHIPPING_APP_KEY=<tu-app-key>
ALIEXPRESS_DROPSHIPPING_APP_SECRET=<tu-app-secret>
ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN=<tu-access-token>
ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN=<tu-refresh-token>
ALIEXPRESS_DROPSHIPPING_SANDBOX=false  # true | false
```

### Configuración AliExpress
```bash
ALIEXPRESS_DATA_SOURCE=api  # api | scrape
ALIEXPRESS_AUTH_MONITOR_ENABLED=false  # true | false
```

---

## ?? EBAY

```bash
EBAY_APP_ID=<tu-app-id>
EBAY_DEV_ID=<tu-dev-id>  # Opcional
EBAY_CERT_ID=<tu-cert-id>
EBAY_CLIENT_ID=<tu-client-id>  # Alias de EBAY_APP_ID
EBAY_CLIENT_SECRET=<tu-client-secret>  # Alias de EBAY_CERT_ID
EBAY_OAUTH_TOKEN=<tu-oauth-token>
EBAY_REFRESH_TOKEN=<tu-refresh-token>
EBAY_TOKEN=<tu-token>  # Alias de EBAY_OAUTH_TOKEN
EBAY_ENV=production  # production | sandbox
```

---

## ?? MERCADOLIBRE

```bash
MERCADOLIBRE_CLIENT_ID=<tu-client-id>
MERCADOLIBRE_CLIENT_SECRET=<tu-client-secret>
```

---

## ?? PAYPAL

```bash
PAYPAL_CLIENT_ID=<tu-client-id>
PAYPAL_CLIENT_SECRET=<tu-client-secret>
PAYPAL_ENVIRONMENT=sandbox  # sandbox | production

# O configuración por ambiente:
PAYPAL_SANDBOX_CLIENT_ID=<tu-sandbox-client-id>
PAYPAL_SANDBOX_CLIENT_SECRET=<tu-sandbox-client-secret>
PAYPAL_SANDBOX_ENVIRONMENT=sandbox

PAYPAL_PRODUCTION_CLIENT_ID=<tu-production-client-id>
PAYPAL_PRODUCTION_CLIENT_SECRET=<tu-production-client-secret>
PAYPAL_PRODUCTION_ENVIRONMENT=live
```

---

## ?? OTRAS APIs

### Groq (AI)
```bash
GROQ_API_KEY=<tu-api-key>
```

### ScraperAPI
```bash
SCRAPERAPI_KEY=<tu-api-key>
```

### ZenRows
```bash
ZENROWS_API_KEY=<tu-api-key>
```

### 2Captcha
```bash
TWOCAPTCHA_API_KEY=<tu-api-key>
```

### OpenAI
```bash
OPENAI_API_KEY=<tu-api-key>
```

---

## ?? CONFIGURACIÓN DEL SISTEMA

### Logging
```bash
LOG_LEVEL=info  # error | warn | info | debug
```

### Feature Flags
```bash
SAFE_BOOT=false  # true desactiva workers pesados pero Express sigue funcionando
SAFE_DASHBOARD_MODE=false  # true desactiva scraping en dashboard
SAFE_AUTH_STATUS_MODE=true  # true desactiva checks activos de marketplaces
ALLOW_BROWSER_AUTOMATION=false  # true permite Puppeteer/Chromium
DISABLE_BROWSER_AUTOMATION=true  # true desactiva completamente browser automation
```

### Scraper Bridge
```bash
SCRAPER_BRIDGE_URL=https://tu-scraper-bridge.com
SCRAPER_BRIDGE_ENABLED=true  # true | false
SCRAPER_FALLBACK_TO_STEALTH=true  # true | false
```

### Rate Limiting
```bash
RATE_LIMIT_ENABLED=true  # true | false
RATE_LIMIT_DEFAULT=200  # requests por ventana
RATE_LIMIT_ADMIN=1000
RATE_LIMIT_LOGIN=5  # intentos por ventana
RATE_LIMIT_WINDOW_MS=900000  # 15 minutos en ms
```

### API Health Check
```bash
API_HEALTHCHECK_ENABLED=false  # true | false
API_HEALTHCHECK_MODE=async  # sync | async
API_HEALTHCHECK_INTERVAL_MS=900000  # 15 minutos
```

### Webhooks
```bash
WEBHOOK_VERIFY_SIGNATURE=true  # true | false
WEBHOOK_VERIFY_SIGNATURE_EBAY=true
WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true
WEBHOOK_VERIFY_SIGNATURE_AMAZON=true
WEBHOOK_SECRET_EBAY=<secreto>
WEBHOOK_SECRET_MERCADOLIBRE=<secreto>
WEBHOOK_SECRET_AMAZON=<secreto>
WEBHOOK_ALLOW_INVALID_SIGNATURE=false  # Solo para desarrollo
```

### Auto-Purchase (Solo si habilitado)
```bash
AUTO_PURCHASE_ENABLED=false  # true | false
AUTO_PURCHASE_MODE=sandbox  # sandbox | production
AUTO_PURCHASE_DRY_RUN=true  # true | false
AUTO_PURCHASE_DAILY_LIMIT=1000  # USD
AUTO_PURCHASE_MONTHLY_LIMIT=10000  # USD
AUTO_PURCHASE_MAX_PER_ORDER=500  # USD
```

### JWT Configuration
```bash
JWT_EXPIRES_IN=7d  # Expiración de access token
JWT_REFRESH_EXPIRES_IN=30d  # Expiración de refresh token
```

### Debug
```bash
DEBUG_KEY=<secreto-para-endpoints-debug-protegidos>
```

---

## ?? Checklist Mínimo para Deployment

### Variables Mínimas Requeridas:
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` (mínimo 32 caracteres)
- [ ] `DATABASE_URL` (o conectar servicio PostgreSQL en Railway)
- [ ] `API_URL` (URL pública del backend)
- [ ] `CORS_ORIGIN` (URL del frontend)

### Variables Recomendadas:
- [ ] `REDIS_URL` (o conectar servicio Redis en Railway)
- [ ] `FRONTEND_URL`
- [ ] `LOG_LEVEL=info`

### Variables Opcionales (para funcionalidad completa):
- [ ] AliExpress credentials (si usas AliExpress)
- [ ] eBay credentials (si usas eBay)
- [ ] MercadoLibre credentials (si usas MercadoLibre)
- [ ] PayPal credentials (si usas PayPal)

---

## ?? Comandos Railway CLI

### Ver todas las variables:
```powershell
railway variables
```

### Configurar variable:
```powershell
railway variables set VARIABLE_NAME=value
```

### Configurar variable secreta (con prompt):
```powershell
railway variables set JWT_SECRET
# Te pedirá el valor de forma segura
```

### Eliminar variable:
```powershell
railway variables unset VARIABLE_NAME
```

### Ver variables en formato .env:
```powershell
railway variables --json
```

---

## ?? Notas Importantes

1. **Railway inyecta automáticamente:**
   - `PORT` - No configurar manualmente
   - `DATABASE_URL` - Si conectas servicio PostgreSQL
   - `REDIS_URL` - Si conectas servicio Redis

2. **JWT_SECRET:**
   - Mínimo 32 caracteres
   - Debe ser aleatorio y seguro
   - Si cambias JWT_SECRET, todos los tokens existentes se invalidarán

3. **DATABASE_URL:**
   - Railway puede usar diferentes nombres de variables
   - El código busca automáticamente: DATABASE_URL, DATABASE_PUBLIC_URL, POSTGRES_URL, etc.

4. **CORS_ORIGIN:**
   - Puede ser múltiples URLs separadas por coma
   - Debe incluir protocolo (https://)
   - Railway requiere HTTPS en producción

5. **Variables opcionales:**
   - El servidor arrancará sin APIs externas configuradas
   - Las funcionalidades que requieren esas APIs estarán deshabilitadas

---

## ?? Troubleshooting

### Error: "JWT_SECRET is required"
**Solución:** Configura JWT_SECRET con mínimo 32 caracteres

### Error: "DATABASE_URL not found"
**Solución:** 
1. Conecta servicio PostgreSQL en Railway
2. O configura DATABASE_URL manualmente

### Error: "CORS blocked"
**Solución:** Verifica que CORS_ORIGIN incluya la URL exacta del frontend (con protocolo)

### Servidor arranca pero APIs externas no funcionan
**Solución:** Verifica que las credenciales de las APIs estén configuradas correctamente
