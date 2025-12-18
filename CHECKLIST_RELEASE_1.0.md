# Checklist Release 1.0 Production

## ✅ Pre-Deployment

### Configuración
- [ ] Variables de entorno configuradas en producción
- [ ] `DATABASE_URL` válida y accesible
- [ ] `JWT_SECRET` y `ENCRYPTION_KEY` únicos y seguros (32+ caracteres)
- [ ] `REDIS_URL` configurada (si se usa Redis)
- [ ] `CORS_ORIGIN` configurado al dominio del frontend
- [ ] `NODE_ENV=production`

### Feature Flags
- [ ] `API_HEALTHCHECK_ENABLED=false` (o `true` con `MODE=async`)
- [ ] `API_HEALTHCHECK_MODE=async` (NUNCA sync en prod)
- [ ] `AUTO_PURCHASE_ENABLED=false` (o con límites conservadores)
- [ ] `WEBHOOK_VERIFY_SIGNATURE=true`
- [ ] `RATE_LIMIT_ENABLED=true`

### Secretos
- [ ] `WEBHOOK_SECRET_EBAY` configurado
- [ ] `WEBHOOK_SECRET_MERCADOLIBRE` configurado
- [ ] `WEBHOOK_SECRET_AMAZON` configurado (si aplica)
- [ ] Credenciales de APIs críticas configuradas

---

## 🔨 Build & Deploy

### Backend
- [ ] `cd backend && npm install`
- [ ] `npx prisma generate`
- [ ] `npm run type-check` (verificar errores TypeScript)
- [ ] `npm run build`
- [ ] Verificar que `dist/` contiene archivos compilados

### Frontend
- [ ] `cd frontend && npm install`
- [ ] `npm run type-check`
- [ ] `npm run build`
- [ ] Verificar que `dist/` contiene archivos de producción

### Migraciones
- [ ] `npx prisma migrate status` (verificar estado)
- [ ] `npx prisma migrate deploy` (aplicar migraciones)
- [ ] Verificar que no hay errores

---

## 🧪 Tests

### Tests Unitarios
- [ ] `cd backend && npm test` (si existen tests)
- [ ] `cd frontend && npm test` (si existen tests)

### Smoke Tests
- [ ] Health check: `curl http://localhost:3000/health`
- [ ] Readiness: `curl http://localhost:3000/ready`
- [ ] Login funciona
- [ ] API Settings carga correctamente

---

## 🚀 Deploy

### Servidor
- [ ] Iniciar servidor: `npm run start:with-migrations`
- [ ] Verificar logs de inicio
- [ ] Verificar que migraciones se aplicaron
- [ ] Verificar que health checks responden

### Verificaciones Post-Deploy
- [ ] `/health` retorna `200 OK`
- [ ] `/ready` retorna `200 OK` con `ready: true`
- [ ] Frontend carga correctamente
- [ ] Login funciona
- [ ] APIs cargan en Settings

---

## 🔍 Monitoreo

### Logs
- [ ] Revisar logs de inicio (buscar errores)
- [ ] Verificar que correlation IDs están presentes
- [ ] Verificar que request logging funciona

### Health Checks
- [ ] Health checks automáticos funcionando (si habilitados)
- [ ] WebSocket conexiones establecidas
- [ ] Redis conectado (si configurado)

### Métricas
- [ ] Verificar uptime del servidor
- [ ] Verificar uso de memoria
- [ ] Verificar conexiones a DB

---

## 🔐 Seguridad

### Verificaciones
- [ ] `AUTO_PURCHASE_ENABLED=false` o con límites apropiados
- [ ] `WEBHOOK_VERIFY_SIGNATURE=true` en todos los marketplaces
- [ ] Rate limiting activo
- [ ] CORS configurado (no `*`)
- [ ] Logs no exponen secretos

### Tests de Seguridad
- [ ] Webhook sin firma rechazado (401)
- [ ] Rate limiting funciona (429 después de límite)
- [ ] Auto-purchase bloqueado si `ENABLED=false`

---

## 📊 Post-Deployment

### Monitoreo Continuo (Primeras 24 horas)
- [ ] Revisar logs cada hora
- [ ] Verificar métricas de performance
- [ ] Verificar errores 5xx
- [ ] Verificar rate limiting
- [ ] Verificar health checks

### Validación Funcional
- [ ] Búsqueda de oportunidades funciona
- [ ] Publicación de productos funciona
- [ ] Webhooks reciben y procesan correctamente
- [ ] Notificaciones en tiempo real funcionan

---

## 🆘 Rollback Plan

Si hay problemas críticos:

1. **Detener servicio actual**
2. **Revertir a versión anterior:**
   ```bash
   git checkout <commit-anterior>
   npm install
   npm run build
   npm start
   ```
3. **Verificar que versión anterior funciona**
4. **Documentar problemas encontrados**
5. **Planificar fix para siguiente release**

---

## ✅ Sign-off

- [ ] **Dev Lead:** _________________ Fecha: _______
- [ ] **QA Lead:** _________________ Fecha: _______
- [ ] **DevOps:** _________________ Fecha: _______
- [ ] **Product Owner:** _________________ Fecha: _______

---

## 📝 Notas Post-Release

### Issues Encontrados
- [ ] [Documentar issue 1]
- [ ] [Documentar issue 2]

### Mejoras Futuras
- [ ] [Mejora 1]
- [ ] [Mejora 2]

