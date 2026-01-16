# 📋 Estado de API Keys - Ivan Reseller Web

**Fecha:** 2025-01-XX  
**Versión:** 1.0.0  
**Última actualización:** 2025-01-XX

---

## 🔑 AliExpress Affiliate API

### Estado: ⏳ GO LIVE (Pendiente AppSecret)

**Configuración:**
- **App Name:** IvanReseller Affiliate API
- **AppKey:** 524880
- **AppSecret:** ⚠️ **REQUERIDO** - Debe obtenerse desde AliExpress Open Platform
- **Callback URL:** `https://www.ivanreseller.com/api/aliexpress/callback`
- **Tracking ID:** `ivanreseller`
- **Owner/Affiliate Email:** `goldenkeystudios0@gmail.com`
- **Ambiente:** Production
- **App Status:** Test (en AliExpress Open Platform)

**Endpoints Implementados:**
- ✅ `/api/aliexpress/callback` - OAuth callback endpoint
- ✅ `/api/aliexpress/auth` - Iniciar flujo OAuth
- ✅ `/api/aliexpress/generate-link` - Generar link afiliado
- ✅ `/api/aliexpress/test-link` - Endpoint de prueba
- ✅ `/api/aliexpress/search` - Buscar productos
- ✅ `/api/aliexpress/token-status` - Verificar estado del token

**Variables de Entorno Requeridas:**
```bash
ALIEXPRESS_APP_KEY=524880
ALIEXPRESS_APP_SECRET=<OBTENER_DESDE_OPEN_PLATFORM>
ALIEXPRESS_CALLBACK_URL=https://www.ivanreseller.com/api/aliexpress/callback
ALIEXPRESS_TRACKING_ID=ivanreseller
ALIEXPRESS_ENV=production
ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync
```

**⚠️ ACCIÓN REQUERIDA:**
- El AppSecret debe obtenerse desde AliExpress Open Platform (AppKey: 524880)
- Ver instrucciones completas en: `docs/ALIEXPRESS_OAUTH_GO_LIVE.md`

**Estado del Token OAuth:**
- Los tokens se almacenan de forma encriptada en la base de datos
- Se refrescan automáticamente cuando expiran
- Verificar estado: `GET /api/aliexpress/token-status`

**Pruebas:**
- Endpoint de prueba disponible: `GET /api/aliexpress/test-link?productId=xxx`
- Genera links afiliados reales con tracking id `ivanreseller`

---

## 🔒 Seguridad

- ✅ Tokens OAuth almacenados encriptados
- ✅ No se commitearon secrets en el repositorio
- ✅ Variables de entorno configuradas en Railway/Vercel
- ✅ Validación CSRF en callback OAuth (state parameter)

---

**Última actualización:** 2025-01-XX  
**Mantenido por:** Equipo de Desarrollo
