# 🔍 AUDITORÍA: eBay aparece como "No configurado"

**Fecha:** 2025-12-15  
**Problema:** El sistema muestra "No configurado" para eBay a pesar de que el usuario ha ingresado credenciales.

---

## 📋 ANÁLISIS DEL FLUJO

### 1. Flujo de Verificación de Estado

**Backend (`api-availability.service.ts`):**
```typescript
async checkEbayAPI(userId: number, environment: 'sandbox' | 'production' = 'production')
```

**Pasos:**
1. Genera cache key: `user_{userId}_ebay-{environment}`
2. Verifica cache (Redis o memoria)
3. Llama a `getUserCredentials(userId, 'ebay', environment)`
4. Si `credentials` es `null` → Retorna `isConfigured: false`
5. Normaliza nombres de campos: `appId`, `devId`, `certId`
6. Valida campos requeridos: `['appId', 'devId', 'certId']`
7. Si faltan campos → `isConfigured: false`

### 2. Cómo se Obtienen las Credenciales

```typescript
private async getUserCredentials(
  userId: number, 
  apiName: string,
  environment: 'sandbox' | 'production' = 'production'
): Promise<Record<string, string> | null>
```

**Pasos:**
1. Llama a `CredentialsManager.getCredentials(userId, 'ebay', environment)`
2. Si retorna `null` → Retorna `null`
3. Convierte a `Record<string, string>`

### 3. Normalización de Campos

```typescript
const normalizedCreds: Record<string, string> = {
  appId: credentials['appId'] || credentials['EBAY_APP_ID'] || '',
  devId: credentials['devId'] || credentials['EBAY_DEV_ID'] || '',
  certId: credentials['certId'] || credentials['EBAY_CERT_ID'] || '',
  token: credentials['token'] || credentials['authToken'] || credentials['accessToken'] || '',
  refreshToken: credentials['refreshToken'] || '',
};
```

### 4. Validación

```typescript
const requiredFields = ['appId', 'devId', 'certId'];
const validation = this.hasRequiredFields(normalizedCreds, requiredFields);
// validation.valid = true solo si appId, devId y certId tienen valores no vacíos
```

---

## 🔍 POSIBLES CAUSAS DEL PROBLEMA

### ❌ CAUSA 1: Environment Mismatch

**Problema:**
- El usuario guardó credenciales en **sandbox**
- El frontend está verificando **production** (o viceversa)
- `checkEbayAPI` busca credenciales en un environment diferente

**Solución:**
- Verificar que el environment seleccionado en el frontend coincida con el environment de las credenciales guardadas
- El frontend debe pasar el `environment` correcto al verificar estado

**Verificación:**
```typescript
// En el frontend, verificar qué environment se está usando
const environment = selectedEnvironment['ebay'] || 'production';
const status = await api.get(`/api/credentials/status/${apiName}?environment=${environment}`);
```

---

### ❌ CAUSA 2: Nombres de Campos Incorrectos

**Problema:**
- Las credenciales se guardaron con nombres diferentes a los esperados
- El sistema busca `appId`, `devId`, `certId` pero las credenciales están guardadas con otros nombres

**Solución:**
- Verificar cómo se guardan las credenciales en `CredentialsManager`
- Asegurar que se normalicen correctamente al guardar

**Verificación:**
- Revisar `credentials-manager.service.ts` para ver cómo se normalizan los campos de eBay
- Verificar que se mapeen correctamente: `EBAY_APP_ID` → `appId`

---

### ❌ CAUSA 3: Credenciales No Guardadas Correctamente

**Problema:**
- El usuario ingresó credenciales en el formulario pero no se guardaron en la BD
- O se guardaron pero hubo un error en el proceso

**Solución:**
- Verificar que el endpoint `POST /api/credentials/:apiName` guarde correctamente
- Verificar que no haya errores en el proceso de guardado

**Verificación:**
- Revisar logs del servidor cuando se guarda
- Verificar directamente en la BD que existan registros en `ApiCredential`

---

### ❌ CAUSA 4: Cache Desactualizado

**Problema:**
- Las credenciales se guardaron pero el cache tiene un estado viejo
- El sistema está retornando el estado desde el cache en lugar de verificar la BD

**Solución:**
- Invalidar cache después de guardar credenciales
- O usar `forceHealthCheck: true` cuando se verifica después de guardar

**Verificación:**
- El cache expira en 5 minutos
- Si se guardaron hace menos de 5 minutos, podría estar usando cache viejo

---

### ❌ CAUSA 5: Credenciales Marcadas como Inactivas

**Problema:**
- Las credenciales existen pero `isActive = false`
- `CredentialsManager.getCredentials` podría filtrar credenciales inactivas

**Solución:**
- Verificar que `isActive = true` en las credenciales
- O ajustar la lógica para incluir credenciales inactivas en la verificación

