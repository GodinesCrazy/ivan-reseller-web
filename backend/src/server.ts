import http from 'http';
import app from './app';
import { env } from './config/env';
import { prisma, connectWithRetry } from './config/database';
import { redis, isRedisAvailable } from './config/redis';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scheduledTasksService } from './services/scheduled-tasks.service';
import { aliExpressAuthMonitor } from './services/ali-auth-monitor.service';
import { apiHealthMonitor } from './services/api-health-monitor.service';
import { apiAvailability } from './services/api-availability.service';
import { notificationService } from './services/notification.service';
import scheduledReportsService from './services/scheduled-reports.service';
import bcrypt from 'bcryptjs';
import { resolveChromiumExecutable } from './utils/chromium';

const execAsync = promisify(exec);
const PORT = parseInt(env.PORT, 10);

/**
 * ✅ A3: Validar ENCRYPTION_KEY al inicio del servidor
 * Falla temprano si no está configurado correctamente
 */
function validateEncryptionKey(): void {
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  
  const rawKey = encryptionKey || jwtSecret;
  
  if (!rawKey || rawKey.length < 32) {
    const error = new Error(
      'CRITICAL SECURITY ERROR: ENCRYPTION_KEY or JWT_SECRET environment variable must be set and be at least 32 characters long.\n' +
      'Without a proper encryption key, credentials cannot be securely stored.\n' +
      'Please set ENCRYPTION_KEY in your environment variables before starting the application.'
    );
    console.error('❌', error.message);
    process.exit(1);
  }
  
  console.log('✅ Encryption key validated (length: ' + rawKey.length + ' characters)');
}

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
      
      // ✅ FASE 9: En producción, validar DATABASE_URL antes de intentar
      if (isProduction && !env.DATABASE_URL) {
        console.error('❌ ERROR CRÍTICO: DATABASE_URL no configurada en producción');
        console.error('   El servidor no puede iniciar sin una base de datos.');
        process.exit(1);
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

// ✅ FASE 1: Global error handlers (instrumentación)
// ✅ FIX: Ignore ERR_HTTP_HEADERS_SENT errors (they're non-fatal, response already sent)
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  // Ignore ERR_HTTP_HEADERS_SENT - these happen when response is already sent
  // and are not fatal (the request was already handled)
  if (reason?.code === 'ERR_HTTP_HEADERS_SENT' || reason?.message?.includes('Cannot set headers after they are sent')) {
    // Log at debug level, not error (this is expected in some edge cases)
    console.debug(`[${new Date().toISOString()}] ⚠️  Unhandled rejection (headers already sent, non-fatal):`, reason?.message || String(reason));
    return; // Don't log as error or exit
  }

  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ UNHANDLED REJECTION:`, reason);
  console.error('Stack:', reason?.stack || 'No stack trace');
  // Don't exit immediately - let the server try to recover
  // process.exit(1) will be handled by the catch block in startServer
});

process.on('uncaughtException', (error: Error) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ UNCAUGHT EXCEPTION:`, error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

// ✅ FASE 1: Lazy-load Chromium (no al boot)
async function ensureChromiumLazyLoad(): Promise<void> {
  // Solo intentar resolver Chromium si realmente se va a usar scraping
  // Esto se llama cuando se necesita, no durante boot
  const { env } = await import('./config/env');
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

let isDatabaseReady = false;
let isRedisReady = false;
let isServerReady = false;
let bootstrapStartTime: number | null = null;

// ✅ FASE A: Helper para actualizar estado global
function updateReadinessState() {
  (global as any).__isDatabaseReady = isDatabaseReady;
  (global as any).__isRedisReady = isRedisReady;
  (global as any).__isServerReady = isServerReady;
}

async function startServer() {
  const startTime = Date.now();
  bootstrapStartTime = startTime;
  
  try {
    logMilestone('Starting server initialization');
    
    // ✅ A3: Validar ENCRYPTION_KEY antes de iniciar cualquier servicio
    logMilestone('Validating encryption key');
    validateEncryptionKey();
    
    const { env } = await import('./config/env');
    logMilestone(`Environment: ${env.NODE_ENV}, Port: ${PORT}`);
    
    // ✅ FASE A CRÍTICO: Create HTTP server FIRST (NO awaits before this)
    logMilestone('Creating HTTP server (BEFORE any DB/Redis/migrations)');
    const httpServer = http.createServer(app);
    
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
      console.log('🚀 Ivan Reseller API Server');
      console.log('================================');
      console.log(`✅ LISTEN_CALLBACK - HTTP SERVER LISTENING on ${addressStr} (listen took ${listenTime}ms)`);
      console.log(`   Total time to listen: ${Date.now() - startTime}ms`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log(`Ready: http://localhost:${PORT}/ready`);
      console.log('================================');
      console.log('');
      
      isServerReady = true;
      updateReadinessState();
      logMilestone('LISTEN_CALLBACK - Server is listening and ready to accept connections');
      
      // ✅ FASE A: NOW start bootstrap in background (non-blocking)
      logMilestone('Starting bootstrap in background (DB, Redis, migrations, etc.)');
      (async () => {
        try {
          // Run migrations (non-blocking for server startup)
          logMilestone('Bootstrap: Running database migrations');
          try {
            await runMigrations();
            logMilestone('Bootstrap: Database migrations completed');
          } catch (migrationError: any) {
            console.error('⚠️  Warning: Database migrations failed (server continues running):', migrationError.message);
            // Server continues but /ready will return 503
          }
          
          // Test database connection with retry (non-blocking for server startup)
          logMilestone('Bootstrap: Connecting to database');
          try {
            // ✅ FASE A: Add timeout to DB connection
            const dbConnectionPromise = connectWithRetry(5, 2000);
            const dbTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database connection timeout after 15s')), 15000)
            );
            
            await Promise.race([dbConnectionPromise, dbTimeoutPromise]);
            isDatabaseReady = true;
            updateReadinessState();
            logMilestone('Bootstrap: Database connected successfully');
          } catch (dbError: any) {
            console.error('⚠️  Warning: Database connection failed (server continues in degraded mode):');
            console.error(`   ${dbError.message}`);
            // Server continues but /ready will return 503
            isDatabaseReady = false;
            updateReadinessState();
            
            // Log detailed error info (non-blocking)
            if (dbError.message?.includes('P1000') || dbError.message?.includes('Authentication failed')) {
              console.error('');
              console.error('🔧 ERROR DE AUTENTICACIÓN DETECTADO:');
              console.error('   Esto indica que las credenciales de PostgreSQL no son válidas.');
              console.error('');
              console.error('📋 VERIFICACIÓN:');
              console.error(`   DATABASE_URL configurada: ${env.DATABASE_URL ? '✅ Sí' : '❌ No'}`);
              if (env.DATABASE_URL) {
                try {
                  const url = new URL(env.DATABASE_URL);
                  console.error(`   Host: ${url.hostname}`);
                  console.error(`   Port: ${url.port || '5432'}`);
                  console.error(`   Database: ${url.pathname.replace('/', '')}`);
                  console.error(`   User: ${url.username}`);
                } catch (e) {
                  console.error('   ⚠️  No se pudo parsear DATABASE_URL');
                }
              }
              console.error('');
              console.error('🔧 SOLUCIÓN:');
              console.error('   Verifica las variables en Railway y reinicia el servidor.');
              console.error('   El servidor continuará ejecutándose pero /ready devolverá 503 hasta que la DB esté conectada.');
              console.error('');
            }
          }
          
          // Test Redis connection (only if configured) - non-blocking
          if (isRedisAvailable) {
            logMilestone('Bootstrap: Connecting to Redis');
            try {
              // ✅ FASE A: Add timeout to Redis connection
              const redisPingPromise = redis.ping();
              const redisTimeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout after 5s')), 5000)
              );
              
              await Promise.race([redisPingPromise, redisTimeoutPromise]);
              isRedisReady = true;
              updateReadinessState();
              logMilestone('Bootstrap: Redis connected successfully');
            } catch (redisError: any) {
              console.warn('⚠️  Redis connection failed (server continues without Redis):', redisError.message);
              isRedisReady = false;
              updateReadinessState();
            }
          } else {
            logMilestone('Bootstrap: Redis not configured, skipping');
            isRedisReady = true; // Not required, so mark as ready
            updateReadinessState();
          }
          
          // Asegurar que el usuario admin existe (no bloqueante)
          logMilestone('Bootstrap: Ensuring admin user exists');
          ensureAdminUser().catch((error) => {
            console.warn('⚠️  Warning: No se pudo verificar/crear usuario admin:', error.message);
          });
          
          // ✅ FASE 1: Lazy-load Chromium (no bloquea boot)
          // Solo si Scraper Bridge no está disponible
          const scraperBridgeEnabled = env.SCRAPER_BRIDGE_ENABLED ?? true;
          if (!scraperBridgeEnabled || !env.SCRAPER_BRIDGE_URL) {
            logMilestone('Lazy-loading Chromium (background)');
            ensureChromiumLazyLoad().catch((error) => {
              console.warn('⚠️  Chromium lazy-load failed (non-critical):', error.message);
            });
          } else {
            logMilestone('Scraper Bridge enabled, skipping Chromium initialization');
          }
          
          // ✅ FASE 2: Validar configuración de Scraper Bridge (no bloqueante)
          if (scraperBridgeEnabled && !env.SCRAPER_BRIDGE_URL) {
            console.warn('⚠️  ADVERTENCIA: SCRAPER_BRIDGE_ENABLED=true pero SCRAPER_BRIDGE_URL no está configurada');
            console.warn('   - El sistema usará fallback a stealth-scraping');
          } else if (scraperBridgeEnabled && env.SCRAPER_BRIDGE_URL) {
            logMilestone('Verifying Scraper Bridge availability');
            try {
              const scraperBridge = (await import('./services/scraper-bridge.service')).default;
              const isAvailable = await Promise.race([
                scraperBridge.isAvailable(),
                new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
              ]);
              if (isAvailable) {
                logMilestone('Scraper Bridge is available');
              } else {
                console.warn('⚠️  Scraper Bridge no responde (timeout o no disponible)');
              }
            } catch (error: any) {
              console.warn('⚠️  Error verificando Scraper Bridge:', error?.message || 'Unknown error');
            }
          }
          
          logMilestone('Scheduled tasks initialized');
          console.log('✅ Scheduled tasks initialized');
          console.log('  - Financial alerts: Daily at 6:00 AM');
          console.log('  - Commission processing: Daily at 2:00 AM');
          console.log('');
          
          // Initialize scheduled reports (non-blocking)
          try {
            logMilestone('Initializing scheduled reports');
            await scheduledReportsService.initializeScheduledReports();
            logMilestone('Scheduled reports initialized');
          } catch (error: any) {
            console.warn('⚠️  Warning: Could not initialize scheduled reports:', error.message);
          }
          
          // Recover persisted API statuses (non-blocking)
          try {
            logMilestone('Recovering persisted API statuses');
            await apiAvailability.recoverPersistedStatuses();
            logMilestone('Persisted API statuses recovered');
          } catch (error: any) {
            console.warn('⚠️  Warning: Could not recover persisted API statuses:', error.message);
          }
          
          // ✅ FASE 1: API Health Monitor con feature flags y modo async
          const healthCheckEnabled = env.API_HEALTHCHECK_ENABLED ?? false;
          const healthCheckMode = env.API_HEALTHCHECK_MODE ?? 'async';
          const healthCheckInterval = env.API_HEALTHCHECK_INTERVAL_MS ?? 15 * 60 * 1000;
          
          if (healthCheckEnabled) {
            logMilestone('Configuring API Health Monitor');
            console.log('✅ API Health Monitor configurado:');
            console.log(`  - Modo: ${healthCheckMode}`);
            console.log(`  - Intervalo: ${healthCheckInterval / 1000 / 60} minutos`);
            
            if (healthCheckMode === 'async') {
              apiHealthMonitor.updateConfig({
                checkInterval: healthCheckInterval,
                enabled: true,
              });
              
              // Delay start to avoid conflicts during server initialization
              setTimeout(async () => {
                try {
                  await apiHealthMonitor.start();
                  logMilestone('API Health Monitor started (async mode)');
                } catch (healthError: any) {
                  console.warn('⚠️  Warning: Could not start API Health Monitor:', healthError.message);
                }
              }, 10000);
            } else {
              const isProduction = process.env.NODE_ENV === 'production';
              if (isProduction) {
                console.warn('⚠️  ADVERTENCIA: Modo sync habilitado en producción puede causar SIGSEGV');
              }
              
              setTimeout(async () => {
                try {
                  await apiHealthMonitor.start();
                  logMilestone('API Health Monitor started (sync mode)');
                } catch (healthError: any) {
                  console.warn('⚠️  Warning: Could not start API Health Monitor:', healthError.message);
                }
              }, 10000);
            }
          } else {
            logMilestone('API Health Monitor disabled');
          }
          
          logMilestone('Starting AliExpress Auth Monitor');
          aliExpressAuthMonitor.start();
          
          // ✅ FASE 5: Inicializar Workflow Scheduler (non-blocking)
          try {
            logMilestone('Initializing Workflow Scheduler');
            const { workflowSchedulerService } = await import('./services/workflow-scheduler.service');
            await workflowSchedulerService.initialize();
            logMilestone('Workflow Scheduler initialized');
          } catch (error: any) {
            console.warn('⚠️  Warning: Could not initialize workflow scheduler:', error.message);
          }
          
          const totalInitTime = Date.now() - startTime;
          logMilestone(`Server fully initialized (total: ${totalInitTime}ms)`);
          console.log('');
        } catch (initError: any) {
          console.error('⚠️  Warning: Error during background initialization:', initError.message);
          // Server is already listening, so continue running
        }
      })();
    });
    
    // ✅ FASE 1: Error handling for listen()
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ HTTP Server error:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  apiHealthMonitor.stop();
  aliExpressAuthMonitor.stop();
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
  aliExpressAuthMonitor.stop();
  await scheduledTasksService.shutdown();
  await prisma.$disconnect();
  if (isRedisAvailable) {
    await redis.quit();
  }
  process.exit(0);
});

startServer();
