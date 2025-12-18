# Railway Deploy Steps - Ivan Reseller Web

## Pasos para Desplegar en Railway

### 1. Preparar Repositorio
- Rama: `fix/go-certification-2`
- Push a origin: `git push origin fix/go-certification-2`

### 2. Crear/Seleccionar Proyecto Railway
1. Ir a Railway Dashboard
2. Crear nuevo proyecto o seleccionar existente
3. Conectar repositorio GitHub
4. Seleccionar rama: `fix/go-certification-2`

### 3. Configurar Servicio Backend
Railway detectará automáticamente:
- **Nixpacks:** Detecta `nixpacks.toml` en `backend/`
- **Root Directory:** Debe ser `backend/` (ajustar si necesario)
- **Build Command:** `npm run build` (según nixpacks.toml)
- **Start Command:** `sh ./start.sh` (según nixpacks.toml) o `npm run start:with-migrations` (según Procfile)

### 4. Variables de Entorno Requeridas

**CRÍTICAS (obligatorias):**
- `DATABASE_URL` - URL completa de PostgreSQL (formato: `postgresql://user:pass@host:port/db`)
- `JWT_SECRET` - String de al menos 32 caracteres
- `ENCRYPTION_KEY` - String de al menos 32 caracteres (puede ser igual a JWT_SECRET)

**IMPORTANTES:**
- `CORS_ORIGIN` - Origen permitido (ej: `https://frontend.railway.app` o `*` para desarrollo)
- `NODE_ENV` - `production`

**OPCIONALES (con defaults):**
- `API_HEALTHCHECK_ENABLED` - `false` (recomendado: async mode)
- `API_HEALTHCHECK_MODE` - `async` (previene SIGSEGV)
- `API_HEALTHCHECK_INTERVAL_MS` - `900000` (15 min)
- `SCRAPER_BRIDGE_URL` - URL del scraper bridge (si aplica)
- `SCRAPER_BRIDGE_ENABLED` - `true` o `false`
- `PORT` - Railway lo asigna automáticamente (no configurar manualmente)

**NOTA:** NO incluir valores aquí. Configurar en Railway Dashboard ? Variables.

### 5. Conectar Base de Datos PostgreSQL
1. En Railway Dashboard, agregar servicio PostgreSQL
2. Railway generará automáticamente `DATABASE_URL`
3. Copiar `DATABASE_URL` completa desde PostgreSQL ? Variables
4. Pegar en Backend ? Variables ? `DATABASE_URL`

### 6. Habilitar Domain Público
1. En Railway Dashboard ? Backend Service ? Settings
2. Habilitar "Generate Domain"
3. Copiar URL generada (ej: `https://xxxxx.up.railway.app`)
4. Guardar en `docs/RAILWAY_URL.local` (NO commitear)

### 7. Verificar Deploy
1. Esperar a que el build termine
2. Verificar logs de arranque (sin secretos)
3. Ejecutar: `node scripts/wait-for-railway.mjs --url <RAILWAY_URL>`
4. Verificar endpoints:
   - `curl https://<RAILWAY_URL>/health` ? debe retornar 200
   - `curl https://<RAILWAY_URL>/ready` ? debe retornar 200 (después de migraciones)

### 8. Troubleshooting

**Backend no arranca:**
- Verificar logs en Railway Dashboard
- Verificar que DATABASE_URL esté correctamente configurada
- Verificar que JWT_SECRET y ENCRYPTION_KEY tengan >= 32 caracteres

**/ready retorna 503:**
- Normal durante migraciones iniciales
- Esperar 2-5 minutos
- Verificar logs de migraciones

**Build falla:**
- Verificar que `npm run build` pase localmente
- Verificar que todas las dependencias estén en package.json

---

## Checklist Pre-Deploy

- [ ] Rama `fix/go-certification-2` pusheada a origin
- [ ] Build local pasa: `cd backend && npm run build`
- [ ] Tests locales pasan: `cd backend && npm test`
- [ ] Variables de entorno listadas (sin valores)
- [ ] PostgreSQL service creado en Railway
- [ ] DATABASE_URL configurada en Backend service
- [ ] JWT_SECRET y ENCRYPTION_KEY configuradas (>=32 chars)
- [ ] CORS_ORIGIN configurado
- [ ] Domain público habilitado
- [ ] URL copiada a `docs/RAILWAY_URL.local` (NO commitear)
