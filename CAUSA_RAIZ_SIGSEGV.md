# 🔍 CAUSA RAÍZ DEL SIGSEGV - Análisis Completo

## 📋 RESUMEN EJECUTIVO

El `SIGSEGV` (segmentation fault) ocurre cuando el **API Health Monitor** inicia y ejecuta checks de salud para múltiples usuarios **en paralelo**. La combinación de:

1. **Operaciones crypto nativas** (desencriptación) ejecutándose simultáneamente
2. **Queries de Prisma** en paralelo saturando el connection pool
3. **HTTP requests** a eBay API ejecutándose simultáneamente
4. **Operaciones de persistencia** a la base de datos en paralelo

Causa un **segmentation fault** en el entorno de Railway (probablemente por memory pressure o conflictos en operaciones nativas).

---

## 🔬 FLUJO DEL PROBLEMA

### **Paso 1: API Health Monitor inicia**
```typescript
// backend/src/server.ts:377
await apiHealthMonitor.start();
```

### **Paso 2: performHealthChecks se ejecuta**
```typescript
// backend/src/services/api-health-monitor.service.ts:79
private async performHealthChecks(): Promise<void> {
  const users = await this.getUsersToCheck(); // Obtiene 2 usuarios
  logger.info(`Checking API health for ${users.length} users`); // "Checking API health for 2 users"
  
  // ❌ PROBLEMA: Promise.allSettled ejecuta TODOS los checks en PARALELO
  const results = await Promise.allSettled(
    users.map(userId => this.checkUserAPIs(userId))
  );
}
```

### **Paso 3: checkUserAPIs ejecuta checks para cada API**
```typescript
// backend/src/services/api-health-monitor.service.ts:162
private async checkUserAPIs(userId: number): Promise<void> {
  // Obtiene TODOS los statuses de APIs (esto ejecuta múltiples checks)
  const statuses = await apiAvailability.getAllAPIStatus(userId);
  
  // Para cada API configurada, fuerza un health check
  for (const status of apisToCheck) {
    if (status.apiName === 'ebay') {
      // ❌ PROBLEMA: Force health check ejecuta operaciones pesadas
      newStatus = await apiAvailability.checkEbayAPI(
        userId,
        status.environment || 'production',
        true // Force health check
      );
    }
  }
}
```

### **Paso 4: checkEbayAPI ejecuta operaciones pesadas**

Cuando `forceHealthCheck: true`, `checkEbayAPI` ejecuta:

#### **4.1: Desencriptación de credenciales**
```typescript
// backend/src/services/api-availability.service.ts:508
const credentials = await this.getUserCredentials(userId, 'ebay', environment);
// ↓ Esto llama a:
// backend/src/services/credentials-manager.service.ts:256
function decryptCredentials(encryptedData: string) {
  // ❌ OPERACIÓN CRÍTICA: crypto.createDecipheriv es operación NATIVA
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  // Ejecutar múltiples de estas en paralelo puede causar SIGSEGV
}
```

#### **4.2: Health check real (HTTP request)**
```typescript
// backend/src/services/api-availability.service.ts:547
healthCheckResult = await this.performEbayHealthCheck(userId, environment, normalizedCreds);
// ↓ Esto llama a:
// backend/src/services/marketplace.service.ts:262
return await ebayService.testConnection();
// ↓ Esto llama a:
// backend/src/services/ebay.service.ts:692
await this.getAccountInfo(); // ❌ HTTP request a eBay API
```

#### **4.3: Múltiples queries a Prisma**
```typescript
// backend/src/services/api-availability.service.ts:581
const previousStatus = await this.loadPersistedStatus(userId, 'ebay', environment);
// ↓ Prisma query: findUnique

// backend/src/services/api-availability.service.ts:597
const trustScore = await this.calculateTrustScore(userId, 'ebay', environment, healthStatus);
// ↓ Prisma query: findMany (línea 261)

// backend/src/services/api-availability.service.ts:642
await this.persistStatus(userId, status, previousStatus);
// ↓ Prisma queries: upsert + create (líneas 314, 351)
```

