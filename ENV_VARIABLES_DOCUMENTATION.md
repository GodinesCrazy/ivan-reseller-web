# 📋 DOCUMENTACIÓN COMPLETA DE VARIABLES DE ENTORNO

**Fecha**: 2025-11-15  
**Propósito**: Documentar todas las variables de entorno necesarias para el sistema

---

## 🔧 CÓMO USAR ESTE DOCUMENTO

1. Copia las variables necesarias a tu archivo `.env`
2. Reemplaza los valores de ejemplo con tus credenciales reales
3. **NUNCA** commitees el archivo `.env` con valores reales

---

## ✅ VARIABLES REQUERIDAS (CRÍTICAS)

### Base de Datos
```bash
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/base_de_datos
```

### Redis
```bash
REDIS_URL=redis://host:puerto
```

### Seguridad (OBLIGATORIAS)
```bash
# Mínimo 32 caracteres
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long

# Exactamente 64 caracteres hexadecimales (32 bytes en hex)
# Generar con: openssl rand -hex 32
ENCRYPTION_KEY=your-64-character-hexadecimal-encryption-key-0123456789abcdef0123456789abcdef
```

### CORS y Frontend
```bash
CORS_ORIGIN=https://ivanreseller.com,https://www.ivanreseller.com
FRONTEND_URL=https://ivanreseller.com
```

---

## 🔑 VARIABLES DE APIS (OPCIONALES)

### eBay API
```bash
# Sandbox
EBAY_SANDBOX_APP_ID=your-app-id
EBAY_SANDBOX_DEV_ID=your-dev-id
EBAY_SANDBOX_CERT_ID=your-cert-id
EBAY_SANDBOX_REDIRECT_URI=your-runame

# Production
EBAY_PRODUCTION_APP_ID=your-app-id
EBAY_PRODUCTION_DEV_ID=your-dev-id
EBAY_PRODUCTION_CERT_ID=your-cert-id
EBAY_PRODUCTION_REDIRECT_URI=your-runame
```

### Amazon SP-API
```bash
# Valores mínimos por entorno
# Sandbox
AMAZON_SANDBOX_SELLER_ID=your-seller-id
AMAZON_SANDBOX_CLIENT_ID=your-client-id
AMAZON_SANDBOX_CLIENT_SECRET=your-client-secret
AMAZON_SANDBOX_REFRESH_TOKEN=your-refresh-token
AMAZON_SANDBOX_ACCESS_KEY_ID=your-aws-access-key-id
AMAZON_SANDBOX_SECRET_ACCESS_KEY=your-aws-secret-access-key
AMAZON_SANDBOX_SESSION_TOKEN= # opcional si usas credenciales temporales
AMAZON_SANDBOX_REGION=us-east-1
AMAZON_SANDBOX_MARKETPLACE_ID=ATVPDKIKX0DER

# Production
AMAZON_PRODUCTION_SELLER_ID=your-seller-id
AMAZON_PRODUCTION_CLIENT_ID=your-client-id
AMAZON_PRODUCTION_CLIENT_SECRET=your-client-secret
AMAZON_PRODUCTION_REFRESH_TOKEN=your-refresh-token
AMAZON_PRODUCTION_ACCESS_KEY_ID=your-aws-access-key-id
AMAZON_PRODUCTION_SECRET_ACCESS_KEY=your-aws-secret-access-key
AMAZON_PRODUCTION_SESSION_TOKEN= # opcional si usas credenciales temporales
AMAZON_PRODUCTION_REGION=us-east-1
AMAZON_PRODUCTION_MARKETPLACE_ID=ATVPDKIKX0DER
```

### MercadoLibre API
```bash
# Sandbox
MERCADOLIBRE_SANDBOX_CLIENT_ID=your-client-id
MERCADOLIBRE_SANDBOX_CLIENT_SECRET=your-client-secret
MERCADOLIBRE_SANDBOX_REDIRECT_URI=https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre

# Production (mismos campos con _PRODUCTION_)
```

### PayPal API
```bash
# Sandbox
PAYPAL_SANDBOX_CLIENT_ID=your-client-id
PAYPAL_SANDBOX_CLIENT_SECRET=your-client-secret
PAYPAL_SANDBOX_ENVIRONMENT=sandbox

# Production
PAYPAL_PRODUCTION_CLIENT_ID=your-client-id
PAYPAL_PRODUCTION_CLIENT_SECRET=your-client-secret
PAYPAL_PRODUCTION_ENVIRONMENT=live
```

### IA y Scraping
```bash
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
SCRAPERAPI_KEY=your-scraperapi-key
ZENROWS_API_KEY=your-zenrows-api-key
CAPTCHA_2CAPTCHA_KEY=your-2captcha-key
```

### Notificaciones
```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-email-app-password
EMAIL_FROM=noreply@ivanreseller.com
EMAIL_FROM_NAME=Ivan Reseller
EMAIL_SECURE=true

TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### AliExpress (Automatización)
```bash
ALIEXPRESS_EMAIL=your-aliexpress-email
ALIEXPRESS_PASSWORD=your-aliexpress-password
ALIEXPRESS_2FA_ENABLED=false
ALIEXPRESS_2FA_SECRET=your-totp-secret-if-2fa-enabled
```

---

## 📝 NOTAS IMPORTANTES

1. **ENCRYPTION_KEY**: Debe ser exactamente 64 caracteres hexadecimales. Generar con:
   ```bash
   openssl rand -hex 32
   ```

2. **JWT_SECRET**: Mínimo 32 caracteres. Usar un valor aleatorio fuerte.

3. **CORS_ORIGIN**: En producción, usar solo los dominios permitidos (ivanreseller.com).

4. **Variables de APIs**: Se pueden configurar desde la UI en `/settings/apis`, no es necesario tenerlas todas en `.env`.

5. **Base de Datos - Railway**:
   - En el contenedor de producción (Railway), usar la **URL interna** (`...railway.internal...`).
   - Desde tu PC (para correr migraciones o `db push`), usa la **URL pública** (proxy `...proxy.rlwy.net:PORT...`).

6. **Reportes (PDF/Excel)**:
   - El backend genera PDF con **Puppeteer**. No requiere configuración extra en Railway (Chrome ya está disponible).
   - Para que el frontend descargue PDF/Excel, el navegador debe enviar credenciales. Asegúrate de que las cookies httpOnly estén habilitadas y que el dominio sea el correcto.

---

## 🚀 PARA PRODUCCIÓN

1. Configurar todas las variables requeridas
2. Usar valores de producción (no sandbox)
3. Configurar CORS_ORIGIN con dominios reales
4. Usar HTTPS para todas las URLs
5. Configurar certificados SSL para NGINX

---

## 📚 REFERENCIAS

- Ver `backend/src/config/env.ts` para validaciones completas
- Ver `docker-compose.prod.yml` para configuración de producción
- Ver `MANUAL_COMPLETO_SISTEMA.txt` para guía de configuración

