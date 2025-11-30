# Diagnóstico de Conectividad Railway → AliExpress API

Este documento explica cómo diagnosticar problemas de conectividad desde Railway hacia la API de AliExpress.

## 🎯 Objetivo

Verificar que Railway puede conectarse correctamente a la API oficial de AliExpress (TOP API) para extraer datos de productos.

## 📋 Pruebas Incluidas

El script de diagnóstico (`test-aliexpress-connectivity.ts`) realiza las siguientes pruebas:

1. **Resolución DNS**: Verifica que `gw.api.taobao.com` se puede resolver
2. **Conectividad HTTP Básica**: Prueba si el endpoint responde a peticiones HTTP
3. **Endpoint AliExpress TOP API**: Prueba el endpoint específico con una petición de prueba
4. **Credenciales Reales (Sandbox)**: Prueba con credenciales reales en ambiente sandbox
5. **Credenciales Reales (Production)**: Prueba con credenciales reales en ambiente production

## 🚀 Ejecución

### Desde Railway (Recomendado)

1. Accede a Railway Dashboard
2. Ve a tu servicio backend
3. Abre la terminal/console
4. Ejecuta:

```bash
npm run test:connectivity
```

O directamente:

```bash
npx tsx src/scripts/test-aliexpress-connectivity.ts
```

### Desde Local (Para Desarrollo)

```bash
cd backend
npm run test:connectivity
```

## 📊 Interpretación de Resultados

### ✅ Todas las Pruebas Pasaron

Si todas las pruebas pasan, significa que:
- ✅ La conectividad desde Railway es correcta
- ✅ La API de AliExpress es accesible
- ✅ Las credenciales están funcionando
- ✅ El sistema debería poder usar la API oficial

**Acción**: Si aún así no funciona, revisa los logs de la aplicación para ver qué está fallando específicamente.

### ⚠️ Timeouts Detectados

Si se detectan timeouts:

**Síntomas**:
- Pruebas fallan con error `timeout` o `ETIMEDOUT`
- Latencia muy alta (>30 segundos)

**Posibles Causas**:
1. **Firewall de Railway**: Railway puede estar bloqueando conexiones salientes
2. **Red Lenta**: La conexión desde Railway hacia AliExpress puede ser lenta
3. **API de AliExpress Lenta**: La API puede estar respondiendo lentamente

**Soluciones**:
1. Verificar configuración de firewall en Railway
2. Aumentar timeout en la configuración (ya está en 30s)
3. Usar el fallback a scraping nativo (que ya funciona)

### ❌ Errores de Conexión

Si se detectan errores de conexión:

**Síntomas**:
- Errores `ECONNREFUSED` o `ENOTFOUND`
- DNS no resuelve

**Posibles Causas**:
1. **DNS no funciona**: Railway no puede resolver `gw.api.taobao.com`
2. **Red bloqueada**: Railway bloquea conexiones salientes a ese dominio
3. **Endpoint incorrecto**: El endpoint puede haber cambiado

**Soluciones**:
1. Verificar configuración de red en Railway
2. Contactar soporte de Railway sobre restricciones de red
3. Verificar que el endpoint `https://gw.api.taobao.com/router/rest` sigue siendo válido

## 🔍 Ejemplo de Salida

```
🔍 DIAGNÓSTICO DE CONECTIVIDAD RAILWAY → ALIEXPRESS API

================================================================================

1️⃣ Probando resolución DNS...
   ✅ DNS Resolved:
      IPv4: 47.246.103.51, 47.246.103.52

2️⃣ Probando conectividad HTTP básica...
   ✅ HTTP Connectivity to https://gw.api.taobao.com/router/rest
      Latency: 245ms
      Status: 200

3️⃣ Probando endpoint de AliExpress TOP API...
   ✅ AliExpress TOP API Endpoint: https://gw.api.taobao.com/router/rest
      Latency: 312ms
      Status: 200
      ⚠️  API returned error (but connectivity is OK): { code: '40001', msg: 'Invalid app_key' }

4️⃣ Probando con credenciales reales (sandbox)...
   ✅ AliExpress API with Real Credentials (sandbox)
      Latency: 1850ms
      Products returned: 5

5️⃣ Probando con credenciales reales (production)...
   ❌ AliExpress API with Real Credentials (production)
      Error: timeout of 30000ms exceeded
      Latency: 30000ms
      Details: { isTimeout: true, note: '...' }

================================================================================

📊 RESUMEN DE PRUEBAS:

   ✅ Pasadas: 4/5
   ❌ Fallidas: 1/5

   ⚠️  PRUEBAS FALLIDAS:
      - AliExpress API with Real Credentials (production)
        Error: timeout of 30000ms exceeded
        Nota: API endpoint is reachable but request timed out...

💡 RECOMENDACIONES:

   ⚠️  Se detectaron timeouts:
      - La API puede estar lenta o bloqueada por firewall
      - Considera aumentar el timeout o verificar reglas de firewall en Railway
      - El sistema tiene fallback a scraping nativo que funciona correctamente

================================================================================
🏁 DIAGNÓSTICO COMPLETADO
```

## 🛠️ Solución de Problemas

### Problema: Timeouts Constantes

**Solución 1**: Verificar si Railway tiene restricciones de red
- Revisa la documentación de Railway sobre conexiones salientes
- Verifica si hay un firewall configurado

**Solución 2**: Usar el fallback a scraping nativo
- El sistema ya tiene implementado un fallback automático
- El scraping nativo funciona correctamente (como se ve en los logs)

**Solución 3**: Aumentar timeout (ya implementado)
- Timeout actual: 30s (axios) + 35s (Promise.race)
- Si necesitas más tiempo, puedes aumentarlo en `aliexpress-affiliate-api.service.ts`

### Problema: DNS No Resuelve

**Solución**: Verificar configuración de DNS en Railway
- Railway debería usar DNS públicos (8.8.8.8, 1.1.1.1)
- Si hay problemas, contacta soporte de Railway

### Problema: Credenciales No Funcionan

**Solución**: Verificar credenciales
1. Ve a Settings → API Settings → AliExpress Affiliate API
2. Verifica que las credenciales estén correctas
3. Prueba las credenciales manualmente desde la UI (botón "Test API")

## 📝 Notas Importantes

1. **El fallback funciona**: Aunque la API falle, el sistema tiene un fallback robusto a scraping nativo que funciona correctamente.

2. **Timeouts son normales**: La API de AliExpress puede ser lenta, especialmente en la primera llamada. Los timeouts no siempre indican un problema crítico.

3. **Monitoreo continuo**: Ejecuta este script periódicamente para verificar que la conectividad sigue funcionando.

4. **Logs estructurados**: Todos los resultados se guardan en los logs estructurados para análisis posterior.

## 🔗 Referencias

- [AliExpress TOP API Documentation](https://open.taobao.com/api.htm)
- [Railway Network Documentation](https://docs.railway.app/)
- [Script de Diagnóstico](../backend/src/scripts/test-aliexpress-connectivity.ts)

