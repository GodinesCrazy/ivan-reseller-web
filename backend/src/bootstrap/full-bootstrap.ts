/**
 * ? P0: Full Bootstrap Mode
 * 
 * This bootstrap contains all heavy initialization:
 * - Database migrations
 * - Database connection
 * - Redis connection
 * - BullMQ queues
 * - Schedulers
 * - Chromium/Puppeteer
 * 
 * All operations are protected with try/catch to prevent crashes.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

console.log('[ENV CHECK]', {
  SCRAPERAPI_KEY: !!process.env.SCRAPERAPI_KEY,
  ZENROWS_API_KEY: !!process.env.ZENROWS_API_KEY,
  EBAY_APP_ID: !!process.env.EBAY_APP_ID,
});

import { prisma, connectWithRetry } from '../config/database';
import { redis, isRedisAvailable } from '../config/redis';
import { env } from '../config/env';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getScheduledTasksService } from '../services/scheduled-tasks.service';
import { initializeJobWorkers } from '../services/job.service';
import { apiHealthMonitor } from '../services/api-health-monitor.service';
import { apiAvailability } from '../services/api-availability.service';
import scheduledReportsService from '../services/scheduled-reports.service';
import bcrypt from 'bcryptjs';
import { resolveChromiumExecutable } from '../utils/chromium';
import { setIsDatabaseReady, setIsRedisReady, updateReadinessState } from '../server';

const execAsync = promisify(exec);

// Helper functions (moved from server.ts)
async function ensureAdminUser() {
  try {
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
      console.log('?? Usuario admin no encontrado. Creando...');
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
      
      console.log('? Usuario admin creado exitosamente');
    } else {
      console.log('? Usuario admin ya existe');
    }
  } catch (error) {
    console.error('??  Error al verificar/crear usuario admin:', error);
  }
}

async function runMigrations(maxRetries = 3): Promise<void> {
  const isProduction = env.NODE_ENV === 'production';
  const actualRetries = isProduction ? maxRetries : 1;
  
  for (let attempt = 0; attempt < actualRetries; attempt++) {
    try {
      await execAsync('npx prisma migrate deploy', {
        maxBuffer: 10 * 1024 * 1024,
      });
      console.log('? Database migrations completed');
      return;
    } catch (error: any) {
      const isLastAttempt = attempt === actualRetries - 1;
      
      if (isLastAttempt) {
        console.error('??  Warning: Database migrations failed (server continues running):', error.message);
        return; // Don't throw, server continues
      }
      
      console.log(`??  Migration attempt ${attempt + 1}/${actualRetries} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function ensureChromiumLazyLoad(): Promise<void> {
  try {
    const chromiumPath = await resolveChromiumExecutable();
    if (chromiumPath) {
      console.log(`? Chromium ready: ${chromiumPath}`);
    }
  } catch (error: any) {
    console.warn('??  Chromium lazy-load failed (non-critical):', error.message);
  }
}

function logMilestone(milestone: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${milestone}`);
}

export async function fullBootstrap(startTime: number): Promise<void> {
  try {
    logMilestone('Full bootstrap: Starting heavy initialization');
    
    // Run migrations (non-blocking for server startup)
    logMilestone('Bootstrap: Running database migrations');
    try {
      await runMigrations();
      console.log('✅ Database migrations ok');
      logMilestone('Bootstrap: Database migrations completed');
    } catch (migrationError: any) {
      console.error('⚠️  Database migrations fail (server continues running):', migrationError.message);
    }
    
    // Test database connection with retry (non-blocking for server startup)
    logMilestone('Bootstrap: Connecting to database');
    try {
      const dbConnectionPromise = connectWithRetry(5, 2000);
      const dbTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout after 15s')), 15000)
      );
      
      await Promise.race([dbConnectionPromise, dbTimeoutPromise]);
      setIsDatabaseReady(true);
      updateReadinessState();
      console.log('✅ Prisma connect ok');
      logMilestone('Bootstrap: Database connected successfully');
    } catch (dbError: any) {
      console.error('⚠️  Prisma connect fail (server continues in degraded mode):');
      console.error(`   ${dbError.message}`);
      setIsDatabaseReady(false);
      updateReadinessState();
    }
    
    // Test Redis connection (only if configured) - non-blocking
    if (isRedisAvailable) {
      logMilestone('Bootstrap: Connecting to Redis');
      try {
        const redisPingPromise = redis.ping();
        const redisTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout after 5s')), 5000)
        );
        
        await Promise.race([redisPingPromise, redisTimeoutPromise]);
        setIsRedisReady(true);
        updateReadinessState();
        logMilestone('Bootstrap: Redis connected successfully');
      } catch (redisError: any) {
        console.warn('⚠️  Redis connection failed (server continues without Redis):', redisError.message);
        setIsRedisReady(false);
        updateReadinessState();
      }
    } else {
      logMilestone('Bootstrap: Redis not configured, skipping');
      setIsRedisReady(true); // Not required, so mark as ready
      updateReadinessState();
    }
    
    // Ensure admin user exists (non-blocking)
    logMilestone('Bootstrap: Ensuring admin user exists');
    ensureAdminUser().catch((error) => {
      console.warn('??  Warning: No se pudo verificar/crear usuario admin:', error.message);
    });
    
    // Chromium lazy-load (only if needed)
    const scraperBridgeEnabled = env.SCRAPER_BRIDGE_ENABLED ?? true;
    const safeAuthStatusMode = env.SAFE_AUTH_STATUS_MODE ?? true;
    
    if (safeAuthStatusMode && env.NODE_ENV === 'production') {
      logMilestone('SAFE_AUTH_STATUS_MODE enabled in production - skipping Chromium lazy-load');
    } else if (!scraperBridgeEnabled || !env.SCRAPER_BRIDGE_URL) {
      logMilestone('Lazy-loading Chromium (background)');
      ensureChromiumLazyLoad().catch((error) => {
        console.warn('??  Chromium lazy-load failed (non-critical):', error.message);
      });
    }
    
    // Scraper Bridge verification
    if (scraperBridgeEnabled && env.SCRAPER_BRIDGE_URL) {
      logMilestone('Verifying Scraper Bridge availability');
      try {
        const scraperBridge = (await import('../services/scraper-bridge.service')).default;
        const isAvailable = await Promise.race([
          scraperBridge.isAvailable(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
        ]);
        if (isAvailable) {
          logMilestone('Scraper Bridge is available');
        }
      } catch (error: any) {
        console.warn('??  Error verificando Scraper Bridge:', error?.message || 'Unknown error');
      }
    }
    
    // Initialize job workers (BullMQ) - puede fallar si Redis no está disponible
    try {
      logMilestone('[BOOT] Initializing job workers (BullMQ)');
      if (!isRedisAvailable) {
        console.log('[BOOT] Redis not available - skipping job workers');
        logMilestone('[BOOT] Job workers skipped (Redis unavailable)');
      } else {
        initializeJobWorkers();
        console.log('[BOOT] ✅ Job workers initialized');
        logMilestone('[BOOT] Job workers initialized');
      }
    } catch (error: any) {
      console.warn('[BOOT] ⚠️  Warning: Could not initialize job workers (Express still works):', error.message);
      console.warn('[BOOT] Server continues running - job workers disabled');
    }
    
    // Initialize scheduled tasks service - puede fallar si Redis no está disponible
    try {
      logMilestone('[BOOT] Initializing scheduled tasks service');
      if (!isRedisAvailable) {
        console.log('[BOOT] Redis not available - skipping scheduled tasks');
        logMilestone('[BOOT] Scheduled tasks skipped (Redis unavailable)');
      } else {
        const scheduledTasksService = getScheduledTasksService();
        console.log('[BOOT] ✅ Scheduled tasks service initialized');
        logMilestone('[BOOT] Scheduled tasks service initialized');
      }
    } catch (error: any) {
      console.warn('[BOOT] ⚠️  Warning: Could not initialize scheduled tasks service (Express still works):', error.message);
      console.warn('[BOOT] Server continues running - scheduled tasks disabled');
    }

    // Load AliExpress OAuth token from DB (for refresh job and any OAuth flows)
    try {
      const { aliexpressAffiliateAPIService } = await import('../services/aliexpress-affiliate-api.service');
      await aliexpressAffiliateAPIService.loadTokenFromDatabase();
      logMilestone('AliExpress token loaded from DB (if any)');
    } catch (tokenErr: any) {
      // Non-critical: token refresh job will load from DB when needed
    }

    // Initialize scheduled reports
    try {
      logMilestone('Initializing scheduled reports');
      await scheduledReportsService.initializeScheduledReports();
      logMilestone('Scheduled reports initialized');
    } catch (error: any) {
      console.warn('??  Warning: Could not initialize scheduled reports:', error.message);
    }
    
    // Recover persisted API statuses
    try {
      logMilestone('Recovering persisted API statuses');
      await apiAvailability.recoverPersistedStatuses();
      logMilestone('Persisted API statuses recovered');
    } catch (error: any) {
      console.warn('??  Warning: Could not recover persisted API statuses:', error.message);
    }
    
    // API Health Monitor
    const healthCheckEnabled = env.API_HEALTHCHECK_ENABLED ?? false;
    const healthCheckMode = env.API_HEALTHCHECK_MODE ?? 'async';
    const healthCheckInterval = env.API_HEALTHCHECK_INTERVAL_MS ?? 15 * 60 * 1000;
    
    if (healthCheckEnabled) {
      logMilestone('Configuring API Health Monitor');
      if (healthCheckMode === 'async') {
        apiHealthMonitor.updateConfig({
          checkInterval: healthCheckInterval,
          enabled: true,
        });
        setTimeout(async () => {
          try {
            await apiHealthMonitor.start();
            logMilestone('API Health Monitor started (async mode)');
          } catch (healthError: any) {
            console.warn('??  Warning: Could not start API Health Monitor:', healthError.message);
          }
        }, 10000);
      }
    }
    
    // AliExpress Auth Monitor
    if (env.ALIEXPRESS_AUTH_MONITOR_ENABLED) {
      const safeMode = env.SAFE_AUTH_STATUS_MODE ?? (process.env.NODE_ENV === 'production');
      const disableBrowser = env.DISABLE_BROWSER_AUTOMATION ?? false;
      
      if (!safeMode && !disableBrowser) {
        logMilestone('Starting AliExpress Auth Monitor');
        const { aliExpressAuthMonitor } = await import('../services/ali-auth-monitor.service');
        aliExpressAuthMonitor.start();
      }
    }
    
    // Workflow Scheduler
    try {
      logMilestone('Initializing Workflow Scheduler');
      const { workflowSchedulerService } = await import('../services/workflow-scheduler.service');
      await workflowSchedulerService.initialize();
      logMilestone('Workflow Scheduler initialized');
    } catch (error: any) {
      console.warn('??  Warning: Could not initialize workflow scheduler:', error.message);
    }

    // Autopilot: init and auto-start when config.enabled (done inside initializeAutopilot)
    try {
      logMilestone('Initializing Autopilot');
      const { initializeAutopilot } = await import('../autopilot-init');
      await initializeAutopilot();
      logMilestone('Autopilot initialized (start triggered from autopilot-init if enabled)');
    } catch (autopilotError: any) {
      console.warn('??  Warning: Could not initialize or start autopilot:', autopilotError?.message || autopilotError);
    }

    const totalInitTime = Date.now() - startTime;
    logMilestone(`Full bootstrap completed (total: ${totalInitTime}ms)`);
    console.log('');
    console.log('? BOOTSTRAP DONE');
    console.log('');
  } catch (initError: any) {
    // Startup guard: never crash process; server already listening, /health returns 200
    console.error('??  Warning: Error during full bootstrap:', initError.message);
    console.error('   Server continues running in degraded mode');
    console.log('');
    console.log('? BOOTSTRAP DONE (with errors)');
    console.log('');
  }
}
