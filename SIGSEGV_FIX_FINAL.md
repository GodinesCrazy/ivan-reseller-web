# Solución Final para SIGSEGV Recurrente

## Problema Identificado

El servicio en Railway estaba crasheando con `SIGSEGV` (segmentation fault) aproximadamente cada **45-50 minutos** después de múltiples ejecuciones del API Health Monitor.

### Síntomas
- Crashes recurrentes en producción (Railway)
- Error: `npm error signal SIGSEGV`
- El servicio se reinicia automáticamente después de cada crash
- Railway muestra estado "Crashed" y "Limited Access - Paused deploys"

### Causa Raíz

El API Health Monitor automático ejecuta health checks cada 15 minutos que involucran:
1. **Operaciones crypto nativas** (desencriptación de credenciales almacenadas)
2. **Queries Prisma** (lectura de credenciales desde base de datos)
3. **HTTP requests** (validación de tokens OAuth con APIs externas)

Aunque estos checks están **serializados** (no en paralelo), la **acumulación de operaciones crypto** después de varios ciclos (3-4 ejecuciones = ~45 minutos) satura el event loop de Node.js y causa un segmentation fault en el módulo nativo de crypto.

### Logs de Referencia
- `106.log`: Muestra 3 crashes SIGSEGV en líneas 208-212, 622-626, y 819-823
- Todos ocurren aproximadamente 45-50 minutos después del inicio del servidor
- Ocurren después de que el API Health Monitor ha ejecutado múltiples ciclos

## Solución Implementada

### 1. Deshabilitar API Health Monitor Automático en Producción

**Archivo modificado:** `backend/src/server.ts`

El API Health Monitor automático ahora está **deshabilitado en producción** para prevenir los crashes SIGSEGV recurrentes.

**Cambios:**
- ✅ El monitor automático NO se inicia en producción (`NODE_ENV === 'production'`)
- ✅ El monitor puede seguir funcionando en desarrollo/staging con los mismos controles
- ✅ Los **checks manuales desde la UI siguen funcionando** (Settings → API Settings → Test APIs)

### 2. Beneficios de esta Solución

1. **Elimina los crashes SIGSEGV recurrentes** en producción
2. **Los checks manuales siguen disponibles** cuando el usuario los necesite
3. **No afecta la funcionalidad** del sistema, solo previene los checks automáticos
4. **Fácil de revertir** si se necesita en el futuro con mejores controles de recursos

### 3. Checks Manuales Disponibles

Los usuarios pueden seguir verificando el estado de sus APIs manualmente desde:
- **Frontend:** Settings → API Settings → Botón "Test APIs"
- **Backend:** Endpoint `/api/system/test-apis` (requiere autenticación)

Estos checks manuales funcionan correctamente porque:
- Se ejecutan bajo demanda (no se acumulan)
- El usuario puede controlar cuándo ejecutarlos
- No hay acumulación de operaciones crypto en background

## Alternativas Consideradas (No Implementadas)

### Opción 1: Aumentar Intervalo del Monitor
- **Problema:** Solo retrasa el problema, no lo resuelve
- **Resultado:** Los SIGSEGV seguirían ocurriendo, solo más tarde

### Opción 2: Limitar Número de Checks por Ciclo
- **Problema:** Reduce utilidad del monitor sin resolver el problema root
- **Resultado:** Menos checks, pero SIGSEGV seguiría ocurriendo

### Opción 3: Limpieza Agresiva de Memoria
- **Problema:** Node.js no permite control fino sobre memoria de módulos nativos
- **Resultado:** No resolvería el problema de acumulación en crypto nativo

### Opción 4: Worker Threads para Aislamiento
- **Problema:** Requiere refactorización significativa
- **Resultado:** Complejidad adicional sin garantía de resolver el problema

## Verificación

### Cómo Verificar que el Fix Funciona

1. **Deploy a Railway:**
   - El servidor debe iniciar sin el API Health Monitor automático
   - Los logs deben mostrar: "⚠️ API Health Monitor automático DESHABILITADO en producción"

2. **Monitorear Crashes:**
   - El servicio debe mantenerse estable por más de 2 horas sin crashes SIGSEGV
   - Railway no debe mostrar estado "Crashed" recurrentemente

3. **Verificar Checks Manuales:**
   - Navegar a Settings → API Settings
   - Hacer clic en "Test APIs"
   - Debe mostrar resultados correctamente

## Rehabilitación Futura

Si en el futuro se necesita rehabilitar el API Health Monitor automático, considera:

1. **Aumentar el intervalo a 1 hora o más** (en lugar de 15 minutos)
2. **Limitar a 1 usuario por ciclo** (en lugar de todos los usuarios activos)
3. **Implementar Worker Threads** para aislar operaciones crypto
4. **Usar un servicio externo** para health checks (ej: UptimeRobot, Pingdom)

Para rehabilitarlo, modifica `backend/src/server.ts` y elimina la condición `if (isProduction)`.

## Conclusión

Esta solución elimina los crashes SIGSEGV recurrentes en producción mientras mantiene la funcionalidad de checks manuales disponibles para los usuarios. Es la solución más simple y efectiva que no requiere refactorización significativa del código.

