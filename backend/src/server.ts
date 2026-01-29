import http from 'http';
import { env } from './config/env';
import { prisma, connectWithRetry } from './config/database';
import { redis, isRedisAvailable } from './config/redis';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getScheduledTasksService } from './services/scheduled-tasks.service';
// ✅ FASE 3: Dynamic import para evitar SIGSEGV - NO importar aliExpressAuthMonitor al nivel superior
import { apiHealthMonitor } from './services/api-health-monitor.service';
import { apiAvailability } from './services/api-availability.service';
import { notificationService } from './services/notification.service';
import scheduledReportsService from './services/scheduled-reports.service';
import bcrypt from 'bcryptjs';
import { resolveChromiumExecutable } from './utils/chromium';
import { initBuildInfo } from './middleware/version-header.middleware';
// ✅ FIX: Minimal server importado pero NO se usa automáticamente
// Solo se activaría en emergencias extremas si Express falla completamente
// (no implementado - Express siempre debe funcionar)
// import { startMinimalServer } from './minimal-server'; // NO USAR - Express es el servidor principal

const execAsync = promisify(exec);

// ✅ FIX RAILWAY P0: PORT from process.env (Railway injects it). NO fallback a 3000 en producción.
// En producción (Railway), process.env.PORT SIEMPRE está presente. Si falta, es error crítico.
const isProduction = process.env.NODE_ENV === 'production';

let PORT: number;
let portSource: string;

if (isProduction) {
  // En producción: SOLO process.env.PORT, sin fallback
  if (!process.env.PORT) {
    console.error('❌ ERROR CRÍTICO: En producción, process.env.PORT es requerido (Railway debe inyectarlo)');
    console.error('   Railway inyecta PORT automáticamente. Si no está disponible, verifica la configuración del servicio.');
    console.error('   Ve a Railway Dashboard → Service → Variables y verifica que PORT esté configurado.');
    process.exit(1);
  }
  PORT = Number(process.env.PORT);
  portSource = 'process.env.PORT (Railway)';
  
  if (isNaN(PORT) || PORT <= 0) {
    console.error('❌ ERROR CRÍTICO: PORT en producción es inválido');
    console.error(`   Valor recibido: ${process.env.PORT}`);
    console.error('   PORT debe ser un número positivo. Railway debe inyectarlo correctamente.');
    process.exit(1);
  }
} else {
  // En desarrollo: process.env.PORT > env.PORT > 3000
  PORT = Number(process.env.PORT || env.PORT || 3000);
  portSource = process.env.PORT ? 'process.env.PORT' : (env.PORT ? 'env.PORT' : 'fallback/local (3000)');
  
  if (isNaN(PORT) || PORT <= 0) {
    console.error('❌ ERROR CRÍTICO: PORT no está configurado o es inválido');
    console.error(`   Valor recibido: ${process.env.PORT ?? env.PORT ?? 'undefined'}`);
    process.exit(1);
  }
}

/**
 * ✅ FIX AUTH: Validar JWT_SECRET al iniciar para prevenir cambios accidentales
 */
function validateJwtSecret(): void {
  const jwtSecret = env.JWT_SECRET;
  
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('❌ ERROR CRÍTICO: JWT_SECRET no está configurado o es muy corto');
    console.error(`   Longitud actual: ${jwtSecret?.length || 0} caracteres`);
    console.error('   Mínimo requerido: 32 caracteres');
    console.error('');
    console.error('🔧 SOLUCIÓN:');
    console.error('   1. Ve a Railway Dashboard → Variables');
    console.error('   2. Verifica que JWT_SECRET existe y tiene al menos 32 caracteres');
    console.error('   3. Si cambias JWT_SECRET, TODAS las cookies/tokens existentes se invalidarán');
    console.error('   4. Los usuarios necesitarán hacer login nuevamente');
    console.error('');
    process.exit(1);
  }
  
  // ✅ FIX AUTH: Calcular hash del JWT_SECRET para detectar cambios
  const crypto = require('crypto');
  const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
  
  console.log(`✅ JWT_SECRET: Configurado (${jwtSecret.length} caracteres, hash: ${secretHash}...)`);
  console.log('   ⚠️  ADVERTENCIA: Si cambias JWT_SECRET, todos los tokens existentes se invalidarán');
}

