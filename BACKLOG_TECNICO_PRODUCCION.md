# 📋 BACKLOG TÉCNICO - PREPARACIÓN PARA PRODUCCIÓN
## Sistema Ivan Reseller - www.ivanreseller.com

**Fecha:** 2025-11-15  
**Objetivo:** Corregir, completar y optimizar el sistema hasta que esté listo para producción  
**Prioridad:** Alta - Sistema debe estar funcional según manual

---

## 📊 RESUMEN DEL BACKLOG

| Categoría | Total | Críticos | Altos | Medios | Bajos |
|-----------|-------|----------|-------|--------|-------|
| **A. Compilación/Runtime** | 8 | 3 | 3 | 2 | 0 |
| **B. Flujos Funcionales** | 15 | 5 | 7 | 3 | 0 |
| **C. Seguridad/Multi-Tenant** | 12 | 4 | 5 | 3 | 0 |
| **D. Inconsistencias Manual** | 10 | 2 | 5 | 3 | 0 |
| **E. Arquitectura/Mantenibilidad** | 9 | 1 | 4 | 4 | 0 |
| **F. Despliegue/Configuración** | 7 | 2 | 3 | 2 | 0 |
| **TOTAL** | **61** | **17** | **27** | **17** | **0** |

---

## A. ERRORES DE COMPILACIÓN, TIPOS O RUNTIME

### A1. 🔴 CRÍTICO: Autopilot usa userId hardcodeado
**Impacto:** Alto  
**Tipo:** Bug  
**Archivos:** `backend/src/services/autopilot.service.ts:421`  
**Problema:** `const currentUserId = userId || 1;` - Usa userId=1 por defecto en lugar de requerirlo  
**Solución:** Hacer userId obligatorio, eliminar fallback a 1  
**Estado:** Pendiente

### A2. 🔴 CRÍTICO: @ts-nocheck en servicios críticos
**Impacto:** Alto  
**Tipo:** Mejora  
**Archivos:** `backend/src/services/product.service.ts:1`, `backend/src/services/sale.service.ts:1`  
**Problema:** Desactiva verificación de tipos TypeScript, puede ocultar errores  
**Solución:** Eliminar @ts-nocheck y corregir errores de tipos reales  
**Estado:** Pendiente

### A3. 🔴 CRÍTICO: Falta validación de ENCRYPTION_KEY al inicio
**Impacto:** Alto  
**Tipo:** Seguridad  
**Archivos:** `backend/src/services/credentials-manager.service.ts`  
**Problema:** Si ENCRYPTION_KEY no está configurado, el sistema falla silenciosamente  
**Solución:** Validar al inicio del servidor y fallar con mensaje claro  
**Estado:** Pendiente

### A4. 🟠 ALTO: 143 TODOs/FIXMEs en código
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Múltiples  
**Problema:** Código con TODOs que pueden indicar funcionalidades incompletas  
**Solución:** Revisar y resolver o documentar cada TODO  
**Estado:** Pendiente

### A5. 🟠 ALTO: 587 console.log en producción
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Múltiples  
**Problema:** console.log expone información y no usa logger estructurado  
**Solución:** Reemplazar todos los console.log con logger estructurado  
**Estado:** Pendiente

### A6. 🟠 ALTO: Vulnerabilidad en dependencia xlsx
**Impacto:** Alto  
**Tipo:** Seguridad  
**Archivos:** `package.json`  
**Problema:** xlsx tiene vulnerabilidades conocidas (Prototype Pollution, ReDoS)  
**Solución:** Migrar a exceljs o implementar validación estricta  
**Estado:** Pendiente

### A7. 🟡 MEDIO: Falta validación de tipos en algunos endpoints
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Varios routes  
**Problema:** Algunos endpoints no validan tipos de entrada con Zod  
**Solución:** Agregar validación Zod a todos los endpoints  
**Estado:** Pendiente