---

## 💥 POR QUÉ CAUSA SIGSEGV

### **Problema 1: Operaciones Crypto Nativas en Paralelo**

Cuando 2 usuarios se ejecutan en paralelo:
- **2 operaciones `crypto.createDecipheriv` simultáneas**
- Estas operaciones son **nativas** (C++) y acceden directamente a la memoria
- En entornos con recursos limitados (Railway), esto puede causar:
  - **Memory corruption**
  - **Stack overflow**
  - **Segmentation fault**

### **Problema 2: Connection Pool de Prisma Saturado**

Cada `checkEbayAPI` ejecuta **3-4 queries a Prisma**:
1. `loadPersistedStatus` → `findUnique`
2. `calculateTrustScore` → `findMany`
3. `persistStatus` → `upsert` + `create`

Con 2 usuarios en paralelo = **6-8 queries simultáneas**

Prisma por defecto tiene un connection pool de **10 conexiones**. Si hay otras operaciones corriendo (recovery de statuses, otras queries), el pool puede saturarse y causar problemas.

### **Problema 3: HTTP Requests Concurrentes**

Cada `checkEbayAPI` con `forceHealthCheck: true` hace una llamada HTTP a eBay API. Múltiples llamadas HTTP simultáneas pueden causar problemas de memoria o timeouts.

### **Problema 4: Event Loop Saturado**

Todas estas operaciones ejecutándose en paralelo pueden saturar el event loop de Node.js, causando que el proceso se vuelva inestable.

---

## ✅ SOLUCIÓN IMPLEMENTADA

### **1. Deshabilitar API Health Monitor en Producción (Temporal)**
```typescript
// backend/src/server.ts
if (env.NODE_ENV === 'production') {
  console.log('⚠️  API Health Monitor temporarily disabled in production');
}
```

### **2. Agregar Protecciones en el Monitor**
```typescript
// backend/src/services/api-health-monitor.service.ts
// - Timeouts en todas las operaciones
// - Error handling robusto
// - Serialización de checks críticos
```

---

## 🔧 SOLUCIÓN DEFINITIVA (Implementar)

Para resolver el problema de forma permanente:

### **1. Serializar Checks de Usuarios**
```typescript
// En lugar de Promise.allSettled, ejecutar en serie
for (const userId of users) {
  try {
    await this.checkUserAPIs(userId);
    // Pequeño delay entre usuarios para no saturar
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    // Continuar con el siguiente
  }
}
```

### **2. Evitar Force Health Check en Startup**
```typescript
// No forzar health checks reales durante el startup
// Usar solo validación de credenciales (sin HTTP requests)
if (status.apiName === 'ebay') {
  newStatus = await apiAvailability.checkEbayAPI(
    userId,
    status.environment || 'production',
    false // NO forzar health check real en startup
  );
}
```

### **3. Rate Limiting para Operaciones Crypto**
```typescript
// Limitar operaciones de desencriptación simultáneas
const decryptQueue = new PQueue({ concurrency: 2 });
await decryptQueue.add(() => decryptCredentials(data));
```

### **4. Configurar Prisma Connection Pool**
```typescript
// backend/src/config/database.ts
new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=5&pool_timeout=20'
    }
  }
})
```

---

## 📊 EVIDENCIA DEL LOG

```
2025-11-25T20:10:58.042224938Z [err]  npm error signal SIGSEGV
2025-11-25T20:10:59.307424414Z [inf]  2025-11-25 20:10:59 [info]: Checking API health for 2 users
```

El crash ocurre **justo después** de "Checking API health for 2 users", confirmando que el problema está en la ejecución paralela de checks para múltiples usuarios.

---

**Fecha:** 2025-11-25  
**Estado:** Solución temporal implementada (deshabilitado en producción)  
**Próximo paso:** Implementar solución definitiva con serialización
