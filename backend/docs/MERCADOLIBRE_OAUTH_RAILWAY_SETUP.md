# Configuración MercadoLibre OAuth en Railway

Guía para configurar las variables de entorno necesarias para que el flujo OAuth de MercadoLibre funcione correctamente y evite el error `invalid_signature`.

## Variables obligatorias en Railway

### 1. BACKEND_URL

URL pública del backend donde corre tu API. Se usa para derivar el redirect URI canónico. **Debe coincidir exactamente** con el dominio usado en el callback de MercadoLibre Developer Portal.

**Si MercadoLibre tiene el redirect URI con `https://ivanreseller.com` (sin www):**
```
BACKEND_URL=https://ivanreseller.com
```

**Si el backend está en Railway directamente:**
```
BACKEND_URL=https://ivan-reseller-backend-production.up.railway.app
```

**Local (desarrollo):**
```
BACKEND_URL=http://localhost:4000
```

### 2. MERCADOLIBRE_CLIENT_ID

App ID de MercadoLibre Developer Portal. Ejemplo: `8432109661263766`.

### 3. MERCADOLIBRE_CLIENT_SECRET

Client Secret de MercadoLibre Developer Portal (obtener en la aplicación).

### 4. JWT_SECRET (o ENCRYPTION_KEY)

Se usa para firmar y verificar el parámetro `state` del OAuth. Si ya tienes `JWT_SECRET` configurado, no hace falta `ENCRYPTION_KEY`.

**Valor:** Una cadena larga y aleatoria (mínimo 32 caracteres). Nunca uses `default-key` en producción.

---

## Variables opcionales

### MERCADOLIBRE_REDIRECT_URI

Opcional si `BACKEND_URL` está definido. Úsala solo si el callback usa un dominio distinto al de `BACKEND_URL`.

**Si el callback va por ivanreseller.com (sin www):**
```
https://ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre
```

**Si el callback va por www:**
```
https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre
```

**Si el callback va directo al backend (Railway):**
```
https://ivan-reseller-backend-production.up.railway.app/api/marketplace-oauth/oauth/callback/mercadolibre
```

**IMPORTANTE:** La URL debe coincidir **exactamente** con lo registrado en MercadoLibre Developer Portal (sin trailing slash, mismo protocolo y dominio).

---

## Pasos para añadir en Railway

1. Abre tu proyecto en [Railway](https://railway.app).
2. Selecciona el servicio backend (API).
3. Ve a **Variables**.
4. Añade o edita:
   - `BACKEND_URL` = `https://ivanreseller.com` (o la URL que coincida con MercadoLibre Portal)
   - `MERCADOLIBRE_CLIENT_ID` = App ID (ej. `8432109661263766`)
   - `MERCADOLIBRE_CLIENT_SECRET` = Client Secret del portal
   - Si no existe: `JWT_SECRET` (debe estar definido para auth y OAuth state)
5. Opcional: `MERCADOLIBRE_REDIRECT_URI` = URL de callback explícita si difiere de `BACKEND_URL`
6. Haz **Redeploy** del servicio para aplicar los cambios.

---

## Configuración en MercadoLibre Developer Portal

1. Entra a [Mis aplicaciones](https://developers.mercadolibre.cl/devcenter/).
2. Selecciona "Ivan Reseller" (o tu app).
3. Ve a **Configuración de seguridad** (o editar aplicación).
4. En **URLs de redirección** (Redirect URI), añade exactamente:

   **Opción A – Backend directo:**
   ```
   https://ivan-reseller-web-production.up.railway.app/api/marketplace-oauth/oauth/callback/mercadolibre
   ```

   **Opción B – Frontend/proxy ivanreseller.com (sin www):**
   ```
   https://ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre
   ```

   **Opción C – Frontend con www:**
   ```
   https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre
   ```

5. La URL debe coincidir **exactamente** con la que usa el backend (sin trailing slash, mismo protocolo y dominio).

---

## Resumen de variables MercadoLibre en Railway

| Variable | Obligatoria | Valor |
|----------|-------------|-------|
| `BACKEND_URL` | Sí | `https://ivanreseller.com` (o la URL del backend; debe coincidir con el redirect URI en MercadoLibre) |
| `MERCADOLIBRE_CLIENT_ID` | Sí | `8432109661263766` (App ID del Developer Portal) |
| `MERCADOLIBRE_CLIENT_SECRET` | Sí | Secret del Developer Portal |
| `JWT_SECRET` o `ENCRYPTION_KEY` | Sí | Cadena secreta larga (>=32 chars) |
| `MERCADOLIBRE_REDIRECT_URI` | Opcional | `https://ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre` (solo si difiere de `BACKEND_URL`) |
| `MERCADOLIBRE_SITE_ID` | Opcional | `MLC` (Chile), `MLM` (México), `MLA` (Argentina); por defecto `MLC` |
| `WEBHOOK_SECRET_MERCADOLIBRE` | Opcional | Secret de Notificaciones en MercadoLibre Portal |
| `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE` | Opcional | `true` o `false`; por defecto `true` |

---

## Errores comunes y solución

### "OAuth está incorrectamente configurado" (invalid_signature)

**Causa:** La firma HMAC del parámetro `state` no coincide. Suele deberse a:

1. **JWT_SECRET o ENCRYPTION_KEY faltante o diferente** en Railway. Ambas operaciones (generar auth URL y verificar callback) deben usar el mismo secret.
2. **BACKEND_URL incorrecto**: Si en MercadoLibre Portal tienes `https://ivanreseller.com` (sin www), entonces `BACKEND_URL=https://ivanreseller.com`. Si tienes `https://www.ivanreseller.com`, usa ese valor. Deben coincidir exactamente.
3. **Redirect URI en MercadoLibre** debe ser exactamente: `https://ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre` (sin trailing slash, mismo protocolo y dominio que BACKEND_URL).

**Solución:**
1. Railway → Variables → Verifica `JWT_SECRET` (mínimo 32 caracteres).
2. Railway → Variables → `BACKEND_URL` = la misma URL que usaste en MercadoLibre (ej. `https://ivanreseller.com`).
3. MercadoLibre Developer Portal → URLs de redirección → Debe coincidir exactamente con `{BACKEND_URL}/api/marketplace-oauth/oauth/callback/mercadolibre`.
4. Redeploy del backend en Railway tras cambiar variables.

---

## Verificación

Tras configurar:

1. Redeploy del backend en Railway.
2. Verificar que `BACKEND_URL` (o `MERCADOLIBRE_REDIRECT_URI`) coincida con lo registrado en MercadoLibre.
3. Iniciar OAuth desde API Settings → MercadoLibre.
4. Autorizar en MercadoLibre y confirmar que el callback completa sin `invalid_signature`.
