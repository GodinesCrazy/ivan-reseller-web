# C?mo Obtener el C?digo de Autorizaci?n de AliExpress

## ?? Paso a Paso

### Paso 1: Abrir la URL de Autorizaci?n

Copia y pega esta URL completa en tu navegador:

```
https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback
```

**O ejecuta este comando para abrirla autom?ticamente:**

```powershell

``` 

### Paso 2: Iniciar Sesi?n en AliExpress

1. Si no est?s logueado, ver?s la p?gina de login de AliExpress
2. Ingresa tu email/username y contrase?a
3. Completa cualquier verificaci?n de seguridad si aparece (CAPTCHA, 2FA, etc.)

### Paso 3: Autorizar la Aplicaci?n

1. Despu?s de iniciar sesi?n, ver?s una p?gina que dice algo como:
   - "IvanReseller Affiliate API quiere acceder a tu cuenta"
   - O "Authorize Application"
   - O "Autorizar aplicaci?n"

2. **Haz clic en "Authorize"** o **"Autorizar"** o **"Allow"** o **"Permitir"**

### Paso 4: Obtener el C?digo

Despu?s de autorizar, ser?s **redirigido autom?ticamente** a una URL como esta:

```
https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback?code=ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567YZ
```

**El c?digo es la parte despu?s de `code=`**

En el ejemplo anterior, el c?digo ser?a:
```
ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567YZ
```

### Paso 5: Copiar el C?digo

1. **Mira la barra de direcciones** del navegador despu?s de la redirecci?n
2. **Busca el par?metro `code=`** en la URL
3. **Copia todo el valor** despu?s de `code=` hasta el final (o hasta el siguiente `&` si hay m?s par?metros)

**Ejemplo visual:**
```
URL completa:
https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback?code=ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567YZ

C?digo a copiar:
ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567YZ
```

## ?? Importante

- El c?digo **expira en 10 minutos**, as? que ?salo r?pido
- El c?digo **solo se puede usar una vez**
- Si expira o lo usas, necesitar?s obtener uno nuevo

## Paso 6: Ejecutar el Test

Una vez que tengas el código, ejecuta (desde la raíz del repo o desde `backend`):

```bash
cd backend
npx tsx -r dotenv/config scripts/test-aliexpress-full-flow.ts "TU_CODIGO_AQUI"
```

Reemplaza `TU_CODIGO_AQUI` con el código que copiaste (entre comillas si tiene caracteres raros).

**En Windows PowerShell:**

```powershell
cd backend
$env:DOTENV_CONFIG_PATH=".env.local"; npx tsx -r dotenv/config scripts/test-aliexpress-full-flow.ts "TU_CODIGO_AQUI"
```

## ?? Soluci?n de Problemas

### Problema: La URL me redirige a una p?gina de error

- Verifica que el Redirect URI en la consola de AliExpress sea exactamente:
  `https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback`
- Sin trailing slash, sin espacios, exactamente como est? arriba

### Problema: No veo el par?metro `code` en la URL

- Puede que la p?gina muestre un error
- Verifica que autorizaste la aplicaci?n correctamente
- Intenta de nuevo desde el Paso 1

### Problema: El código no funciona cuando lo uso

- Verifica que copiaste el código completo (puede ser muy largo)
- Asegúrate de que no haya espacios antes o después
- El código debe usarse dentro de 10 minutos

### Problema: Error "IncompleteSignature" con un código real

Si obtienes un código real desde el navegador y el script sigue devolviendo **IncompleteSignature**:

1. El script imprime en consola **TOKEN REQUEST URL (full)** y **SIGN_BASE_STRING**. Copia esos valores.
2. En la respuesta de la API aparece **request_id**. Cópialo también.
3. Abre un ticket en soporte AliExpress (Open Platform / Affiliate) e incluye:
   - El **request_id** de la respuesta.
   - La **URL completa** del request que imprime el script (TOKEN REQUEST URL full).
   - El **SIGN_BASE_STRING** que usaste para generar la firma.
4. Pregunta explícitamente: qué fórmula exacta debe usarse para firmar el request a `GET /rest/auth/token/create` (orden de parámetros, si el path es `/auth/token/create` o `/rest/auth/token/create`, si la firma es SHA256 sin secret en la base, HMAC, etc.).

## ?? Resumen R?pido

1. **Abre**: https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback
2. **Inicia sesi?n** en AliExpress
3. **Autoriza** la aplicaci?n
4. **Copia el c?digo** de la URL de callback
5. **Ejecuta** (desde la raíz del repo, reemplaza `TU_CODIGO` por el código copiado):
   ```powershell
   cd c:\Ivan_Reseller_Web\backend
   $env:DOTENV_CONFIG_PATH=".env.local"; npx tsx -r dotenv/config scripts/test-aliexpress-full-flow.ts "TU_CODIGO"
   ```

## Verificar que el deploy en Railway está activo

Después de hacer push o de ejecutar `.\scripts\deploy-backend-railway.ps1`, comprueba que el backend responde y que el callback devuelve el detalle de AliExpress si falla el token:

```powershell
# Health del backend
Invoke-RestMethod -Uri "https://ivan-reseller-backend-production.up.railway.app/health" -Method Get

# Callback con código de prueba (debe devolver JSON con aliExpressCode y requestId si falla)
Invoke-RestMethod -Uri "https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback?code=test" -Method Get
```

Si la segunda llamada devuelve algo como `aliExpressCode: "IncompleteSignature"` y `requestId`, el deploy nuevo está activo y podrás usar esos datos para soporte AliExpress.
