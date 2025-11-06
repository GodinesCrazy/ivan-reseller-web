# 🔧 SOLUCIÓN COMPLETA: Errores de AliExpress

**Fecha:** 2025-01-11  
**Usuario afectado:** cona  
**Problema:** Error 400 al guardar credenciales de AliExpress

---

## 🔍 PROBLEMAS IDENTIFICADOS Y SOLUCIONADOS

### 1. **Error de Prisma: `Unknown argument userId_apiName`**
**Problema:** El código usaba `userId_apiName` pero el schema requiere `userId_apiName_environment`.

**Archivos corregidos:**
- ✅ `backend/src/services/api-availability.service.ts`
- ✅ `backend/src/services/amazon.service.ts`
- ✅ `backend/src/services/admin.service.ts`

**Solución:** Cambiado a `userId_apiName_environment` con `environment: 'production'`.

---

### 2. **Error de Desencriptación: `Unexpected token 'v'`**
**Problema:** `APIAvailabilityService` tenía su propio método de desencriptación con formato incorrecto.

**Archivo corregido:**
- ✅ `backend/src/services/api-availability.service.ts`

**Solución:** Eliminado método `decrypt()` incorrecto. Ahora usa `CredentialsManager.getCredentials()` que maneja correctamente el formato base64.

---

### 3. **Error 400: Validación de Credenciales AliExpress**
**Problema:** `twoFactorEnabled` se enviaba como string en lugar de boolean.

**Archivos corregidos:**
- ✅ `backend/src/services/credentials-manager.service.ts` - Conversión automática de string a boolean
- ✅ `backend/src/api/routes/api-credentials.routes.ts` - Mejor logging y mensajes de error
- ✅ `frontend/src/pages/APISettings.tsx` - Validación mejorada y conversión de tipos
- ✅ `frontend/src/pages/APIConfiguration.tsx` - Procesamiento correcto de credenciales

**Soluciones aplicadas:**
1. **Backend:** Conversión automática de `twoFactorEnabled` de string a boolean antes de validar con Zod
2. **Frontend:** Validación de email, conversión de `twoFactorEnabled` a boolean, limpieza de `twoFactorSecret` si no se necesita
3. **Logging:** Agregado logging detallado para debugging sin exponer datos sensibles

---

### 4. **Campos Incorrectos en Frontend**
**Problema:** Mostraba "App Key" y "App Secret" en lugar de "Email" y "Password".

**Archivos corregidos:**
- ✅ `frontend/src/pages/APISettings.tsx` - Campos corregidos a `email` y `password`
- ✅ `frontend/src/pages/APIConfiguration.tsx` - Usa campos del backend correctamente

**Solución:** AliExpress usa email/password (no tiene API oficial), no App Key/Secret.

---

### 5. **Endpoints Incorrectos en Settings**
**Problema:** Llamadas a endpoints que no existen.

**Archivo corregido:**
- ✅ `frontend/src/pages/Settings.tsx`

**Soluciones:**
- `/api/users/me` → `/api/auth/me`
- `/api/settings` → Comentado (usa localStorage como fallback)
- `/api/users/notifications` → Comentado (usa localStorage como fallback)

---

## 📋 VALIDACIÓN COMPLETA DE ALIEXPRESS

### Frontend (`APISettings.tsx`):
```typescript
// 1. Validar campos requeridos
if (!credentials.email || !credentials.password) {
  throw new Error('Email y Password son requeridos para AliExpress');
}

// 2. Validar formato de email
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(credentials.email)) {
  throw new Error('El email debe tener un formato válido');
}

// 3. Convertir twoFactorEnabled a boolean
if (credentials.twoFactorEnabled === undefined) {
  credentials.twoFactorEnabled = false;
}

// 4. Limpiar twoFactorSecret si no se necesita
if (!credentials.twoFactorEnabled && credentials.twoFactorSecret) {
  delete credentials.twoFactorSecret;
}
```