**Verificación:**
```sql
SELECT * FROM "ApiCredential" 
WHERE "apiName" = 'ebay' AND "userId" = <user_id>;
-- Verificar campo isActive
```

---

## 🔧 SOLUCIONES PROPUESTAS

### ✅ SOLUCIÓN 1: Mejorar Logging

Agregar logging detallado en `checkEbayAPI` para ver exactamente qué está pasando:

```typescript
async checkEbayAPI(userId: number, environment: 'sandbox' | 'production' = 'production') {
  logger.info('[checkEbayAPI] Iniciando verificación', { userId, environment });
  
  const credentials = await this.getUserCredentials(userId, 'ebay', environment);
  logger.info('[checkEbayAPI] Credenciales obtenidas', { 
    userId, 
    environment, 
    hasCredentials: !!credentials,
    credentialKeys: credentials ? Object.keys(credentials) : []
  });
  
  if (!credentials) {
    logger.warn('[checkEbayAPI] No se encontraron credenciales', { userId, environment });
    // ... retornar isConfigured: false
  }
  
  // ... resto del código
}
```

---

### ✅ SOLUCIÓN 2: Verificar Ambos Environments

Modificar el frontend para verificar ambos environments (sandbox y production) y mostrar el estado correcto:

```typescript
// En el frontend
const sandboxStatus = await api.get(`/api/credentials/status/ebay?environment=sandbox`);
const productionStatus = await api.get(`/api/credentials/status/ebay?environment=production`);

// Mostrar el estado del environment seleccionado
const currentEnvironment = selectedEnvironment['ebay'] || 'production';
const status = currentEnvironment === 'sandbox' ? sandboxStatus : productionStatus;
```

---

### ✅ SOLUCIÓN 3: Invalidar Cache al Guardar

Asegurar que cuando se guardan credenciales, se invalide el cache:

```typescript
// En el endpoint de guardar credenciales
await apiAvailability.deleteCached(`user_${userId}_ebay-${environment}`);
// O llamar a checkEbayAPI con forceHealthCheck: true
```

---

### ✅ SOLUCIÓN 4: Verificar Normalización de Campos

Asegurar que `CredentialsManager.normalizeCredential` normalice correctamente los campos de eBay:

```typescript
// En credentials-manager.service.ts
if (apiName === 'ebay') {
  // Normalizar nombres de campos
  if (creds.EBAY_APP_ID && !creds.appId) creds.appId = creds.EBAY_APP_ID;
  if (creds.EBAY_DEV_ID && !creds.devId) creds.devId = creds.EBAY_DEV_ID;
  if (creds.EBAY_CERT_ID && !creds.certId) creds.certId = creds.EBAY_CERT_ID;
}
```

---

## 🧪 PASOS PARA DEBUGGING

1. **Verificar en la BD:**
   ```sql
   SELECT id, "userId", "apiName", environment, scope, "isActive", "updatedAt"
   FROM "ApiCredential"
   WHERE "apiName" = 'ebay'
   ORDER BY "updatedAt" DESC;
   ```

2. **Verificar logs del servidor:**
   - Buscar logs cuando se guarda: `POST /api/credentials/ebay`
   - Buscar logs cuando se verifica: `GET /api/credentials/status`

3. **Verificar en el navegador:**
   - Abrir DevTools → Network
   - Ver qué environment se está usando en las requests
   - Ver la respuesta de `/api/credentials/status`

4. **Verificar cache:**
   - Si Redis está disponible, verificar keys: `api_availability:user_{userId}_ebay-{environment}`
   - O esperar 5 minutos para que expire el cache

---

## 📝 CHECKLIST DE VERIFICACIÓN

- [ ] ¿Las credenciales existen en la BD?
- [ ] ¿El environment de las credenciales coincide con el seleccionado?
- [ ] ¿Los campos tienen los nombres correctos (appId, devId, certId)?
- [ ] ¿Las credenciales están marcadas como `isActive = true`?
- [ ] ¿El cache está desactualizado?
- [ ] ¿Hay errores en los logs cuando se guarda/verifica?
- [ ] ¿El frontend está pasando el environment correcto?

---

## 🎯 CONCLUSIÓN

El problema más probable es un **mismatch de environment**:
- El usuario guardó en **sandbox**
- El sistema está verificando **production** (o viceversa)

**Solución inmediata:**
1. Verificar qué environment tiene las credenciales guardadas
2. Asegurar que el frontend use el mismo environment para verificar
3. O verificar ambos environments y mostrar el estado correcto

---

**Próximos pasos:**
1. Ejecutar query SQL para verificar credenciales en BD
2. Verificar logs del servidor
3. Agregar logging detallado en `checkEbayAPI`
4. Implementar invalidación de cache al guardar