### A8. 🟡 MEDIO: Errores de runtime no manejados
**Impacto:** Medio  
**Tipo:** Bug  
**Archivos:** Varios servicios  
**Problema:** Algunos errores no se capturan correctamente  
**Solución:** Revisar try-catch y manejo de errores  
**Estado:** Pendiente

---

## B. RUTAS / FLUJOS FUNCIONALES ROTOS O INCOMPLETOS

### B1. 🔴 CRÍTICO: Flujo de registro público deshabilitado pero manual lo menciona
**Impacto:** Alto  
**Tipo:** Inconsistencia Manual  
**Archivos:** `backend/src/api/routes/auth.routes.ts:25`, `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Manual menciona registro pero está deshabilitado (correcto, pero manual debe actualizarse)  
**Solución:** Actualizar manual o verificar que el flujo admin→crear usuario funciona  
**Estado:** Pendiente

### B2. 🔴 CRÍTICO: Autopilot no integra MarketplaceService para publicar
**Impacto:** Alto  
**Tipo:** Falta de funcionalidad  
**Archivos:** `backend/src/services/autopilot.service.ts`  
**Problema:** Autopilot crea productos pero no los publica realmente en marketplaces  
**Solución:** Integrar MarketplaceService.publishProduct en Autopilot  
**Estado:** Pendiente (parcialmente resuelto según auditorías)

### B3. 🔴 CRÍTICO: Falta endpoint de recuperación de contraseña
**Impacto:** Alto  
**Tipo:** Falta de funcionalidad  
**Archivos:** `backend/src/api/routes/auth.routes.ts`  
**Problema:** No hay `/api/auth/forgot-password` ni `/api/auth/reset-password`  
**Solución:** Implementar flujo completo de recuperación con tokens y email  
**Estado:** Pendiente

### B4. 🔴 CRÍTICO: Falta refresh tokens completo
**Impacto:** Alto  
**Tipo:** Falta de funcionalidad  
**Archivos:** `backend/src/services/auth.service.ts`, `backend/src/api/routes/auth.routes.ts`  
**Problema:** Hay código de refresh pero puede estar incompleto  
**Solución:** Verificar e implementar refresh tokens completo con blacklist  
**Estado:** Pendiente (parcialmente implementado)

### B5. 🔴 CRÍTICO: Workflow Config no tiene UI completa
**Impacto:** Alto  
**Tipo:** Falta de funcionalidad  
**Archivos:** `frontend/src/pages/WorkflowConfig.tsx`  
**Problema:** Backend tiene endpoints pero frontend puede estar incompleto  
**Solución:** Verificar y completar UI de Workflow Config  
**Estado:** Pendiente

### B6. 🟠 ALTO: Dashboard no muestra datos reales en algunos casos
**Impacto:** Medio  
**Tipo:** Bug  
**Archivos:** `frontend/src/pages/Dashboard.tsx`, `backend/src/api/routes/dashboard.routes.ts`  
**Problema:** Algunos componentes pueden mostrar datos mock o vacíos  
**Solución:** Verificar que todos los datos vienen del backend  
**Estado:** Pendiente

### B7. 🟠 ALTO: Publicación en marketplaces puede fallar sin mensaje claro
**Impacto:** Medio  
**Tipo:** Bug  
**Archivos:** `backend/src/services/marketplace.service.ts`  
**Problema:** Errores de publicación no se comunican claramente al usuario  
**Solución:** Mejorar manejo de errores y mensajes al usuario  
**Estado:** Pendiente

### B8. 🟠 ALTO: Sistema de notificaciones puede no estar funcionando
**Impacto:** Medio  
**Tipo:** Bug  
**Archivos:** `backend/src/services/notification.service.ts`, `frontend/src/hooks/useNotifications.ts`  
**Problema:** Notificaciones pueden no llegar al frontend  
**Solución:** Verificar WebSocket/Socket.io o polling  
**Estado:** Pendiente

### B9. 🟠 ALTO: Cálculo de comisiones puede tener inconsistencias
**Impacto:** Medio  
**Tipo:** Bug  
**Archivos:** `backend/src/services/sale.service.ts`, `backend/src/services/commission.service.ts`  
**Problema:** Verificar que el cálculo de comisiones (20% de gross profit) es correcto  
**Solución:** Revisar lógica de cálculo y tests  
**Estado:** Pendiente

### B10. 🟠 ALTO: Oportunidades pueden no filtrarse por usuario
**Impacto:** Medio  
**Tipo:** Bug Multi-Tenant  
**Archivos:** `backend/src/services/opportunity-finder.service.ts`  
**Problema:** Verificar que las oportunidades se guardan con userId correcto  
**Solución:** Revisar que todas las oportunidades tienen userId  
**Estado:** Pendiente

### B11. 🟠 ALTO: Autopilot no respeta configuración de workflow por usuario
**Impacto:** Medio  
**Tipo:** Bug  
**Archivos:** `backend/src/services/autopilot.service.ts`  
**Problema:** Autopilot puede no estar usando workflowConfigService correctamente  
**Solución:** Verificar integración con workflowConfigService  
**Estado:** Pendiente

### B12. 🟠 ALTO: Productos pueden no filtrarse correctamente por usuario
**Impacto:** Medio  
**Tipo:** Bug Multi-Tenant  
**Archivos:** `backend/src/services/product.service.ts`, `backend/src/api/routes/products.routes.ts`  
**Problema:** Verificar que todos los queries de productos filtran por userId  
**Solución:** Revisar todos los métodos de ProductService  
**Estado:** Pendiente

### B13. 🟡 MEDIO: Reportes pueden no estar completos
**Impacto:** Bajo  
**Tipo:** Falta de funcionalidad  
**Archivos:** `backend/src/api/routes/reports.routes.ts`, `frontend/src/pages/Reports.tsx`  
**Problema:** Algunos reportes pueden estar incompletos  
**Solución:** Verificar y completar reportes según manual  
**Estado:** Pendiente

### B14. 🟡 MEDIO: Exportación de reportes puede fallar
**Impacto:** Bajo  
**Tipo:** Bug  
**Archivos:** `backend/src/api/routes/reports.routes.ts`  
**Problema:** Exportación CSV/Excel puede tener problemas  
**Solución:** Verificar y corregir exportación  
**Estado:** Pendiente

### B15. 🟡 MEDIO: Sistema de jobs puede no estar funcionando
**Impacto:** Bajo  
**Tipo:** Bug  
**Archivos:** `backend/src/services/job.service.ts`, `backend/src/api/routes/jobs.routes.ts`  
**Problema:** BullMQ jobs pueden no estar configurados correctamente  
**Solución:** Verificar configuración de BullMQ y workers  
**Estado:** Pendiente

---

## C. PROBLEMAS DE SEGURIDAD Y MULTI-TENANT

### C1. 🔴 CRÍTICO: Tokens almacenados en localStorage (vulnerable a XSS)
**Impacto:** Alto  
**Tipo:** Seguridad  
**Archivos:** `frontend/src/stores/authStore.ts`  
**Problema:** Tokens JWT en localStorage son vulnerables a XSS  
**Solución:** Migrar a httpOnly cookies o implementar CSP estricto  
**Estado:** Pendiente

### C2. 🔴 CRÍTICO: Falta validación de ownership en algunos endpoints
**Impacto:** Alto  
**Tipo:** Seguridad Multi-Tenant  
**Archivos:** Varios routes  
**Problema:** Algunos endpoints pueden no validar que el recurso pertenece al usuario  
**Solución:** Revisar todos los endpoints y agregar validación de ownership  
**Estado:** Pendiente

### C3. 🔴 CRÍTICO: Admin puede ver datos de todos sin restricciones
**Impacto:** Alto  
**Tipo:** Seguridad  
**Archivos:** Varios servicios  
**Problema:** Admin bypass puede ser demasiado permisivo  
**Solución:** Revisar y limitar acceso admin solo donde sea necesario  
**Estado:** Pendiente

### C4. 🔴 CRÍTICO: Credenciales pueden estar en logs
**Impacto:** Alto  
**Tipo:** Seguridad  
**Archivos:** Varios servicios  
**Problema:** A pesar de redact.ts, algunos logs pueden exponer credenciales  
**Solución:** Revisar todos los logs y asegurar redacción  
**Estado:** Pendiente

### C5. 🟠 ALTO: Falta rate limiting en algunos endpoints críticos
**Impacto:** Medio  
**Tipo:** Seguridad  
**Archivos:** Varios routes  
**Problema:** Algunos endpoints pueden no tener rate limiting  
**Solución:** Agregar rate limiting a todos los endpoints críticos  
**Estado:** Pendiente

### C6. 🟠 ALTO: Queries de base de datos pueden no filtrar por userId
**Impacto:** Medio  
**Tipo:** Seguridad Multi-Tenant  
**Archivos:** Varios servicios  
**Problema:** Algunas queries pueden no incluir filtro por userId  
**Solución:** Auditar todas las queries y agregar filtros donde falten  
**Estado:** Pendiente

### C7. 🟠 ALTO: Falta validación de CORS en producción
**Impacto:** Medio  
**Tipo:** Seguridad  
**Archivos:** `backend/src/app.ts`  
**Problema:** CORS puede estar demasiado permisivo  
**Solución:** Configurar CORS estricto para ivanreseller.com  
**Estado:** Pendiente

### C8. 🟠 ALTO: Falta Content Security Policy (CSP)
**Impacto:** Medio  
**Tipo:** Seguridad  
**Archivos:** `backend/src/app.ts`, `frontend/index.html`  
**Problema:** No hay CSP headers configurados  
**Solución:** Implementar CSP headers  
**Estado:** Pendiente

### C9. 🟠 ALTO: Falta validación de input en algunos formularios
**Impacto:** Medio  
**Tipo:** Seguridad  
**Archivos:** Varios componentes frontend  
**Problema:** Algunos formularios pueden no validar inputs  
**Solución:** Agregar validación Zod en frontend  
**Estado:** Pendiente

### C10. 🟡 MEDIO: Falta sanitización de outputs
**Impacto:** Bajo  
**Tipo:** Seguridad  
**Archivos:** Varios componentes frontend  
**Problema:** Outputs pueden no estar sanitizados contra XSS  
**Solución:** Revisar y sanitizar outputs  
**Estado:** Pendiente

### C11. 🟡 MEDIO: Falta logging de acciones críticas
**Impacto:** Bajo  
**Tipo:** Seguridad  
**Archivos:** Varios servicios  
**Problema:** Algunas acciones críticas no se registran  
**Solución:** Agregar logging de acciones críticas  
**Estado:** Pendiente

### C12. 🟡 MEDIO: Falta expiración de sesiones
**Impacto:** Bajo  
**Tipo:** Seguridad  
**Archivos:** `backend/src/services/auth.service.ts`  
**Problema:** Tokens pueden tener expiración muy larga  
**Solución:** Configurar expiración razonable y refresh tokens  
**Estado:** Pendiente

---

## D. INCONSISTENCIAS ENTRE MANUAL Y CÓDIGO

### D1. 🔴 CRÍTICO: Manual menciona funcionalidades no implementadas
**Impacto:** Alto  
**Tipo:** Inconsistencia Manual  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Manual promete funcionalidades que pueden no estar implementadas  
**Solución:** Auditar manual vs código y corregir inconsistencias  
**Estado:** Pendiente

### D2. 🔴 CRÍTICO: URLs en manual vs código (ivanreseller.com)
**Impacto:** Alto  
**Tipo:** Configuración  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`, `docker-compose.yml`, `.env.example`  
**Problema:** Manual menciona ivanreseller.com pero código puede tener localhost  
**Solución:** Actualizar todas las URLs a ivanreseller.com  
**Estado:** Pendiente