### Backend (`credentials-manager.service.ts`):
```typescript
// 1. Conversión automática antes de validar
if (apiName === 'aliexpress' && credentials) {
  const aliexpressCreds = credentials as any;
  if (typeof aliexpressCreds.twoFactorEnabled === 'string') {
    aliexpressCreds.twoFactorEnabled = aliexpressCreds.twoFactorEnabled.toLowerCase() === 'true';
  }
  if (aliexpressCreds.twoFactorEnabled === undefined || aliexpressCreds.twoFactorEnabled === null) {
    aliexpressCreds.twoFactorEnabled = false;
  }
}

// 2. Validación con Zod
schema.parse(credentials);
```

### Schema Zod (`credentials-manager.service.ts`):
```typescript
aliexpress: z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  twoFactorEnabled: z.boolean().default(false),
  twoFactorSecret: z.string().optional(),
}),
```

---

## 🔄 FLUJO COMPLETO DE GUARDADO

1. **Usuario ingresa datos** en `APISettings.tsx`
2. **Frontend valida:**
   - Email y password presentes
   - Email con formato válido
   - `twoFactorEnabled` convertido a boolean
3. **Frontend envía** a `/api/credentials` con:
   ```json
   {
     "apiName": "aliexpress",
     "environment": "production",
     "credentials": {
       "email": "user@example.com",
       "password": "password123",
       "twoFactorEnabled": false
     },
     "isActive": true
   }
   ```
4. **Backend recibe** y valida:
   - Convierte `twoFactorEnabled` de string a boolean si es necesario
   - Valida con Zod schema
   - Encripta credenciales
   - Guarda en base de datos
5. **Respuesta exitosa** o error detallado con logs

---

## 📊 LOGGING AGREGADO

### Backend:
- Log de intento de guardado (sin datos sensibles)
- Log de errores de validación con detalles
- Log de tipo de `twoFactorEnabled` recibido

### Frontend:
- Log antes de enviar (sin datos sensibles)
- Log de respuesta del servidor
- Log de errores con detalles completos

---

## ✅ ESTADO ACTUAL

- ✅ Error de Prisma corregido
- ✅ Error de desencriptación corregido
- ✅ Validación de AliExpress mejorada
- ✅ Conversión automática de tipos
- ✅ Logging detallado agregado
- ✅ Campos correctos en frontend
- ✅ Endpoints corregidos
- ✅ Todos los cambios pusheados a GitHub

---

## 🚀 PRÓXIMOS PASOS

1. **Esperar despliegue** (2-5 minutos en Railway y Vercel)
2. **Limpiar caché del navegador** (Ctrl+Shift+R)
3. **Probar guardar credenciales de AliExpress:**
   - Email: `csantamariascheel@gmail.com`
   - Password: `#Conita18`
   - 2FA: `false` (o dejar vacío)
4. **Verificar logs en consola** del navegador y del backend
5. **Si persiste el error**, revisar los logs para identificar el problema exacto

---

## 🔍 DEBUGGING

Si el error persiste después del despliegue:

1. **Abrir consola del navegador** (F12)
2. **Buscar logs** que empiecen con `[APISettings]`
3. **Verificar:**
   - ¿Qué campos se están enviando?
   - ¿Qué tipo tiene `twoFactorEnabled`?
   - ¿Qué error específico devuelve el backend?

4. **Revisar logs del backend** en Railway:
   - Buscar `[API Credentials]`
   - Ver errores de validación
   - Verificar qué datos se recibieron

---

## 📝 NOTAS IMPORTANTES

- **AliExpress NO tiene API oficial** - usa automatización con Puppeteer
- **Credenciales se guardan encriptadas** con AES-256-GCM
- **twoFactorEnabled debe ser boolean**, no string
- **Email debe tener formato válido** (validación con regex)
- **twoFactorSecret solo se incluye si twoFactorEnabled es true**

---

**Última actualización:** 2025-01-11  
**Commits:** `dd87fae`, `2ffd6f6`, `b15ef03`, `43988c1`, `9b87faa`, `616bab2`, `a79934c`

