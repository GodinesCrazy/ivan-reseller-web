# Configuración del RuName de eBay para OAuth

Si ves "Autorización completada correctamente" en la página de eBay pero la publicación sigue pendiente (`ebayPendingOAuth`), el **RuName no está enviando el código a nuestro callback**. Debes configurar la URL correcta en eBay Developer Portal.

## Pasos

1. Entra en [eBay Developer Portal - My Keys](https://developer.ebay.com/my/keys)
2. Inicia sesión con tu cuenta de desarrollador
3. Selecciona tu app de **Producción** (IvanMart / Ivan Reseller)
4. Busca **OAuth Redirect URIs** o **RuNames**
5. Localiza el RuName: `Ivan_Marty-IvanMart-IVANRe-cgcqu`
6. Edita el RuName y configura:
   - **Auth Accepted URL** (o "Sign-in accepted URL"): 
     ```
     https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay
     ```
   - **Auth Declined URL** (opcional): misma URL o una de error

7. Guarda los cambios

## Verificación

1. Ejecuta para abrir la URL OAuth:
   ```bash
   npm run ebay:oauth-url
   ```
2. Autoriza en eBay
3. Deberías ser redirigido a **nuestra** página ("Autorización completada exitosamente"), no a la de eBay
4. Ejecuta el ciclo completo:
   ```powershell
   $env:DRY_RUN="0"; npm run run:remote-cycle
   ```

## Alternativa: token manual

Si no puedes editar el RuName:

1. En eBay Developer Portal ? User Tokens ? **Get a Token**
2. Copia el **Refresh Token**
3. Guárdalo:
   ```bash
   node backend/scripts/set-ebay-token.js TU_REFRESH_TOKEN
   ```
