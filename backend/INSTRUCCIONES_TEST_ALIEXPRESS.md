# Instrucciones para Testear AliExpress OAuth + Affiliate API

## ? Credenciales Configuradas

- **AppKey**: `524880`
- **App Secret**: `OKxmE8VLJfgkfrlP0JWs3N9vzQnwXJY6` ? Configurado
- **Redirect URI**: `https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback`
- **Tracking ID**: `ivanreseller`

## ?? URL de Autorización

Abre esta URL en tu navegador:

```
https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback
```

## ?? Pasos para Obtener el Código

1. **Abre la URL de arriba** en tu navegador
2. **Inicia sesión** en AliExpress si es necesario
3. **Autoriza la aplicación** "IvanReseller Affiliate API"
4. Serás **redirigido** a una URL como esta:
   ```
   https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback?code=ABC123XYZ789...
   ```
5. **Copia el valor del parámetro `code`** de esa URL
   - Ejemplo: Si la URL es `...?code=ABC123XYZ789`, copia `ABC123XYZ789`

## ?? Ejecutar el Test Completo

Una vez que tengas el código, ejecuta:

```bash
cd backend
npx tsx scripts/test-aliexpress-full-flow.ts TU_CODIGO_AQUI
```

Reemplaza `TU_CODIGO_AQUI` con el código que copiaste.

## ? Qué Hace el Test

El script verificará:
1. ? Variables de entorno configuradas
2. ? Intercambio de código por access_token
3. ? Validación del token
4. ? Prueba de API de afiliados con 4 keywords:
   - `phone case`
   - `wireless earbuds`
   - `usb charger`
   - `led strip`
5. ? Reporte de resultados

## ?? Resultado Esperado

Si todo funciona correctamente, verás:
```
? VERIFICATION COMPLETE
   Successful keywords: 4/4
   Access token: abc123...xyz789
   Sample product: Phone Case for iPhone 14 Pro Max...
   Sample price: 5.99 USD

?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED
```

## ?? Si Algo Falla

- **Si no hay productos**: Puede indicar que el permiso de Affiliate API no está habilitado en AliExpress Open Platform
- **Si el token falla**: Verifica que el código no haya expirado (los códigos expiran en 10 minutos)
- **Si hay errores de signature**: El script mostrará logs detallados para debugging

---

**Estado Actual**: ? Credenciales configuradas, listo para obtener código y testear
