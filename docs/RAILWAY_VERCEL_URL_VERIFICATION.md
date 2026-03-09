# Verificación URLs Railway y Vercel

## Resumen

El frontend (Vercel) redirige las peticiones `/api/*` al backend (Railway). La URL del backend debe coincidir exactamente con el dominio público del servicio en Railway.

## Configuración actual (vercel.json)

| Origen | Destino |
|--------|---------|
| `/api/:path*` | `https://ivan-reseller-backend-production.up.railway.app/api/:path*` |
| `/aliexpress/callback` | `https://ivan-reseller-backend-production.up.railway.app/aliexpress/callback` |

## Verificación requerida

1. **Railway Dashboard** → Tu proyecto → Servicio backend → **Settings** → **Networking**
2. Verificar **Public Domain** del servicio backend
3. Debe coincidir con la URL en `vercel.json`

### Posibles dominios

- `ivan-reseller-backend-production.up.railway.app` (usado actualmente en vercel.json)
- `ivan-reseller-web-production.up.railway.app` (mencionado en otras documentaciones)

Si el dominio público de Railway es diferente, actualizar `vercel.json` con la URL correcta.

## Dominio custom (ivanreseller.com)

Si el backend tiene dominio custom (ej. `api.ivanreseller.com` o `ivanreseller.com`), configurar `vercel.json` para usar ese dominio en lugar de `*.up.railway.app`.
