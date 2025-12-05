# Variables de Entorno: AliExpress APIs

## AliExpress Affiliate API

### Requisitos

**NO se requieren variables de entorno globales.**

Las credenciales se almacenan en la base de datos a través de la interfaz de usuario:
- Settings → API Settings → AliExpress Affiliate API

### Campos Requeridos

- `appKey`: App Key de AliExpress Open Platform
- `appSecret`: App Secret de AliExpress Open Platform  
- `trackingId` (opcional): Tracking ID para comisiones de afiliado
- `sandbox`: Boolean (solo organizacional, no afecta el endpoint)

### Dónde Obtenerlas

1. Crear cuenta en [AliExpress Open Platform](https://open.alibaba.com/)
2. Crear aplicación tipo "Affiliate API"
3. Obtener `app_key` y `app_secret` de la aplicación
4. Configurar en Settings → API Settings → AliExpress Affiliate API

### Verificación

Si las credenciales NO están configuradas, verás en logs:
```
[ALIEXPRESS-FALLBACK] Using native scraper because API credentials not configured
```

Si las credenciales están configuradas pero son inválidas:
```
[ALIEXPRESS-AFFILIATE-API] Error ← status=401, code=INVALID_SIGNATURE
```

## AliExpress Dropshipping API

### Requisitos

Similar a Affiliate API, se almacenan en BD a través de la UI.

### Campos Requeridos

- `appKey`: App Key de AliExpress Open Platform
- `appSecret`: App Secret de AliExpress Open Platform
- `accessToken`: Token OAuth (obtenido mediante flujo OAuth)
- `refreshToken` (opcional): Token para refrescar `accessToken`
- `userId` (opcional): ID de la cuenta de AliExpress
- `sandbox`: Boolean

### Flujo OAuth

1. Configurar `appKey` y `appSecret` en Settings
2. Hacer clic en "Authorize" (botón OAuth)
3. Redirige a AliExpress para autorizar
4. AliExpress redirige de vuelta con `code`
5. El sistema intercambia `code` por `accessToken` y `refreshToken`
6. Se guardan automáticamente en la BD

## Variables de Entorno Opcionales (Backend)

Estas NO son requeridas para el funcionamiento normal, pero pueden usarse para testing:

- `ALIEXPRESS_AFFILIATE_APP_KEY`: Para scripts de prueba
- `ALIEXPRESS_AFFILIATE_APP_SECRET`: Para scripts de prueba
- `ALIEXPRESS_AFFILIATE_SANDBOX`: true/false para scripts de prueba

**Nota:** En producción, las credenciales deben configurarse a través de la UI, no mediante variables de entorno.