/**
 * ✅ GO-LIVE: Log configuración sanitizada (sin exponer secretos)
 * ✅ FIX LOGGING: Usa PORT calculado (fuente de verdad), no env.PORT que puede tener default 3000
 */
function logConfiguration(env: any, port: number, portSourceStr: string): void {
  const allowedOrigins = env.CORS_ORIGIN?.split(',')
    .map((o: string) => o.trim())
    .filter((o: string) => o.length > 0) || [];
  
  console.log('📋 Configuración del Sistema (sanitizada):');
  console.log(`   NODE_ENV: ${env.NODE_ENV}`);
  console.log(`   PORT: ${port} (${portSourceStr})`);
  console.log(`   API_URL: ${env.API_URL || '❌ NO CONFIGURADA'}`);
  console.log(`   FRONTEND_URL: ${env.FRONTEND_URL || '⚠️  No configurada (opcional)'}`);
  console.log(`   CORS_ORIGIN: ${allowedOrigins.length} origen(es) configurado(s)`);
  allowedOrigins.forEach((origin: string, idx: number) => {
    try {
      const url = new URL(origin);
      console.log(`     ${idx + 1}. ${url.hostname} (${url.protocol}//${url.hostname})`);
    } catch {
      console.log(`     ${idx + 1}. ${origin}`);
    }
  });
  console.log(`   DATABASE_URL: ${env.DATABASE_URL ? '✅ Configurada' : '❌ FALTA'}`);
  if (env.DATABASE_URL) {
    try {
      const dbUrl = new URL(env.DATABASE_URL);
      console.log(`     Host: ${dbUrl.hostname}`);
    } catch {
      // Ignorar si no se puede parsear
    }
  }
  console.log(`   REDIS_URL: ${env.REDIS_URL && env.REDIS_URL !== 'redis://localhost:6379' ? '✅ Configurada' : '⚠️  Usando default (localhost)'}`);
  if (env.REDIS_URL && env.REDIS_URL !== 'redis://localhost:6379') {
    try {
      const redisUrl = new URL(env.REDIS_URL);
      console.log(`     Host: ${redisUrl.hostname}`);
    } catch {
      // Ignorar si no se puede parsear
    }
  }
  console.log(`   JWT_SECRET: ${env.JWT_SECRET ? `✅ Configurada (${env.JWT_SECRET.length} caracteres)` : '❌ FALTA'}`);
  console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? `✅ Configurada (${process.env.ENCRYPTION_KEY.length} caracteres)` : '⚠️  Usando JWT_SECRET como fallback'}`);
  console.log(`   ALIEXPRESS_DATA_SOURCE: ${env.ALIEXPRESS_DATA_SOURCE || 'api (default)'}`);
  console.log(`   ALLOW_BROWSER_AUTOMATION: ${env.ALLOW_BROWSER_AUTOMATION ? 'true' : 'false'}`);
  console.log(`   SCRAPER_BRIDGE_ENABLED: ${env.SCRAPER_BRIDGE_ENABLED ? 'true' : 'false'}`);
  console.log('');
}

/**
 * ✅ FIX 502: Validar ENCRYPTION_KEY al inicio del servidor
 * NO crashea el servidor si falta, pero marca como "degraded"
 * El servidor debe arrancar para que /api/health funcione
 */
let isEncryptionKeyValid = false;

function validateEncryptionKey(): void {
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  
  const rawKey = encryptionKey || jwtSecret;
  
  if (!rawKey || rawKey.length < 32) {
    console.error('⚠️  WARNING: ENCRYPTION_KEY or JWT_SECRET not configured or too short');
    console.error('   The server will start in DEGRADED mode.');
    console.error('   Endpoints that require encryption will return 503 Service Unavailable.');
    console.error('   Please set ENCRYPTION_KEY (min 32 chars) or JWT_SECRET (min 32 chars) in Railway variables.');
    console.error('');
    isEncryptionKeyValid = false;
    // ✅ NO hacer process.exit(1), permitir que el servidor arranque
    return;
  }
  
  isEncryptionKeyValid = true;
  console.log('✅ Encryption key validated (length: ' + rawKey.length + ' characters)');
}

// ✅ Exportar estado global para que otros módulos puedan verificar
(global as any).__isEncryptionKeyValid = isEncryptionKeyValid;

async function ensureAdminUser() {
  try {
    // Verificar si existe el usuario admin (especificar campos explícitamente para evitar errores con columna plan)
    const adminExists = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!adminExists) {
      console.log('👤 Usuario admin no encontrado. Creando...');
      const adminPassword = bcrypt.hashSync('admin123', 10);
      
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@ivanreseller.com',
          password: adminPassword,
          role: 'ADMIN',
          commissionRate: 0.15,
          fixedMonthlyCost: 17.0,
          balance: 0,
          totalEarnings: 0,
          isActive: true,
        },
      });
      
      console.log('✅ Usuario admin creado exitosamente');
      console.log('   Usuario: admin');
      console.log('   Contraseña: admin123');
    } else {
      console.log('✅ Usuario admin ya existe');
    }
  } catch (error) {
    console.error('⚠️  Error al verificar/crear usuario admin:', error);
  }
}

// ✅ FASE 9: Migraciones con fail-fast en producción
async function runMigrations(maxRetries = 3): Promise<void> {
  const isProduction = env.NODE_ENV === 'production';
  // ✅ FASE 9: En producción, solo 1 intento (fail-fast)
  const actualRetries = isProduction ? 1 : maxRetries;
  
  for (let attempt = 0; attempt < actualRetries; attempt++) {
    try {
      console.log(`🔄 Running database migrations... (attempt ${attempt + 1}/${actualRetries})`);
      console.log(`   DATABASE_URL: ${env.DATABASE_URL ? '✅ Configurada' : '❌ No configurada'}`);
      
      // ✅ FIX 502: NO crashear si DATABASE_URL falta - el servidor debe arrancar
      // Las migraciones fallarán pero el servidor seguirá corriendo en modo degradado
      if (isProduction && (!env.DATABASE_URL || env.DATABASE_URL.trim().length === 0)) {
        console.error('⚠️  WARNING: DATABASE_URL no configurada en producción');
        console.error('   El servidor arrancará en modo degradado (sin base de datos)');
        console.error('   /api/health responderá 200 pero /ready devolverá 503');
        console.error('   Las migraciones se omitirán hasta que DATABASE_URL esté configurada');
        // NO hacer process.exit(1) - permitir que el servidor arranque
        return; // Salir de la función de migraciones sin error
      }
      
      const migrateResult = await execAsync('npx prisma migrate deploy', {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      // Verificar si realmente se ejecutaron las migraciones
      if (migrateResult.stdout) {
        console.log('   Migration output:', migrateResult.stdout.substring(0, 300));
      }
      if (migrateResult.stderr && !migrateResult.stderr.includes('Tip:')) {
        console.log('   Migration warnings:', migrateResult.stderr.substring(0, 200));
      }
      
      // Verificar que las tablas existan después de las migraciones con los nombres correctos
      try {
        await prisma.$connect(); // Asegurar conexión antes de verificar
        const tablesResult = await prisma.$queryRaw<Array<{tablename: string}>>`
          SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'User', 'products', 'Product', 'sales', 'Sale');
        `;
        
        // Verificar si las tablas tienen los nombres correctos (minúsculas según @@map)
        const correctTables = tablesResult.filter(t => 
          ['users', 'products', 'sales', 'commissions', 'activities', 'api_credentials'].includes(t.tablename.toLowerCase())
        );
        const incorrectTables = tablesResult.filter(t => 
          ['User', 'Product', 'Sale', 'Commission', 'Activity', 'ApiCredential'].includes(t.tablename)
        );
        
        if (incorrectTables.length > 0 && correctTables.length === 0) {
          console.log('⚠️  Tablas encontradas con nombres incorrectos (PascalCase):', incorrectTables.map(t => t.tablename).join(', '));
          console.log('   Prisma espera nombres en minúsculas según @@map');
          console.log('   Usando prisma db push para sincronizar el schema...');
          try {
            await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
              maxBuffer: 10 * 1024 * 1024,
            });
            console.log('✅ Schema sincronizado con db push');
          } catch (dbPushError: any) {
            console.error('⚠️  db push falló:', dbPushError.message?.substring(0, 200));
            // Continuar de todas formas
          }
        } else if (tablesResult.length === 0) {
          console.log('⚠️  No se encontraron tablas después de las migraciones');
          console.log('   Intentando usar prisma db push como alternativa...');
          try {
            await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
              maxBuffer: 10 * 1024 * 1024,
            });
            console.log('✅ Schema aplicado con db push');
          } catch (dbPushError: any) {
            console.error('⚠️  db push también falló:', dbPushError.message?.substring(0, 200));
          }
        } else {
          console.log(`✅ Tablas encontradas: ${tablesResult.map(t => t.tablename).join(', ')}`);
          // Verificar si necesitamos sincronizar nombres
          if (correctTables.length === 0 && incorrectTables.length > 0) {
            console.log('   ⚠️  Las tablas tienen nombres incorrectos, sincronizando...');
            try {
              await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
                maxBuffer: 10 * 1024 * 1024,
              });
              console.log('✅ Schema sincronizado');
            } catch (dbPushError: any) {
              console.error('⚠️  No se pudo sincronizar:', dbPushError.message?.substring(0, 200));
            }
          }
        }
      } catch (verifyError: any) {
        console.log('⚠️  No se pudo verificar tablas:', verifyError.message?.substring(0, 100));
        console.log('   Intentando db push directamente...');
        try {
          await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
            maxBuffer: 10 * 1024 * 1024,
          });
          console.log('✅ Schema aplicado con db push');
        } catch (dbPushError: any) {
          console.error('⚠️  db push falló:', dbPushError.message?.substring(0, 200));
        }
      }
      
      return; // Éxito, salir de la función
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isAuthError = error.message?.includes('P1000') || 
                         error.message?.includes('Authentication failed') ||
                         error.stderr?.includes('P1000') ||
                         error.stderr?.includes('Authentication failed');
      
      const isFailedMigrationError = error.message?.includes('P3009') || 
                                     error.stderr?.includes('P3009') ||
                                     error.message?.includes('failed migrations') ||
                                     error.stderr?.includes('failed migrations');
      
      // ✅ Manejar migraciones fallidas automáticamente (P3009)
      if (isFailedMigrationError) {
        console.log('⚠️  Detected failed migration (P3009), attempting to resolve automatically...');
        try {
          // Conectar a la base de datos para resolver el estado
          await prisma.$connect();
          
          // Marcar todas las migraciones fallidas como revertidas automáticamente
          const result = await prisma.$executeRaw`
            UPDATE _prisma_migrations 
            SET rolled_back_at = NOW(), finished_at = NOW()
            WHERE finished_at IS NULL AND rolled_back_at IS NULL
          `;
          
          console.log(`   ✅ Marked ${result} failed migration(s) as rolled back`);
          console.log('   Retrying migrations after cleanup...');
          
          // Reintentar la migración después de limpiar (continuar el loop)
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        } catch (cleanupError: any) {
          console.error('   ⚠️  Could not automatically resolve failed migrations:', cleanupError.message?.substring(0, 200));
          
          if (isLastAttempt) {
            console.error('');
            console.error('❌ ERROR DE MIGRACIÓN FALLIDA PERSISTENTE:');
            console.error('   - Hay una migración fallida en la base de datos que no se puede resolver automáticamente');
            console.error('   - Por favor, ejecuta manualmente: npx prisma migrate resolve --rolled-back <migration_name>');
            console.error('');
            throw error;
          } else {
            // Reintentar después de un delay
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
        }
      } else if (isAuthError) {
        console.error(`⚠️  Migration error (attempt ${attempt + 1}/${maxRetries}):`);
        console.error(`   ${error.message || error.stderr || 'Unknown error'}`);
        
        if (isLastAttempt) {
          console.error('');
          console.error('❌ ERROR DE AUTENTICACIÓN PERSISTENTE:');
          console.error('   - Verifica que DATABASE_URL esté correctamente configurada en Railway');
          console.error('   - Verifica que las credenciales de PostgreSQL sean correctas');
          console.error('   - Asegúrate de que los servicios Postgres y ivan-reseller-web estén conectados');
          console.error('');
          throw error;
        } else {
          console.log(`   Reintentando en 3 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        // Si no es error de autenticación ni de migración fallida, lanzar inmediatamente
        throw error;
      }
    }
  }
}

