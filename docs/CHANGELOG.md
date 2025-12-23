# 📋 Changelog - Ivan Reseller

**Historial de cambios y mejoras del sistema**

---

## [Unreleased]

### En Desarrollo
- Mejoras continuas en el sistema de workflow
- Optimizaciones de performance
- Nuevas integraciones de marketplaces

---

## [2025-01-27] - Documentación Enterprise

### Agregado
- Documentación enterprise completa (SETUP_LOCAL, DEPLOYMENT_RAILWAY, SECURITY, TROUBLESHOOTING, ARCHITECTURE)
- Manual in-app de APIs (12 APIs documentadas)
- Sistema de Help Center con documentación integrada
- Documentos para inversionistas (gated)

### Mejorado
- README.md actualizado con enlaces a nueva documentación
- Help Center mejorado con navegación a documentación

---

## [2025-01-26] - Sistema de Workflow

### Agregado
- Modo Guided completo en todas las etapas críticas
- Override de WorkflowMode global (Manual/Automatic)
- Validación de consistencia de configuración
- Servicio centralizado de tracking de acciones guided
- UI mejorada con badges y explicaciones

### Mejorado
- `getStageMode()` ahora respeta `workflowMode` global
- Manejo de timeouts en modo Guided
- Validación de configuración de workflow

**Ver changelog completo:** [docs/CHANGELOG_WORKFLOW_2025_01_26.md](./CHANGELOG_WORKFLOW_2025_01_26.md)

---

## [2025-01-11] - Fix CORS y Documentación

### Corregido
- Error "Cannot access 'env' before initialization" en server.ts
- Endpoint `/api/dashboard/summary` agregado (alias de `/api/dashboard/stats`)
- Headers CORS garantizados en todas las respuestas (incluyendo errores)
- Parser robusto de CORS_ORIGIN (limpia prefijos incrustados)
- Frontend: degradación suave en componentes opcionales

### Agregado
- Endpoint `/api/cors-debug` para diagnóstico de CORS
- Scripts de verificación de CORS (`scripts/verify_cors.ps1`)
- Documentación de troubleshooting de CORS

**Ver changelog completo:** [docs/CHANGELOG_CORS_AND_DOCS.md](./CHANGELOG_CORS_AND_DOCS.md)

---

## [2025-01-XX] - Versiones Anteriores

Para changelogs anteriores, consultar:
- `docs/CHANGELOG_WORKFLOW_2025_01_26.md`
- `docs/CHANGELOG_CORS_AND_DOCS.md`
- `docs/CHANGELOG_MEJORAS_2025-11-15.md`

---

## Formato de Versiones

Este changelog sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

### Tipos de Cambios

- **Agregado** - Nuevas funcionalidades
- **Cambiado** - Cambios en funcionalidades existentes
- **Deprecado** - Funcionalidades que serán eliminadas
- **Eliminado** - Funcionalidades eliminadas
- **Corregido** - Corrección de bugs
- **Seguridad** - Vulnerabilidades corregidas

---

**Última actualización:** 2025-01-27