### D3. 🟠 ALTO: Manual menciona APIs que pueden no estar configuradas
**Impacto:** Medio  
**Tipo:** Inconsistencia Manual  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Manual lista APIs que pueden no estar en el sistema  
**Solución:** Verificar que todas las APIs mencionadas existen  
**Estado:** Pendiente

### D4. 🟠 ALTO: Flujos del manual no coinciden con código
**Impacto:** Medio  
**Tipo:** Inconsistencia Manual  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Algunos flujos descritos pueden no funcionar así  
**Solución:** Verificar cada flujo y corregir manual o código  
**Estado:** Pendiente

### D5. 🟠 ALTO: Manual menciona características de Autopilot no implementadas
**Impacto:** Medio  
**Tipo:** Inconsistencia Manual  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`, `backend/src/services/autopilot.service.ts`  
**Problema:** Manual puede mencionar características que no están implementadas  
**Solución:** Verificar y corregir  
**Estado:** Pendiente

### D6. 🟠 ALTO: Manual menciona reportes que pueden no existir
**Impacto:** Medio  
**Tipo:** Inconsistencia Manual  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`, `backend/src/api/routes/reports.routes.ts`  
**Problema:** Manual lista reportes que pueden no estar implementados  
**Solución:** Verificar y corregir  
**Estado:** Pendiente

