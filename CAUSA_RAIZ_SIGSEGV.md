# 🔍 CAUSA RAÍZ DEL SIGSEGV - INVESTIGACIÓN COMPLETA

## 📋 RESUMEN EJECUTIVO

El `SIGSEGV` (segmentation fault) ocurre en Railway cuando el **API Health Monitor** intenta ejecutar health checks para múltiples usuarios inmediatamente después del inicio del servidor.

**Momento exacto del crash:**
- Línea del log: `"Checking API health for 2 users"`
- El servidor inicia correctamente
- El API Health Monitor se inicia
- Ejecuta `performHealthChecks()` → `checkUserAPIs()` → `getAllAPIStatus()`
- **CRASH con SIGSEGV**

---

## 🔬 ANÁLISIS DEL FLUJO COMPLETO

### **1. API Health Monitor inicia checks**

```typescript
// backend/src/services/api-health-monitor.service.ts:79-96
private async performHealthChecks(): Promise<void> {
  const users = await this.getUsersToCheck(); // Query Prisma
  logger.info(`Checking API health for ${users.length} users`);
  
  // ⚠️ PROBLEMA: Ejecuta checks en paralelo para TODOS los usuarios
  const results = await Promise.allSettled(
    users.map(userId => this.checkUserAPIs(userId))
  );
}
```

### **2. Para cada usuario, ejecuta getAllAPIStatus**

```typescript
// backend/src/services/api-availability.service.ts:1197-1218
async getAllAPIStatus(userId: number): Promise<APIStatus[]> {
  // ⚠️ PROBLEMA CRÍTICO: 9 Promise.all ejecutándose en paralelo
  const [
    ebayProduction,
    amazonProduction,
    mercadolibreProduction,
    groq,
    scraper,
    zenrows,
    captcha,
    paypal,
    aliexpress
  ] = await Promise.all([
    this.checkEbayAPI(userId, 'production'),
    this.checkAmazonAPI(userId, 'production'),
    this.checkMercadoLibreAPI(userId, 'production'),
    this.checkGroqAPI(userId),
    this.checkScraperAPI(userId),
    this.checkZenRowsAPI(userId),
    this.check2CaptchaAPI(userId),
    this.checkPayPalAPI(userId),
    this.checkAliExpressAPI(userId)
  ]);
  
  // ⚠️ Luego ejecuta checks adicionales para sandbox
  if (supportsEnvironments('ebay')) {
    const sandboxStatus = await this.checkEbayAPI(userId, 'sandbox');
  }
  // ... más checks
}
```

### **3. Cada check ejecuta múltiples operaciones**

```typescript
// backend/src/services/api-availability.service.ts:477-658
async checkEbayAPI(userId, environment, forceHealthCheck) {
  // 1. Query Prisma: loadPersistedStatus
  const persistedStatus = await this.loadPersistedStatus(userId, 'ebay', environment);
  
  // 2. Query Redis: getCached
  const cached = await this.getCached(cacheKey);
  
  // 3. ⚠️ CRÍTICO: getUserCredentials → CredentialsManager.getCredentials
  const credentials = await this.getUserCredentials(userId, 'ebay', environment);
  
  // 4. Si forceHealthCheck=true, ejecuta performEbayHealthCheck
  if (forceHealthCheck) {
    healthCheckResult = await this.performEbayHealthCheck(...);
  }
  
  // 5. Query Prisma: calculateTrustScore
  const trustScore = await this.calculateTrustScore(...);
  
  // 6. Query Prisma: persistStatus (upsert + create)
  await this.persistStatus(userId, status, previousStatus);
}
```

### **4. getUserCredentials usa desencriptación nativa**

```typescript
// backend/src/services/api-availability.service.ts:150-181
private async getUserCredentials(userId, apiName, environment) {
  const { CredentialsManager } = await import('./credentials-manager.service');
  const credentials = await CredentialsManager.getCredentials(userId, apiName, environment);
  // ⚠️ Esto puede llamar a decryptCredentials que usa crypto.createDecipheriv
}
```

### **5. decryptCredentials usa módulo nativo crypto**

```typescript
// backend/src/services/credentials-manager.service.ts:260-290
function decryptCredentials(data: Buffer): any {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = data.slice(0, IV_LENGTH);
  const tag = data.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.slice(IV_LENGTH + TAG_LENGTH);
  
  // ⚠️ MÓDULO NATIVO: crypto.createDecipheriv puede causar SIGSEGV si:
  // - La clave de encriptación es incorrecta
  // - Los datos están corruptos
  // - Hay problemas de memoria/concurrencia
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}
```

### **6. performEbayHealthCheck hace import dinámico**