// ✅ FASE 1: Instrumentación - Helper para logs con timestamps
function logMilestone(milestone: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🎯 MILESTONE: ${milestone}`);
}

// ✅ FIX SIGSEGV: Global error handlers mejorados con correlationId y sin process.exit
// ✅ FIX: Ignore ERR_HTTP_HEADERS_SENT errors (they're non-fatal, response already sent)
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  const timestamp = new Date().toISOString();
  const correlationId = 'unhandled-rejection-' + Date.now();
  
  // Ignore ERR_HTTP_HEADERS_SENT - these happen when response is already sent
  // and are not fatal (the request was already handled)
  if (reason?.code === 'ERR_HTTP_HEADERS_SENT' || reason?.message?.includes("Cannot set headers after they are sent")) {
    // Log at debug level, not error (this is expected in some edge cases)
    console.debug(`[${timestamp}] [${correlationId}] ⚠️  Unhandled rejection (headers already sent, non-fatal):`, reason?.message || String(reason));
    return; // Don't log as error or exit
  }

  // ✅ FIX SIGSEGV: Log detallado con correlationId y memoria
  const memory = process.memoryUsage();
  console.error(`[${timestamp}] [${correlationId}] ❌ UNHANDLED REJECTION:`, reason);
  console.error(`[${timestamp}] [${correlationId}] Stack:`, reason?.stack || 'No stack trace');
  console.error(`[${timestamp}] [${correlationId}] Memory:`, {
    heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
    rss: Math.round(memory.rss / 1024 / 1024) + 'MB'
  });
  
  // ✅ FIX SIGSEGV: NO hacer process.exit(1) - solo loggear
  // El servidor debe continuar funcionando para que otros requests puedan procesarse
  // process.exit(1) solo en casos críticos de memoria o corrupción de estado
});

process.on('uncaughtException', (error: Error) => {
  const timestamp = new Date().toISOString();
  const correlationId = 'uncaught-exception-' + Date.now();
  const memory = process.memoryUsage();
  
  // ✅ FIX STABILITY: Log detallado con correlationId y memoria
  console.error(`[${timestamp}] [${correlationId}] ❌ UNCAUGHT EXCEPTION:`, error);
  console.error(`[${timestamp}] [${correlationId}] Stack:`, error.stack);
  console.error(`[${timestamp}] [${correlationId}] Memory:`, {
    heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
    rss: Math.round(memory.rss / 1024 / 1024) + 'MB'
  });
  
  // ✅ FIX STABILITY: Solo hacer process.exit(1) si es un error crítico de memoria o corrupción
  // Para errores normales, solo loggear y continuar
  // Esto previene que un error en un request crashee todo el servidor
  const isCriticalError = 
    error.message?.includes('FATAL') ||
    error.message?.includes('corruption') ||
    error.message?.includes('out of memory') ||
    error.message?.includes('ENOMEM') ||
    error.name === 'RangeError' && error.message?.includes('Maximum call stack') ||
    error.name === 'RangeError' && error.message?.includes('Invalid array length');
  
  if (isCriticalError) {
    console.error(`[${timestamp}] [${correlationId}] ❌ CRITICAL ERROR - Exiting process`);
    process.exit(1);
  } else {
    console.error(`[${timestamp}] [${correlationId}] ⚠️  Non-critical error - Server will continue`);
    // NO hacer process.exit(1) - permitir que el servidor continúe
    // El watchdog permite que el servidor siga funcionando aunque haya errores no críticos
  }
});

// ✅ FASE 1: Lazy-load Chromium (no al boot)
async function ensureChromiumLazyLoad(): Promise<void> {
  // Solo intentar resolver Chromium si realmente se va a usar scraping
  // Esto se llama cuando se necesita, no durante boot
  // ✅ FIX: Usar env ya importado estáticamente (no import dinámico)
  const scraperBridgeEnabled = env.SCRAPER_BRIDGE_ENABLED ?? true;
  
  // Si Scraper Bridge está habilitado y disponible, no necesitamos Chromium
  if (scraperBridgeEnabled && env.SCRAPER_BRIDGE_URL) {
    return; // Chromium no necesario si bridge está disponible
  }
  
  // Solo resolver Chromium si es realmente necesario
  if (!process.env.PUPPETEER_EXECUTABLE_PATH && !process.env.CHROMIUM_PATH) {
    logMilestone('Resolving Chromium executable (lazy-load)');
    try {
      process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
      const chromiumPath = await resolveChromiumExecutable();
      process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
      process.env.CHROMIUM_PATH = chromiumPath;
      logMilestone(`Chromium executable ready: ${chromiumPath}`);
    } catch (error: any) {
      console.warn('⚠️  Unable to resolve Chromium executable automatically:', error?.message || error);
      console.warn('   - El scraping puede fallar si Chromium no está disponible');
    }
  }
}

// ✅ FASE A: Readiness state tracking (global para acceso desde app.ts /ready endpoint)
declare global {
  // eslint-disable-next-line no-var
  var __isDatabaseReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __isRedisReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __isServerReady: boolean | undefined;
}

// ✅ P0: Export state variables for bootstrap modules
let isDatabaseReady = false;
let isRedisReady = false;
let isServerReady = false;
let bootstrapStartTime: number | null = null;

// ✅ P0: Export getters and setters for bootstrap modules
export function getIsDatabaseReady() { return isDatabaseReady; }
export function setIsDatabaseReady(value: boolean) { isDatabaseReady = value; }
export function getIsRedisReady() { return isRedisReady; }
export function setIsRedisReady(value: boolean) { isRedisReady = value; }
export function getIsServerReady() { return isServerReady; }
export function setIsServerReady(value: boolean) { isServerReady = value; }

// ✅ FASE A: Helper para actualizar estado global
export function updateReadinessState() {
  (global as any).__isDatabaseReady = isDatabaseReady;
  (global as any).__isRedisReady = isRedisReady;
  (global as any).__isServerReady = isServerReady;
}

async function startServer() {
  const startTime = Date.now();
  bootstrapStartTime = startTime;
  
  try {
    // ✅ BOOT: Logging obligatorio al boot
    console.log('');
    console.log('🚀 BOOT START');
    console.log('================================');
    console.log(`   pid=${process.pid}`);
    console.log(`   NODE_ENV=${env.NODE_ENV}`);
    console.log(`   SAFE_BOOT=${env.SAFE_BOOT || false}`);
    console.log(`   PORT=${PORT}`);
    console.log(`   PORT env exists=${!!process.env.PORT} value=${process.env.PORT || 'N/A'}`);
    console.log(`   cwd=${process.cwd()}`);
    console.log(`   build sha=${(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown').toString().substring(0, 7)}`);
    console.log('================================');
    console.log('');
    
    // ✅ BOOT: Express siempre inicia - modo completo
    logMilestone('[BOOT] Starting Express server initialization');
    console.log('[BOOT] Express will ALWAYS start - SAFE_BOOT only disables heavy workers');
    console.log('');
    
    // ✅ FIX 502: Validar ENCRYPTION_KEY antes de iniciar cualquier servicio
    // NO crashea el servidor si falta, pero marca como "degraded"
    logMilestone('[BOOT] Validating encryption key');
    validateEncryptionKey();
    // Actualizar estado global después de validar
    (global as any).__isEncryptionKeyValid = isEncryptionKeyValid;
    
    // ✅ FIX: Usar env ya importado estáticamente (no import dinámico)
    // El env ya está disponible desde la línea 3: import { env } from './config/env';
    logMilestone(`[BOOT] Environment: ${env.NODE_ENV}, Port: ${PORT}`);
    
    // ✅ GO-LIVE: Log configuración sanitizada (sin secretos)
    // ✅ FIX AUTH: Validar JWT_SECRET antes de iniciar servidor
    validateJwtSecret();
    
    // ✅ FIX LOGGING: Pasar PORT y portSource para logging consistente
    logConfiguration(env, PORT, portSource);
    
    // ✅ FASE 0: Initialize build info (for /version endpoint and X-App-Commit header)
    initBuildInfo();
    
    // ✅ FASE A CRÍTICO: Create HTTP server FIRST (NO awaits before this)
    // ✅ BOOT: Express SIEMPRE se carga - no depende de FORCE_ROUTING_OK
    logMilestone('[BOOT] Creating Express HTTP server (BEFORE any DB/Redis/migrations)');
    console.log('[BOOT] Loading Express app...');
    let app;
    try {
      const appModule = await import('./app');
      app = appModule.default;
      if (!app) {
        throw new Error('Failed to import app - default export is undefined');
      }
    } catch (appError: any) {
      console.error('❌ CRITICAL: Failed to load Express app:', appError);
      console.error('   Error message:', appError?.message || String(appError));
      console.error('   Stack:', appError?.stack?.substring(0, 500));
      throw new Error(`Failed to load Express app: ${appError?.message || String(appError)}`);
    }
    const httpServer = http.createServer(app);
    console.log('[BOOT] Express app loaded OK');
    
    // ✅ CRÍTICO: Inicializar Socket.io antes de que el servidor escuche
    logMilestone('Initializing Socket.IO');
    notificationService.initialize(httpServer);
    logMilestone('Socket.IO initialized');
    
    // ✅ FASE A CRÍTICO: Start listening IMMEDIATELY (NO awaits before this point)
    logMilestone('BEFORE_LISTEN - About to call httpServer.listen()');
    const listenStartTime = Date.now();
    
    httpServer.listen(PORT, '0.0.0.0', () => {
      const listenTime = Date.now() - listenStartTime;
      const address = httpServer.address();
      const addressStr = typeof address === 'string' 
        ? address 
        : address ? `${address.address}:${address.port}` : 'unknown';
      
      console.log('');
      console.log('');
      console.log('✅ LISTENING OK');
      console.log('================================');
      console.log(`   LISTENING host=0.0.0.0 port=${PORT}`);
      const addressInfo = typeof address === 'object' && address !== null
        ? `ADDR actual=${address.address}:${address.port} family=${address.family}`
        : `ADDR actual=${addressStr}`;
      console.log(`   ${addressInfo}`);
      console.log(`   PORT source: ${portSource}`);
      console.log(`   PORT env exists: ${!!process.env.PORT} value=${process.env.PORT || 'N/A'}`);
      console.log(`   Listen time: ${listenTime}ms`);
      console.log(`   Total boot time: ${Date.now() - startTime}ms`);
      console.log(`   Environment: ${env.NODE_ENV}`);
      console.log(`   SAFE_BOOT: ${env.SAFE_BOOT} (workers ${env.SAFE_BOOT ? 'disabled' : 'enabled'})`);
      console.log(`   pid: ${process.pid}`);
      console.log('');
      console.log('📡 Express endpoints available:');
      console.log(`   Health: http://0.0.0.0:${PORT}/health`);
      console.log(`   Health API: http://0.0.0.0:${PORT}/api/health`);
      console.log(`   Ready: http://0.0.0.0:${PORT}/ready`);
      console.log(`   Auth: http://0.0.0.0:${PORT}/api/auth/login`);
      console.log(`   Auth Me: http://0.0.0.0:${PORT}/api/auth/me`);
      console.log(`   Debug Ping: http://0.0.0.0:${PORT}/api/debug/ping`);
      console.log(`   Debug AliExpress: http://0.0.0.0:${PORT}/api/debug/aliexpress/test-search`);
      console.log('================================');
      console.log('✅ Express server ready - ALL endpoints available');
      console.log('✅ Minimal server is NOT active (Express handles all requests)');
      console.log('');
      
      setIsServerReady(true);
      updateReadinessState();
      logMilestone('LISTEN_CALLBACK - Server is listening and ready to accept connections');
      
      // ✅ BOOT: Log bootstrap mode
      const bootstrapMode = env.SAFE_BOOT ? 'SAFE_BOOT (workers disabled)' : 'FULL_BOOT (all services)';
      console.log('');
      console.log(`📦 BOOTSTRAP MODE: ${bootstrapMode}`);
      console.log('================================');
      console.log('[BOOT] ✅ Express started OK - ALL endpoints available');
      console.log('[BOOT] ✅ Server mode: FULL EXPRESS (not minimal)');
      console.log('[BOOT] ✅ /api/auth/login, /api/auth/me, and all other endpoints work');
      if (env.SAFE_BOOT) {
        console.log('[BOOT] ⚠️  SAFE_BOOT=true: Heavy workers (BullMQ, scraping) will be skipped');
        console.log('[BOOT] ⚠️  Redis connection will be skipped');
        console.log('[BOOT] ⚠️  Scheduled tasks will be disabled');
        console.log('[BOOT] ✅ Express endpoints remain fully functional');
      } else {
        console.log('[BOOT] ✅ SAFE_BOOT=false: All services will initialize');
      }
      console.log('[BOOT] ✅ Minimal server is NOT active (Express is primary)');
      console.log('================================');
      
      // ✅ BOOT: Start bootstrap in background based on SAFE_BOOT
      // Express ya está funcionando, esto solo inicializa servicios pesados
      setImmediate(async () => {
        try {
          if (env.SAFE_BOOT) {
            logMilestone('[BOOT] SAFE_BOOT=true: Using safe bootstrap (no heavy initialization)');
            console.log('[BOOT] Skipping: BullMQ, Redis workers, scheduled tasks');
            console.log('[BOOT] Express endpoints remain fully functional');
            const { safeBootstrap } = await import('./bootstrap/safe-bootstrap');
            await safeBootstrap();
            console.log('');
            console.log('✅ BOOTSTRAP DONE (SAFE_BOOT mode - Express OK, workers disabled)');
            console.log('');
          } else {
            logMilestone('[BOOT] SAFE_BOOT=false: Using full bootstrap (DB, Redis, migrations, etc.)');
            console.log('[BOOT] Initializing: Database, Redis, BullMQ, scheduled tasks');
            const { fullBootstrap } = await import('./bootstrap/full-bootstrap');
            await fullBootstrap(startTime);
          }
        } catch (bootstrapError: any) {
          // ✅ BOOT: Startup guard - nunca crashear el proceso
          // El servidor ya está escuchando, /health retorna 200
          // Express sigue funcionando aunque bootstrap falle
          console.error('[BOOT] ⚠️  Warning: Error during bootstrap (Express still works):', bootstrapError.message);
          console.log('[BOOT] Express endpoints remain available despite bootstrap error');
          console.log('');
          console.log('✅ BOOTSTRAP DONE (with errors - Express OK)');
          console.log('');
        }
      });
      
    });
    
    // ✅ FASE 1: Error handling for listen()
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error('   Railway debe inyectar PORT automáticamente. Verifica la configuración del servicio.');
        process.exit(1);
      } else {
        console.error('❌ HTTP Server error:', error);
        console.error('   Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack?.substring(0, 500)
        });
        // NO hacer exit inmediato - permitir que Railway vea el error en logs
        setTimeout(() => process.exit(1), 5000);
      }
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error);
    console.error('   Error details:', {
      message: error?.message,
      stack: error?.stack?.substring(0, 500)
    });
    // NO hacer exit inmediato - permitir que Railway vea el error en logs
    setTimeout(() => process.exit(1), 5000);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  apiHealthMonitor.stop();
  // ✅ FASE 3: Dynamic import para stop
  try {
    const { aliExpressAuthMonitor } = await import('./services/ali-auth-monitor.service');
    aliExpressAuthMonitor.stop();
  } catch (error) {
    // Ignorar si el módulo no está cargado
  }
  const scheduledTasksService = getScheduledTasksService();
  await scheduledTasksService.shutdown();
  
  // ✅ FASE 5: Detener Workflow Scheduler
  try {
    const { workflowSchedulerService } = await import('./services/workflow-scheduler.service');
    await workflowSchedulerService.shutdown();
  } catch (error: any) {
    console.warn('⚠️  Warning: Error shutting down workflow scheduler:', error.message);
  }
  
  await prisma.$disconnect();
  if (isRedisAvailable) {
    await redis.quit();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  apiHealthMonitor.stop();
  // ✅ FASE 3: Dynamic import para stop
  try {
    const { aliExpressAuthMonitor } = await import('./services/ali-auth-monitor.service');
    aliExpressAuthMonitor.stop();
  } catch (error) {
    // Ignorar si el módulo no está cargado
  }
  const scheduledTasksService = getScheduledTasksService();
  await scheduledTasksService.shutdown();
  await prisma.$disconnect();
  if (isRedisAvailable) {
    await redis.quit();
  }
  process.exit(0);
});

startServer();
