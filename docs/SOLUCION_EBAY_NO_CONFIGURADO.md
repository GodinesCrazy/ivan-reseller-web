# 🔧 SOLUCIÓN: eBay aparece como "No configurado"

**Fecha:** 2025-12-15  
**Problema identificado:** El sistema muestra "No configurado" para eBay aunque hay credenciales guardadas.

---

## 🔍 CAUSA RAÍZ IDENTIFICADA

### Problema Principal: Mismatch de Nombres de Campos

**Flujo del problema:**

1. **Frontend envía credenciales con nombres UPPER_CASE:**
   - `EBAY_APP_ID`
   - `EBAY_DEV_ID`
   - `EBAY_CERT_ID`

2. **Backend guarda las credenciales tal como las recibe** (después de validación con Zod)

3. **Al verificar estado, `checkEbayAPI` normaliza campos:**
   ```typescript
   const normalizedCreds = {
     appId: credentials['appId'] || credentials['EBAY_APP_ID'] || '',
     devId: credentials['devId'] || credentials['EBAY_DEV_ID'] || '',
     certId: credentials['certId'] || credentials['EBAY_CERT_ID'] || '',
   };
   ```

4. **PERO:** Si las credenciales se guardaron con nombres diferentes o si `CredentialsManager.getCredentials` retorna las credenciales con un formato diferente, la normalización podría fallar.

---

## 🎯 SOLUCIÓN PROPUESTA

### ✅ SOLUCIÓN 1: Mejorar Normalización en CredentialsManager

Agregar normalización bidireccional en `normalizeCredential` para eBay:

```typescript
// En credentials-manager.service.ts, método normalizeCredential
if (apiName === 'ebay') {
  // ✅ NUEVO: Normalizar nombres de campos UPPER_CASE → camelCase
  if (creds.EBAY_APP_ID && !creds.appId) {
    creds.appId = creds.EBAY_APP_ID;
  }
  if (creds.EBAY_DEV_ID && !creds.devId) {
    creds.devId = creds.EBAY_DEV_ID;
  }
  if (creds.EBAY_CERT_ID && !creds.certId) {
    creds.certId = creds.EBAY_CERT_ID;
  }
  
  // ✅ También normalizar en dirección inversa (camelCase → UPPER_CASE) para compatibilidad
  if (creds.appId && !creds.EBAY_APP_ID) {
    creds.EBAY_APP_ID = creds.appId;
  }
  if (creds.devId && !creds.EBAY_DEV_ID) {
    creds.EBAY_DEV_ID = creds.devId;
  }
  if (creds.certId && !creds.EBAY_CERT_ID) {
    creds.EBAY_CERT_ID = creds.certId;
  }
  
  // ... resto de normalización existente
}
```

---

### ✅ SOLUCIÓN 2: Mejorar Normalización en checkEbayAPI

Asegurar que la normalización en `checkEbayAPI` sea más robusta:

```typescript
// En api-availability.service.ts, método checkEbayAPI
const normalizedCreds: Record<string, string> = {
  appId: credentials['appId'] || credentials['EBAY_APP_ID'] || credentials['ebayAppId'] || '',
  devId: credentials['devId'] || credentials['EBAY_DEV_ID'] || credentials['ebayDevId'] || '',
  certId: credentials['certId'] || credentials['EBAY_CERT_ID'] || credentials['ebayCertId'] || '',
  token: credentials['token'] || credentials['authToken'] || credentials['accessToken'] || credentials['EBAY_TOKEN'] || '',
  refreshToken: credentials['refreshToken'] || credentials['EBAY_REFRESH_TOKEN'] || '',
  redirectUri: credentials['redirectUri'] || credentials['ruName'] || credentials['EBAY_REDIRECT_URI'] || '',
};
```

---

### ✅ SOLUCIÓN 3: Invalidar Cache Después de Guardar

Asegurar que el cache se invalide correctamente después de guardar credenciales:

```typescript
// En api-credentials.routes.ts, después de guardar credenciales
try {
  // Invalidar cache para ambos environments
  await apiAvailability.deleteCached(`user_${ownerUserId}_ebay-sandbox`);
  await apiAvailability.deleteCached(`user_${ownerUserId}_ebay-production`);
  
  // Forzar verificación inmediata con el nuevo estado
  await apiAvailability.checkEbayAPI(ownerUserId, env, true);
} catch (cacheError) {
  logger.warn('Error invalidating cache', { error: cacheError });
  // No fallar si el cache no se puede invalidar
}
```

---

### ✅ SOLUCIÓN 4: Mejorar Logging para Debugging

Agregar logging detallado para identificar el problema exacto:

```typescript
// En api-availability.service.ts, método checkEbayAPI
const credentials = await this.getUserCredentials(userId, 'ebay', environment);

logger.info('[checkEbayAPI] Verificando credenciales', {
  userId,
  environment,
  hasCredentials: !!credentials,
  credentialKeys: credentials ? Object.keys(credentials) : [],
  credentialPreview: credentials ? {
    hasAppId: !!(credentials['appId'] || credentials['EBAY_APP_ID']),
    hasDevId: !!(credentials['devId'] || credentials['EBAY_DEV_ID']),
    hasCertId: !!(credentials['certId'] || credentials['EBAY_CERT_ID']),
    appIdKey: credentials['appId'] ? 'appId' : credentials['EBAY_APP_ID'] ? 'EBAY_APP_ID' : 'none',
    devIdKey: credentials['devId'] ? 'devId' : credentials['EBAY_DEV_ID'] ? 'EBAY_DEV_ID' : 'none',
    certIdKey: credentials['certId'] ? 'certId' : credentials['EBAY_CERT_ID'] ? 'EBAY_CERT_ID' : 'none',
  } : null
});

if (!credentials) {
  // ... retornar isConfigured: false
}

const normalizedCreds = {
  appId: credentials['appId'] || credentials['EBAY_APP_ID'] || '',
  devId: credentials['devId'] || credentials['EBAY_DEV_ID'] || '',
  certId: credentials['certId'] || credentials['EBAY_CERT_ID'] || '',
  // ...
};

logger.info('[checkEbayAPI] Credenciales normalizadas', {
  userId,
  environment,
  normalizedKeys: Object.keys(normalizedCreds),
  hasAppId: !!normalizedCreds.appId,
  hasDevId: !!normalizedCreds.devId,
  hasCertId: !!normalizedCreds.certId,
  appIdLength: normalizedCreds.appId.length,
  devIdLength: normalizedCreds.devId.length,
  certIdLength: normalizedCreds.certId.length,
});

const validation = this.hasRequiredFields(normalizedCreds, requiredFields);
logger.info('[checkEbayAPI] Validación', {
  userId,
  environment,
  valid: validation.valid,
  missing: validation.missing,
});
```

---

## 🧪 VERIFICACIÓN

Para verificar si la solución funciona:

1. **Guardar credenciales de eBay** desde el frontend
2. **Verificar logs del servidor** para ver:
   - Si las credenciales se guardaron correctamente
   - Qué nombres de campos tienen las credenciales recuperadas
   - Si la normalización funciona correctamente
3. **Verificar en la BD:**
   ```sql
   SELECT id, "userId", "apiName", environment, "isActive"
   FROM "ApiCredential"
   WHERE "apiName" = 'ebay'
   ORDER BY "updatedAt" DESC;
   ```
4. **Verificar estado después de guardar:**
   - El estado debería cambiar a "configurado" o "parcialmente configurado" inmediatamente

---

## 📝 IMPLEMENTACIÓN

1. ✅ Agregar normalización bidireccional en `normalizeCredential` para eBay
2. ✅ Mejorar logging en `checkEbayAPI`
3. ✅ Invalidar cache después de guardar credenciales
4. ✅ Probar con credenciales reales

---

**Estado:** ⏳ PENDIENTE DE IMPLEMENTACIÓN