### D7. 🟠 ALTO: Manual menciona notificaciones que pueden no funcionar
**Impacto:** Medio  
**Tipo:** Inconsistencia Manual  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Manual describe notificaciones que pueden no estar funcionando  
**Solución:** Verificar y corregir  
**Estado:** Pendiente

### D8. 🟡 MEDIO: Manual tiene información desactualizada
**Impacto:** Bajo  
**Tipo:** Documentación  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Algunas secciones pueden estar desactualizadas  
**Solución:** Revisar y actualizar manual  
**Estado:** Pendiente

### D9. 🟡 MEDIO: Manual no menciona limitaciones conocidas
**Impacto:** Bajo  
**Tipo:** Documentación  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Manual no menciona limitaciones o bugs conocidos  
**Solución:** Agregar sección de limitaciones conocidas  
**Estado:** Pendiente

### D10. 🟡 MEDIO: Manual tiene ejemplos que no funcionan
**Impacto:** Bajo  
**Tipo:** Documentación  
**Archivos:** `MANUAL_COMPLETO_SISTEMA.txt`  
**Problema:** Algunos ejemplos pueden no funcionar  
**Solución:** Verificar y corregir ejemplos  
**Estado:** Pendiente

---

## E. PROBLEMAS DE ARQUITECTURA / MANTENIBILIDAD

