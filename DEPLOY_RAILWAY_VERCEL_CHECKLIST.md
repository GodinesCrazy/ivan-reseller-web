# Checklist: despliegue correcto en Railway y Vercel

## Verificación local antes de push

Desde la raíz del repo:

```bash
# Backend (Railway)
cd backend && npm run build

# Frontend (Vercel)
cd frontend && npm run build
```

Ambos deben terminar sin errores. Si fallan, corregir antes de hacer push.

---

## Railway (backend)

### Configuración recomendada

- **Root Directory:** `backend` (en Railway → Backend service → Settings).
- **Build command:** `npm install && npm run build` (por defecto desde `backend/railway.json`).
- **Start command:** `node scripts/railway-start-production.js` (ejecuta migraciones y luego `node dist/server-bootstrap.js`).

Si despliegas desde la **raíz** del repo (sin Root Directory):

- **Build command:** `cd backend && npm install && npm run build`
- **Start command:** `cd backend && npm run start:with-migrations`

### Variables obligatorias

- `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `NODE_ENV=production`
- Opcional: `PRISMA_CONNECTION_LIMIT=8` para no saturar Postgres.

### Después del deploy

```bash
curl https://<TU_URL_RAILWAY>/health
# Esperado: 200 y cuerpo con status ok
```

---

## Vercel (frontend)

### Configuración

- **Root Directory:** vacío (monorepo desde raíz).
- **Install command:** `cd frontend && npm install`
- **Build command:** `cd frontend && npm run build`
- **Output directory:** `frontend/dist`

O usar el `vercel.json` de la raíz, que ya define estos valores.

### Variables (opcional)

- `BACKEND_URL` o `VITE_API_URL`: URL pública del backend (Railway). Si no se define, el build usa por defecto `https://ivan-reseller-backend-production.up.railway.app` para los rewrites de `/api`.

### Después del deploy

- Abrir la URL de Vercel (p. ej. `ivanreseller.com`).
- Comprobar que el dashboard carga y que las llamadas a `/api/*` se redirigen al backend (login, ventas, etc.).

---

## Si el deploy falla

1. **Railway:** Revisar logs del build y del inicio. Si falla el healthcheck, comprobar que `DATABASE_URL` es correcta y que las migraciones terminan (ver `backend/docs/RAILWAY_PRODUCTION_DEPLOY_VERIFICATION.md`).
2. **Vercel:** Revisar el log del build. Errores típicos: fallo de `npm run build` (TypeScript/ESLint) o rutas no encontradas; el script `inject-vercel-backend.mjs` debe ejecutarse antes de `vite build`.
3. **Ambos:** Hacer **Redeploy** con **Clear build cache** si el código ya está corregido y el deploy sigue usando una versión antigua.