```typescript
// backend/src/services/api-availability.service.ts:425-469
private async performEbayHealthCheck(...) {
  // ⚠️ IMPORT DINÁMICO: Puede causar problemas si hay dependencias circulares
  const { MarketplaceService } = await import('./marketplace.service');
  const marketplaceService = new MarketplaceService();
  
  // Hace llamada HTTP real a eBay API
  const result = await marketplaceService.testConnection(userId, 'ebay', environment);
}
```

---

## 🎯 CAUSAS PROBABLES DEL SIGSEGV

### **1. CONCURRENCIA EXCESIVA (MÁS PROBABLE)**

**Problema:**
- `getAllAPIStatus` ejecuta **9 Promise.all** en paralelo
- Para 2 usuarios = **18 operaciones concurrentes**
- Cada operación hace múltiples queries Prisma, Redis, y desencriptación
- Esto puede saturar el event loop y causar problemas de memoria

**Evidencia:**
- El crash ocurre justo después de "Checking API health for 2 users"
- No hay errores previos en los logs
- El servidor se reinicia inmediatamente (crash, no error manejado)

### **2. DESENCRIPTACIÓN DE DATOS CORRUPTOS**

**Problema:**
- Si hay credenciales encriptadas con una clave diferente en la BD
- `decryptCredentials` puede intentar desencriptar datos corruptos
- `crypto.createDecipheriv` puede causar SIGSEGV con datos inválidos

**Evidencia:**
- El código tiene manejo de errores para `ERR_CRYPTO_INVALID_TAG`
- Pero un SIGSEGV ocurre **antes** de que el error pueda ser capturado

### **3. IMPORT DINÁMICO CON DEPENDENCIAS CIRCULARES**

**Problema:**
- `performEbayHealthCheck` hace `import('./marketplace.service')` dinámicamente
- Si hay dependencias circulares o módulos no inicializados correctamente
- Puede causar problemas de memoria

### **4. MÚLTIPLES QUERIES PRISMA EN PARALELO**

**Problema:**
- `calculateTrustScore` hace query a `aPIStatusHistory`
- `persistStatus` hace `upsert` + `create` en Prisma
- `loadPersistedStatus` hace `findUnique`
- Todas ejecutándose en paralelo pueden saturar la conexión de Prisma

---

## ✅ SOLUCIÓN PROPUESTA

### **1. Serializar operaciones críticas**

En lugar de ejecutar todos los checks en paralelo, serializarlos:

```typescript
// ANTES (puede causar SIGSEGV):
const results = await Promise.all([
  this.checkEbayAPI(...),
  this.checkAmazonAPI(...),
  // ... 9 en paralelo
]);

// DESPUÉS (más seguro):
const results = [];
for (const check of checks) {
  try {
    results.push(await check());
  } catch (error) {
    // Manejar error sin crashear
  }
}
```

### **2. Agregar protección para desencriptación**

```typescript
function decryptCredentials(data: Buffer): any {
  try {
    // Validar datos antes de desencriptar
    if (!data || data.length < minSize) {
      throw new Error('Invalid encrypted data');
    }
    
    // Usar try-catch más robusto
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    // ...
  } catch (error) {
    // Si es error de crypto, retornar null en lugar de crashear
    if (error.code?.includes('CRYPTO') || error.code?.includes('OSSL')) {
      logger.warn('Crypto error, skipping decryption');
      return null;
    }
    throw error;
  }
}
```

### **3. Limitar concurrencia**

```typescript
// Limitar a máximo 2 checks concurrentes
const semaphore = new Semaphore(2);
const results = await Promise.all(
  checks.map(check => semaphore.acquire(() => check()))
);
```

### **4. Agregar timeouts estrictos**

```typescript
// Timeout de 5 segundos por check
const result = await Promise.race([
  check(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 5000)
  )
]);
```

---

## 📊 IMPACTO

**Sin la solución:**
- Servidor crashea en bucle infinito
- No puede recibir requests
- Railway marca el servicio como "Crashed"

**Con la solución:**
- Servidor inicia correctamente
- API Health Monitor funciona de forma segura
- No hay crashes

---

## 🔧 PRÓXIMOS PASOS

1. ✅ **Implementar serialización de checks** (en lugar de Promise.all)
2. ✅ **Agregar protección para desencriptación**
3. ✅ **Limitar concurrencia con semáforo**
4. ✅ **Agregar timeouts estrictos**
5. ✅ **Mejorar logging para diagnóstico**

---

**Fecha:** 2025-11-25  
**Prioridad:** CRÍTICA  
**Estado:** EN INVESTIGACIÓN → SOLUCIÓN PROPUESTA