### E1. 🔴 CRÍTICO: Duplicación de mapeo de campos de APIs
**Impacto:** Alto  
**Tipo:** Mejora  
**Archivos:** `frontend/src/pages/APISettings.tsx`, `backend/src/services/credentials-manager.service.ts`  
**Problema:** Mapeo de campos duplicado en frontend y backend  
**Solución:** Centralizar mapeo en un solo lugar (backend)  
**Estado:** Pendiente

### E2. 🟠 ALTO: Falta centralización de validaciones
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Varios  
**Problema:** Validaciones duplicadas en frontend y backend  
**Solución:** Centralizar validaciones en backend, frontend solo UX  
**Estado:** Pendiente

### E3. 🟠 ALTO: Falta manejo centralizado de errores
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Varios  
**Problema:** Manejo de errores inconsistente  
**Solución:** Centralizar manejo de errores  
**Estado:** Pendiente

### E4. 🟠 ALTO: Falta documentación JSDoc en algunos servicios
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Varios servicios  
**Problema:** Algunos servicios no tienen JSDoc completo  
**Solución:** Agregar JSDoc a todos los servicios públicos  
**Estado:** Pendiente

### E5. 🟠 ALTO: Código muerto o no utilizado
**Impacto:** Medio  
**Tipo:** Mejora  
**Archivos:** Varios  
**Problema:** Puede haber código no utilizado  
**Solución:** Identificar y eliminar código muerto  
**Estado:** Pendiente

