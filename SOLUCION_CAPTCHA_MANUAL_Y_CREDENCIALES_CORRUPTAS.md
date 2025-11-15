# Solución: Resolución Manual de CAPTCHA y Manejo de Credenciales Corruptas

## Problema Identificado

1. **No se encontraban oportunidades de negocio**: El sistema no podía encontrar productos en AliExpress cuando había CAPTCHA o cuando AliExpress sospechaba que era un bot.

2. **Credenciales corruptas de Amazon**: Error `UNKNOWN_ERROR: Unsupported state or unable to authenticate data` indicando que las credenciales están corruptas o fueron encriptadas con una clave diferente.

3. **Falta de resolución manual de CAPTCHA**: El modelo original tenía un sistema que abría una página web para que el usuario resolviera el CAPTCHA manualmente, pero esta funcionalidad no estaba implementada en el sistema actual.

## Soluciones Implementadas

### 1. ✅ Sistema de Resolución Manual de CAPTCHA

Se ha creado un servicio completo (`ManualCaptchaService`) que:

- **Detecta CAPTCHA automáticamente** durante el scraping de oportunidades
- **Abre un navegador visible** (no-headless) con la página que tiene el CAPTCHA
- **Espera a que el usuario resuelva el CAPTCHA** (polling cada 2 segundos)
- **Continúa automáticamente** con el proceso una vez resuelto
- **Notifica al usuario** sobre el estado del CAPTCHA

#### Archivos Creados/Modificados:

- `backend/src/services/manual-captcha.service.ts` - Servicio principal
- `backend/src/api/routes/manual-captcha.routes.ts` - Endpoints API
- `backend/src/services/opportunity-finder.service.ts` - Integración con búsqueda de oportunidades
- `backend/src/app.ts` - Registro de rutas

#### Flujo de Funcionamiento:

1. **Detección de CAPTCHA**: Cuando el sistema detecta un CAPTCHA durante el scraping:
   ```typescript
   const isCaptchaError = nativeError?.code === 'CAPTCHA_REQUIRED' ||
     nativeMsg.includes('captcha') ||
     nativeMsg.includes('no se pudo evadir');
   ```

2. **Inicio de Sesión Manual**: Se crea una sesión y se abre el navegador:
   ```typescript
   const captchaSession = await ManualCaptchaService.startSession(
     userId,
     searchUrl,
     searchUrl
   );
   ```

3. **Espera de Resolución**: El sistema espera hasta 5 minutos a que el usuario resuelva:
   ```typescript
   const solved = await ManualCaptchaService.waitForCaptchaResolution(
     captchaSession.token,
     5 * 60 * 1000
   );
   ```

4. **Continuación Automática**: Una vez resuelto, el sistema continúa con el scraping.

#### Endpoints API Disponibles:

- `POST /api/manual-captcha/start` - Iniciar sesión de CAPTCHA
- `GET /api/manual-captcha/status/:token` - Verificar estado
- `GET /api/manual-captcha/active` - Obtener sesión activa
- `POST /api/manual-captcha/complete/:token` - Marcar como completado
- `POST /api/manual-captcha/cancel/:token` - Cancelar sesión

### 2. ✅ Manejo Mejorado de Credenciales Corruptas

El sistema ya tenía detección automática de credenciales corruptas, pero ahora:

- **Se desactivan automáticamente** cuando se detectan
- **Se registran en logs** con información detallada
- **Se proporciona solución clara** al usuario: "Elimina y vuelve a guardar las credenciales"

#### Código Existente (Mejorado):

```typescript
// En CredentialsManager.getCredentialEntry()
if (isCorruptionError) {
  console.error(`🔒 [CredentialsManager] Credenciales corruptas detectadas: ${apiName}`);
  console.error(`   Solución: Elimina y vuelve a guardar las credenciales en API Settings`);
  
  // Desactivar automáticamente
  await prisma.apiCredential.update({
    where: { id: personalCredential.id },
    data: { isActive: false },
  });
}
```

#### Endpoint de Limpieza (Admin):

- `POST /api/api-credentials/maintenance/clean-corrupted` - Limpiar todas las credenciales corruptas

### 3. ✅ Integración con Búsqueda de Oportunidades

El sistema de resolución manual de CAPTCHA está integrado en:

- **Scraping nativo**: Cuando falla por CAPTCHA
- **Bridge Python**: Cuando también falla por CAPTCHA
- **Notificaciones**: El usuario recibe notificaciones sobre el estado del CAPTCHA

## Limitaciones y Consideraciones

### ⚠️ Limitación en Producción (Railway)

En entornos de producción sin interfaz gráfica (como Railway), el navegador no puede abrirse en modo visible (`headless: false`). 

**Solución temporal**: El sistema detecta el error y envía una notificación al usuario con instrucciones para resolver el CAPTCHA manualmente.

**Solución futura recomendada**: Implementar un sistema que:
1. Detecte si está en producción sin GUI
2. Envíe una URL única al usuario para resolver el CAPTCHA
3. Use WebSockets o polling para verificar cuando se resuelve
4. Continúe automáticamente

### 🔧 Para Resolver Credenciales Corruptas de Amazon

1. Ve a **API Settings** → **Amazon SP-API**
2. **Elimina** las credenciales actuales (botón de basura)
3. **Vuelve a guardar** las credenciales correctas
4. El sistema las encriptará con la clave actual

## Próximos Pasos Recomendados

1. **Probar el sistema de CAPTCHA manual** en desarrollo local
2. **Implementar solución para producción** (URL única + WebSocket)
3. **Limpiar credenciales corruptas** usando el endpoint de mantenimiento
4. **Monitorear logs** para detectar más credenciales corruptas

## Cómo Usar

### Para Resolver CAPTCHA Manualmente:

1. Cuando el sistema detecte un CAPTCHA, se abrirá automáticamente un navegador
2. Resuelve el CAPTCHA en la ventana abierta
3. El sistema detectará automáticamente cuando esté resuelto
4. Continuará con la búsqueda de oportunidades

### Para Limpiar Credenciales Corruptas:

1. Como **ADMIN**, ve a `/api/api-credentials/maintenance/clean-corrupted`
2. O simplemente **elimina y vuelve a guardar** las credenciales en API Settings

## Conclusión

El sistema ahora:
- ✅ Detecta CAPTCHA automáticamente
- ✅ Abre navegador para resolución manual (en desarrollo)
- ✅ Espera a que el usuario resuelva el CAPTCHA
- ✅ Continúa automáticamente después de resolver
- ✅ Maneja credenciales corruptas automáticamente
- ✅ Proporciona feedback claro al usuario

El sistema está listo para probar en desarrollo local. Para producción, se recomienda implementar la solución alternativa con URL única y WebSocket.

