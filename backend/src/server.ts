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

async function startServer() {
  try {
    // ✅ A3: Validar ENCRYPTION_KEY antes de iniciar cualquier servicio
    console.log('🔒 Validating encryption key...');
    validateEncryptionKey();
    
    // ✅ FASE 2: Validar configuración de Scraper Bridge
    const { env } = await import('./config/env');
    const scraperBridgeEnabled = env.SCRAPER_BRIDGE_ENABLED ?? true;
    const scraperBridgeURL = env.SCRAPER_BRIDGE_URL;
    
    if (scraperBridgeEnabled && !scraperBridgeURL) {
      console.warn('⚠️  ADVERTENCIA: SCRAPER_BRIDGE_ENABLED=true pero SCRAPER_BRIDGE_URL no está configurada');
      console.warn('   - El sistema usará fallback a stealth-scraping');
      console.warn('   - Para habilitar bridge Python: configure SCRAPER_BRIDGE_URL');
      console.warn('   - Para deshabilitar bridge: configure SCRAPER_BRIDGE_ENABLED=false');
    } else if (scraperBridgeEnabled && scraperBridgeURL) {
      console.log(`✅ Scraper Bridge configurado: ${scraperBridgeURL}`);
      // ✅ FASE 2: Verificar que el bridge esté disponible (timeout corto, no bloqueante)
      try {
        const scraperBridge = (await import('./services/scraper-bridge.service')).default;
        const isAvailable = await Promise.race([
          scraperBridge.isAvailable(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
        ]);
        if (isAvailable) {
          console.log('✅ Scraper Bridge está disponible y respondiendo');
        } else {
          console.warn('⚠️  Scraper Bridge no responde (timeout o no disponible)');
          console.warn('   - El sistema usará fallback a stealth-scraping');
        }
      } catch (error: any) {
        console.warn('⚠️  Error verificando Scraper Bridge:', error?.message || 'Unknown error');
        console.warn('   - El sistema usará fallback a stealth-scraping');
      }
    } else {
      console.log('ℹ️  Scraper Bridge deshabilitado (SCRAPER_BRIDGE_ENABLED=false)');
      console.log('   - El sistema usará stealth-scraping directamente');
    }
    
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
    try {
      const chromiumPath = await resolveChromiumExecutable();
      process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
      process.env.CHROMIUM_PATH = chromiumPath;
      console.log(`✅ Chromium executable ready at: ${chromiumPath}`);
    } catch (error: any) {
      console.warn('⚠️  Unable to resolve Chromium executable automatically:', error?.message || error);
      console.warn('   - El scraping puede fallar si Chromium no está disponible');
      console.warn('   - Configure PUPPETEER_EXECUTABLE_PATH o use Scraper Bridge como alternativa');
    }
    console.log('🚀 Iniciando servidor...');
    console.log(`📦 Environment: ${env.NODE_ENV}`);
    console.log(`🔌 Port: ${PORT}`);
    
    // Run migrations before connecting
    console.log('🔄 Ejecutando migraciones...');
    await runMigrations();
    
    // Test database connection with retry
    console.log('🔌 Conectando a la base de datos...');
    try {
      await connectWithRetry(5, 2000);
    } catch (dbError: any) {
      console.error('❌ ERROR DE CONEXIÓN A LA BASE DE DATOS:');
      console.error(`   Mensaje: ${dbError.message}`);
      
      // Mostrar información detallada del error
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
        console.error('🔧 SOLUCIÓN AUTOMÁTICA:');
        console.error('   El código intentará múltiples formas de obtener DATABASE_URL.');
        console.error('   Si el problema persiste, verifica las variables en Railway.');
        console.error('');
      }
      throw dbError;
    }
    
    // Asegurar que el usuario admin existe (verificación final)
    // No bloqueamos el inicio del servidor si esto falla
    console.log('👤 Verificando usuario admin...');
    ensureAdminUser().catch((error) => {
      console.error('⚠️  Warning: No se pudo verificar/crear usuario admin:', error.message);
      console.log('⚠️  El servidor continuará iniciando. El usuario admin puede no existir.');
    });

    // Test Redis connection (only if configured)
    if (isRedisAvailable) {
      console.log('🔌 Conectando a Redis...');
      await redis.ping();
      console.log('✅ Redis connected');
    } else {
      console.log('⚠️  Redis no configurado, continuando sin Redis');
    }

    // Start HTTP server for Socket.io support
    console.log('🌐 Iniciando servidor HTTP...');
    const httpServer = http.createServer(app);
    
    // ✅ CRÍTICO: Inicializar Socket.io antes de que el servidor escuche
    console.log('🔌 Inicializando Socket.IO...');
    notificationService.initialize(httpServer);
    console.log('✅ Socket.IO notification service initialized');
    
    httpServer.listen(PORT, '0.0.0.0', async () => {
      console.log('');
      console.log('🚀 Ivan Reseller API Server');
      console.log('================================');
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log('================================');
      console.log('');
      console.log('✅ Scheduled tasks initialized');
      console.log('  - Financial alerts: Daily at 6:00 AM');
      console.log('  - Commission processing: Daily at 2:00 AM');
      console.log('');
      
      // Initialize scheduled reports
      try {
        await scheduledReportsService.initializeScheduledReports();
        console.log('✅ Scheduled reports initialized');
      } catch (error: any) {
        console.warn('⚠️  Warning: Could not initialize scheduled reports:', error.message);
      }
      console.log('');
      
      // Recover persisted API statuses
      try {
        await apiAvailability.recoverPersistedStatuses();
        console.log('✅ Recovered persisted API statuses from database');
      } catch (error: any) {
        console.warn('⚠️  Warning: Could not recover persisted API statuses:', error.message);
      }
      
      // ✅ FASE 1: API Health Monitor con feature flags y modo async
      const { env } = await import('./config/env');
      const healthCheckEnabled = env.API_HEALTHCHECK_ENABLED ?? false;
      const healthCheckMode = env.API_HEALTHCHECK_MODE ?? 'async';
      const healthCheckInterval = env.API_HEALTHCHECK_INTERVAL_MS ?? 15 * 60 * 1000;
      
      if (healthCheckEnabled) {
        console.log('✅ API Health Monitor configurado:');
        console.log(`  - Modo: ${healthCheckMode}`);
        console.log(`  - Intervalo: ${healthCheckInterval / 1000 / 60} minutos`);
        console.log(`  - Checks asíncronos: ${healthCheckMode === 'async' ? 'Sí (BullMQ)' : 'No (síncrono)'}`);
        
        if (healthCheckMode === 'async') {
          // ✅ FASE 1: Modo async usa BullMQ - más seguro, no bloquea request thread
          console.log('  - Todos los health checks se ejecutan en cola BullMQ (previene SIGSEGV)');
          // El monitor automático NO ejecuta health checks directamente,
          // solo los encola en BullMQ para procesamiento asíncrono
          
          // Configurar monitor para usar intervalo personalizado
          apiHealthMonitor.updateConfig({
            checkInterval: healthCheckInterval,
            enabled: true,
          });
          
          // Delay start to avoid conflicts during server initialization
          setTimeout(async () => {
            try {
              await apiHealthMonitor.start();
              console.log('✅ API Health Monitor started (async mode - BullMQ)');
            } catch (healthError: any) {
              console.warn('⚠️  Warning: Could not start API Health Monitor:', healthError.message);
              console.log('⚠️  API health monitoring is disabled. The server will continue without it.');
            }
          }, 10000); // Start after 10 seconds to let server fully initialize
        } else {
          // Modo sync - solo en desarrollo con advertencia
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction) {
            console.warn('⚠️  ADVERTENCIA: Modo sync habilitado en producción puede causar SIGSEGV');
            console.warn('  - Recomendado: usar API_HEALTHCHECK_MODE=async en producción');
          }
          
          setTimeout(async () => {
            try {
              await apiHealthMonitor.start();
              console.log('✅ API Health Monitor started (sync mode - solo desarrollo)');
            } catch (healthError: any) {
              console.warn('⚠️  Warning: Could not start API Health Monitor:', healthError.message);
            }
          }, 10000);
        }
      } else {
        console.log('ℹ️  API Health Monitor automático DESHABILITADO');
        console.log('  - Para habilitarlo: API_HEALTHCHECK_ENABLED=true');
        console.log('  - Los checks manuales desde la UI (/api/system/test-apis) siguen funcionando');
      }
      console.log('');
      
      aliExpressAuthMonitor.start();
      
      // ✅ FASE 5: Inicializar Workflow Scheduler
      try {
        const { workflowSchedulerService } = await import('./services/workflow-scheduler.service');
        await workflowSchedulerService.initialize();
        console.log('✅ Workflow Scheduler initialized');
        console.log('  - Personal workflows will run according to their schedules');
      } catch (error: any) {
        console.warn('⚠️  Warning: Could not initialize workflow scheduler:', error.message);
      }
      console.log('');
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