### E6. 🟡 MEDIO: Falta tests unitarios
**Impacto:** Bajo  
**Tipo:** Mejora  
**Archivos:** Todos  
**Problema:** No hay tests unitarios  
**Solución:** Agregar tests para funcionalidades críticas  
**Estado:** Pendiente

### E7. 🟡 MEDIO: Falta tests de integración
**Impacto:** Bajo  
**Tipo:** Mejora  
**Archivos:** Todos  
**Problema:** No hay tests de integración  
**Solución:** Agregar tests de integración para flujos E2E  
**Estado:** Pendiente

### E8. 🟡 MEDIO: Falta documentación de API (Swagger completo)
**Impacto:** Bajo  
**Tipo:** Mejora  
**Archivos:** `backend/src/config/swagger.ts`  
**Problema:** Swagger puede estar incompleto  
**Solución:** Completar documentación Swagger  
**Estado:** Pendiente

### E9. 🟡 MEDIO: Falta guía de contribución
**Impacto:** Bajo  
**Tipo:** Documentación  
**Archivos:** `README.md`  
**Problema:** No hay guía clara para contribuir  
**Solución:** Agregar guía de contribución  
**Estado:** Pendiente

---

## F. DESPLIEGUE / CONFIGURACIÓN

### F1. 🔴 CRÍTICO: Docker Compose no está configurado para producción
**Impacto:** Alto  
**Tipo:** Configuración  
**Archivos:** `docker-compose.yml`  
**Problema:** Docker Compose tiene configuración de desarrollo  
**Solución:** Crear docker-compose.prod.yml para producción  
**Estado:** Pendiente

### F2. 🔴 CRÍTICO: Variables de entorno no están documentadas completamente
**Impacto:** Alto  
**Tipo:** Configuración  
**Archivos:** `.env.example`, `backend/.env.example`  
**Problema:** Faltan variables de entorno o no están documentadas  
**Solución:** Completar .env.example con todas las variables necesarias  
**Estado:** Pendiente

### F3. 🟠 ALTO: NGINX no está configurado
**Impacto:** Medio  
**Tipo:** Configuración  
**Archivos:** `nginx/` (si existe)  
**Problema:** NGINX no está configurado para ivanreseller.com  
**Solución:** Configurar NGINX como reverse proxy  
**Estado:** Pendiente

### F4. 🟠 ALTO: Scripts de inicio no están actualizados
**Impacto:** Medio  
**Tipo:** Configuración  
**Archivos:** `iniciar-sistema.bat`, `start-system.ps1`  
**Problema:** Scripts pueden tener URLs hardcodeadas  
**Solución:** Actualizar scripts para usar ivanreseller.com  
**Estado:** Pendiente

### F5. 🟠 ALTO: Falta configuración de SSL/TLS
**Impacto:** Medio  
**Tipo:** Configuración  
**Archivos:** NGINX, Docker  
**Problema:** No hay configuración de SSL para HTTPS  
**Solución:** Configurar Let's Encrypt o certificados SSL  
**Estado:** Pendiente

### F6. 🟡 MEDIO: Falta configuración de monitoreo
**Impacto:** Bajo  
**Tipo:** Configuración  
**Archivos:** Varios  
**Problema:** No hay sistema de monitoreo configurado  
**Solución:** Configurar monitoreo (ej: PM2, Sentry)  
**Estado:** Pendiente

### F7. 🟡 MEDIO: Falta configuración de backups
**Impacto:** Bajo  
**Tipo:** Configuración  
**Archivos:** Varios  
**Problema:** No hay sistema de backups configurado  
**Solución:** Configurar backups automáticos de base de datos  
**Estado:** Pendiente

---

## 📝 NOTAS

- **Prioridad de trabajo:** A → B → C → D → E → F
- **Dentro de cada categoría:** Críticos primero, luego Altos, luego Medios
- **Cada ítem debe:** Compilar, funcionar E2E, mantener seguridad/multi-tenant
- **No avanzar** sin validar que el cambio funciona

---

**Última actualización:** 2025-11-15  
**Estado:** Pendiente de inicio de trabajo

