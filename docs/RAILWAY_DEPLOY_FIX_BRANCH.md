# Railway Deploy Fix - Cambiar Branch a fix/go-certification-2

## Problema
Railway est� conectado a la rama `main`, por lo que los commits en `fix/go-certification-2` no se despliegan autom�ticamente.

## Soluci�n: Cambiar Branch en Railway

### Opci�n 1: Cambiar Branch en Producci�n (Recomendado si quieres probar en producci�n)

1. **Ir a Railway Dashboard**
   - Abrir: https://railway.app
   - Seleccionar proyecto: `ivan-reseller-web`

2. **Navegar al Servicio Backend**
   - Seleccionar servicio: `ivan-reseller-web` (o el nombre del servicio backend)

3. **Cambiar Branch de Producci�n**
   - Ir a: **Settings** ? **Source**
   - Buscar: **"Branch connected to production"** o **"Production Branch"**
   - Cambiar de: `main` ? `fix/go-certification-2`
   - Click en **"Save"** o **"Update"**

4. **Verificar Root Directory**
   - En **Settings** ? **Source** o **Deploy**
   - Verificar que **Root Directory** sea: `/backend`
   - Si no, cambiarlo a `/backend`

5. **Redeploy**
   - Ir a: **Deployments**
   - Click en **"Redeploy"** o esperar deploy autom�tico
   - Verificar que el nuevo deployment use commits de `fix/go-certification-2`

6. **Obtener Domain P�blico**
   - Ir a: **Settings** ? **Networking** o **Domains**
   - Copiar el dominio p�blico (ej: `https://ivan-reseller-web-production.up.railway.app`)
   - Guardar en: `docs/RAILWAY_URL.local` (1 l�nea: `RAILWAY_URL=https://...`)
   - **NO commitear** este archivo

### Opci�n 2: Crear Environment Staging (Recomendado si NO quieres tocar producci�n)

1. **Crear Nuevo Environment**
   - En Railway Dashboard ? Proyecto
   - Click en **"New"** ? **"Environment"**
   - Nombre: `staging`

2. **Crear Servicio en Staging**
   - En environment `staging`, crear nuevo servicio
   - Conectar repositorio GitHub
   - Branch: `fix/go-certification-2`
   - Root Directory: `/backend`

3. **Configurar Variables**
   - Copiar variables de producci�n a staging
   - Ajustar `CORS_ORIGIN` si es necesario

4. **Obtener Domain**
   - Railway generar� un dominio para staging
   - Guardar en `docs/RAILWAY_URL.local`

---

## Verificaci�n Post-Deploy

1. **Esperar Build**
   - Verificar que el build termine exitosamente
   - Revisar logs (sin copiar secretos)

2. **Verificar Health/Ready**
   ```bash
   node scripts/wait-for-railway.mjs
   ```
   O manualmente:
   ```bash
   curl https://<RAILWAY_URL>/health
   curl https://<RAILWAY_URL>/ready
   ```

3. **Verificar Commits**
   - En Railway Dashboard ? Deployments
   - Verificar que el commit m�s reciente sea de `fix/go-certification-2`
   - Debe mostrar commit `1ecc78b` o posterior

---

## Troubleshooting

**Build falla:**
- Verificar que `npm run build` pase localmente
- Verificar logs en Railway (sin secretos)

**Deploy no inicia:**
- Verificar que el branch est� correctamente configurado
- Verificar que haya commits nuevos en `fix/go-certification-2`
- Hacer push: `git push origin fix/go-certification-2`

**Health/Ready no responde:**
- Verificar logs de arranque
- Verificar que DATABASE_URL est� configurada
- Verificar que migraciones se ejecuten correctamente
