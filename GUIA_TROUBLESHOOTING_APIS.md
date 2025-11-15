# 🔧 GUÍA DE TROUBLESHOOTING - Sistema de APIs

Esta guía ayuda a diagnosticar y resolver problemas comunes relacionados con la configuración y uso de APIs.

---

## 📋 ÍNDICE

1. [Errores de Autenticación](#errores-de-autenticación)
2. [Errores de OAuth](#errores-de-oauth)
3. [Errores de Validación](#errores-de-validación)
4. [Errores de Encriptación](#errores-de-encriptación)
5. [Problemas de Performance](#problemas-de-performance)
6. [Problemas de Caché](#problemas-de-caché)

---

## 1. 🔐 ERRORES DE AUTENTICACIÓN

### Problema: "Authentication required"

**Síntomas:**
- Request devuelve 401 Unauthorized
- Mensaje: "Authentication required"
- Logs muestran: `cookie-header: undefined`

**Causas Comunes:**
1. Cookies no se están enviando (Safari iOS bloquea third-party cookies)
2. Token expirado
3. CORS mal configurado

**Soluciones:**

#### Solución 1: Verificar Cookies
```bash
# En DevTools → Application → Cookies
# Verificar que existan:
# - token
# - refreshToken
```

#### Solución 2: Safari iOS - Usar Token en localStorage
El sistema detecta Safari iOS y devuelve el token en el response body.
El frontend lo guarda en `localStorage` como fallback.

**Verificar:**
```javascript
// En DevTools Console
localStorage.getItem('auth_token');
```

#### Solución 3: Verificar CORS
```bash
# Verificar headers en Network tab:
# - Access-Control-Allow-Origin
# - Access-Control-Allow-Credentials: true
```

---

## 2. 🔄 ERRORES DE OAUTH

### Problema: "unauthorized_client" en eBay

**Síntomas:**
- Error al intentar autorizar eBay
- Mensaje: "unauthorized_client"
- Redirect URI no coincide

**Causas Comunes:**
1. Redirect URI (RuName) no coincide exactamente con el registrado en eBay
2. Redirect URI contiene espacios o caracteres inválidos
3. App ID incorrecto

**Soluciones:**

#### Solución 1: Verificar Redirect URI
```typescript
// El Redirect URI debe coincidir EXACTAMENTE con el registrado en eBay Developer Portal
// Verificar:
// 1. No hay espacios al inicio/final
// 2. No hay espacios internos (a menos que el RuName válido los tenga)
// 3. Caracteres especiales están correctos
```

**Pasos:**
1. Ir a eBay Developer Portal → My Account Keys
2. Copiar el RuName exacto
3. Pegarlo en el campo "Redirect URI" sin modificar
4. Guardar credenciales
5. Intentar OAuth nuevamente

#### Solución 2: Verificar App ID
```typescript
// El App ID debe ser:
// - Sandbox: Empieza con "SBX-"
// - Production: Empieza con "PROD-"
```

#### Solución 3: Verificar Ambiente
```typescript
// Asegurarse de usar el ambiente correcto:
// - Sandbox: Usar App ID de sandbox
// - Production: Usar App ID de production
```

---

### Problema: "Popup bloqueado" en OAuth

**Síntomas:**
- El navegador bloquea el popup de OAuth
- No se abre la ventana de autorización

**Soluciones:**

#### Solución 1: Permitir Popups
```bash
# En Chrome/Edge:
# 1. Click en el ícono de bloqueo en la barra de direcciones
# 2. Permitir popups para este sitio
```

#### Solución 2: Usar Modal del Sistema
El sistema detecta popups bloqueados y muestra un modal con opciones:
- Abrir en la misma ventana
- Copiar URL manualmente

**Usar la opción "Abrir en la misma ventana"** si el popup está bloqueado.

---

## 3. ✅ ERRORES DE VALIDACIÓN

### Problema: "Invalid credentials format"

**Síntomas:**
- Error 400 al guardar credenciales
- Mensaje: "Invalid credentials format"
- Detalles muestran campos faltantes o inválidos

**Causas Comunes:**
1. Campos requeridos faltantes
2. Campos exceden longitud máxima
3. Formato incorrecto (email, URL, etc.)

**Soluciones:**

#### Solución 1: Verificar Campos Requeridos

**eBay:**
```typescript
{
  appId: string,      // Requerido, max 255 caracteres
  devId: string,      // Requerido, max 255 caracteres
  certId: string,     // Requerido, max 255 caracteres
  sandbox: boolean,   // Requerido
  redirectUri?: string // Opcional, min 3, max 255 caracteres
}
```

**Amazon:**
```typescript
{
  sellerId: string,           // Requerido, max 255 caracteres
  clientId: string,           // Requerido, max 255 caracteres
  clientSecret: string,       // Requerido, max 500 caracteres
  refreshToken: string,       // Requerido, max 1000 caracteres
  awsAccessKeyId: string,     // Requerido, max 255 caracteres
  awsSecretAccessKey: string, // Requerido, max 500 caracteres
  marketplaceId: string,      // Requerido, max 255 caracteres
  sandbox: boolean            // Requerido
}
```

#### Solución 2: Verificar Longitud de Campos
```typescript
// Si un campo excede la longitud máxima, verificar:
// 1. No hay espacios extra
// 2. No hay caracteres invisibles
// 3. El valor es correcto (no copiado mal)
```

#### Solución 3: Verificar Formato
```typescript
// Email: Debe ser un email válido
// URL: Debe ser una URL válida
// Boolean: Debe ser true/false (no "true"/"false" como string)
```

---

## 4. 🔒 ERRORES DE ENCRIPTACIÓN

### Problema: "Credenciales corruptas detectadas"

**Síntomas:**
- Error al obtener credenciales
- Mensaje: "INVALID_ENCRYPTION_KEY" o "CORRUPTED_DATA"
- Credenciales se desactivan automáticamente

**Causas Comunes:**
1. `ENCRYPTION_KEY` o `JWT_SECRET` cambió
2. Credenciales fueron encriptadas con una clave diferente
3. Datos corruptos en la base de datos

**Soluciones:**

#### Solución 1: Verificar Variables de Entorno
```bash
# Verificar que ENCRYPTION_KEY o JWT_SECRET estén configuradas:
echo $ENCRYPTION_KEY
echo $JWT_SECRET

# Deben tener al menos 32 caracteres
```

#### Solución 2: Regenerar Credenciales
```typescript
// Si las credenciales están corruptas:
// 1. Eliminar las credenciales existentes
// 2. Guardar nuevas credenciales
// 3. El sistema las encriptará con la clave actual
```

#### Solución 3: Verificar Consistencia de Claves
```bash
# Si cambiaste ENCRYPTION_KEY o JWT_SECRET:
# TODAS las credenciales existentes necesitan ser regeneradas
# No hay forma de desencriptar con la clave antigua
```

**⚠️ ADVERTENCIA:** Si cambias `ENCRYPTION_KEY` o `JWT_SECRET`, todas las credenciales existentes se volverán ilegibles. Debes regenerarlas.

---

## 5. ⚡ PROBLEMAS DE PERFORMANCE

### Problema: "Lentitud al obtener credenciales"

**Síntomas:**
- Requests tardan mucho tiempo
- Múltiples desencriptaciones

**Causas Comunes:**
1. Caché no está funcionando
2. Múltiples queries a la base de datos

**Soluciones:**

#### Solución 1: Verificar Caché
```typescript
// El sistema cachea credenciales desencriptadas por 5 minutos
// Si el problema persiste:
// 1. Verificar que Redis esté funcionando (si está configurado)
// 2. Verificar logs para ver si hay errores de caché
```

#### Solución 2: Verificar Queries
```typescript
// El sistema optimizó las queries (1 query en lugar de 2)
// Si el problema persiste:
// 1. Verificar índices en la base de datos
// 2. Verificar que no haya N+1 queries
```

---

## 6. 💾 PROBLEMAS DE CACHÉ

### Problema: "Credenciales no se actualizan después de guardar"

**Síntomas:**
- Guardas nuevas credenciales
- Pero sigues viendo las antiguas

**Causas Comunes:**
1. Caché no se invalidó correctamente
2. TTL del caché aún no expiró

**Soluciones:**

#### Solución 1: Esperar TTL
```typescript
// El caché de credenciales tiene TTL de 5 minutos
// Si acabas de guardar, espera hasta 5 minutos
// O fuerza una invalidación manual
```

#### Solución 2: Invalidar Caché Manualmente
```typescript
// El sistema invalida automáticamente el caché al guardar
// Si el problema persiste:
// 1. Verificar logs para ver si hay errores de invalidación
// 2. Reiniciar el servidor (limpia caché en memoria)
```

---

## 📊 CÓDIGOS DE ERROR COMUNES

### ErrorCode.VALIDATION_ERROR
- **Causa:** Datos de entrada inválidos
- **Solución:** Verificar formato y longitud de campos

### ErrorCode.MISSING_REQUIRED_FIELD
- **Causa:** Campo requerido faltante
- **Solución:** Agregar el campo faltante

### ErrorCode.CREDENTIALS_ERROR
- **Causa:** Credenciales inválidas o corruptas
- **Solución:** Regenerar credenciales

### ErrorCode.ENCRYPTION_ERROR
- **Causa:** Error al encriptar/desencriptar
- **Solución:** Verificar `ENCRYPTION_KEY` o `JWT_SECRET`

---

## 🔍 DEBUGGING

### Ver Logs Estructurados
```typescript
// Los logs incluyen:
// - errorId: ID único del error
// - errorCode: Código del error
// - userId: ID del usuario
// - apiName: Nombre de la API
// - environment: Ambiente
// - details: Detalles adicionales
```

### Verificar Estado de APIs
```bash
# Endpoint para verificar estado:
GET /api/api-credentials/:apiName/status

# Devuelve:
# - isConfigured: Si hay credenciales
# - isActive: Si están activas
# - lastChecked: Última verificación
```

---

## 📞 SOPORTE

Si el problema persiste después de seguir esta guía:

1. **Recopilar información:**
   - ErrorId del error
   - Logs relevantes
   - Pasos para reproducir

2. **Contactar soporte:**
   - Email: support@ivanreseller.com
   - Incluir toda la información recopilada

---

**Última actualización:** 2025-11-15

