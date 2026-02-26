# Instrucciones para Testear AliExpress OAuth + Affiliate API

## ? Credenciales Configuradas

- **AppKey**: Configurar `ALIEXPRESS_APP_KEY` en env (nunca en cùdigo).
- **App Secret**: Configurar `ALIEXPRESS_APP_SECRET` en env (nunca en cùdigo).
- **Redirect URI**: `https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback`
- **Tracking ID**: `ivanreseller`

## ?? URL de Autorizaciùn

Abre esta URL en tu navegador:

Genera la URL con: `cd backend && npx tsx scripts/generate-auth-url-direct.ts` (usa ALIEXPRESS_APP_KEY de .env.local). O desde frontend: API Settings ? Conectar AliExpress.

## ?? Pasos para Obtener el Cùdigo

1. **Abre la URL de arriba** en tu navegador
2. **Inicia sesiùn** en AliExpress si es necesario
3. **Autoriza la aplicaciùn** "IvanReseller Affiliate API"
4. Serùs **redirigido** a una URL como esta:
   ```
   https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback?code=ABC123XYZ789...
   ```
5. **Copia el valor del parùmetro `code`** de esa URL
   - Ejemplo: Si la URL es `...?code=ABC123XYZ789`, copia `ABC123XYZ789`

## ?? Ejecutar el Test Completo

Una vez que tengas el cùdigo, ejecuta:

```bash
cd backend
npx tsx scripts/test-aliexpress-full-flow.ts TU_CODIGO_AQUI
```

Reemplaza `TU_CODIGO_AQUI` con el cùdigo que copiaste.

## ? Quù Hace el Test

El script verificarù:
1. ? Variables de entorno configuradas
2. ? Intercambio de cùdigo por access_token
3. ? Validaciùn del token
4. ? Prueba de API de afiliados con 4 keywords:
   - `phone case`
   - `wireless earbuds`
   - `usb charger`
   - `led strip`
5. ? Reporte de resultados

## ?? Resultado Esperado

Si todo funciona correctamente, verùs:
```
? VERIFICATION COMPLETE
   Successful keywords: 4/4
   Access token: abc123...xyz789
   Sample product: Phone Case for iPhone 14 Pro Max...
   Sample price: 5.99 USD

?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED
```

## ?? Si Algo Falla

- **Si no hay productos**: Puede indicar que el permiso de Affiliate API no estù habilitado en AliExpress Open Platform
- **Si el token falla**: Verifica que el cùdigo no haya expirado (los cùdigos expiran en 10 minutos)
- **Si hay errores de signature**: El script mostrarù logs detallados para debugging

---

**Estado Actual**: ? Credenciales configuradas, listo para obtener cùdigo y testear
