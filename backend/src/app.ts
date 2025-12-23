import express, { Application, Request, Response, NextFunction } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { setupSwagger } from './config/swagger';
import { logger } from './config/logger';
// ✅ PRODUCTION READY: Correlation ID middleware
import { correlationMiddleware } from './middleware/correlation.middleware';

// Import routes
import authRoutes from './api/routes/auth.routes';
import userRoutes from './api/routes/users.routes';
import productRoutes from './api/routes/products.routes';
import saleRoutes from './api/routes/sales.routes';
import commissionRoutes from './api/routes/commissions.routes';
import dashboardRoutes from './api/routes/dashboard.routes';
import adminRoutes from './api/routes/admin.routes';

// Additional routes
import opportunitiesRoutes from './api/routes/opportunities.routes';
import { automationRoutes } from './routes/automation.routes';
import settingsRoutes from './routes/settings.routes';
import marketplaceRoutes from './api/routes/marketplace.routes';
import marketplaceOauthRoutes from './api/routes/marketplace-oauth.routes';
import amazonRoutes from './api/routes/amazon.routes';
import jobsRoutes from './api/routes/jobs.routes';
import reportsRoutes from './api/routes/reports.routes';
import notificationsRoutes from './api/routes/notifications.routes';
import webhooksRoutes from './api/routes/webhooks.routes';
import systemRoutes from './api/routes/system.routes';
import logsRoutes from './api/routes/logs.routes';
import proxiesRoutes from './api/routes/proxies.routes';
import publisherRoutes from './api/routes/publisher.routes';
import currencyRoutes from './api/routes/currency.routes';
import captchaRoutes from './api/routes/captcha.routes';
import apiCredentialsRoutes from './api/routes/api-credentials.routes';
import workflowConfigRoutes from './api/routes/workflow-config.routes';
import adminCommissionsRoutes from './api/routes/admin-commissions.routes';
import successfulOperationsRoutes from './api/routes/successful-operations.routes';
import autopilotRoutes from './api/routes/autopilot.routes';
import financialAlertsRoutes from './api/routes/financial-alerts.routes';
import businessMetricsRoutes from './api/routes/business-metrics.routes';
import antiChurnRoutes from './api/routes/anti-churn.routes';
import pricingTiersRoutes from './api/routes/pricing-tiers.routes';
import referralRoutes from './api/routes/referral.routes';
import costOptimizationRoutes from './api/routes/cost-optimization.routes';
import aiImprovementsRoutes from './api/routes/ai-improvements.routes';
import advancedReportsRoutes from './api/routes/advanced-reports.routes';
import revenueChangeRoutes from './api/routes/revenue-change.routes';
import financeRoutes from './api/routes/finance.routes';
import dropshippingRoutes from './api/routes/dropshipping.routes';
import regionalRoutes from './api/routes/regional.routes';
import aiSuggestionsRoutes from './api/routes/ai-suggestions.routes';
import manualAuthRoutes from './api/routes/manual-auth.routes';
import authStatusRoutes from './api/routes/auth-status.routes';
import configAuditRoutes from './api/routes/config-audit.routes';
import manualCaptchaRoutes from './api/routes/manual-captcha.routes';
import accessRequestsRoutes from './api/routes/access-requests.routes';
import listingLifetimeRoutes from './api/routes/listing-lifetime.routes';
import meetingRoomRoutes from './api/routes/meeting-room.routes';
import debugRoutes from './api/routes/debug.routes';

const app: Application = express();
app.set('trust proxy', 1);

// ====================================
// MIDDLEWARE
// ====================================

// Security
// ✅ C8: Configurar CSP (Content Security Policy) para prevenir XSS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Necesario para algunos estilos inline
      scriptSrc: ["'self'"], // Solo scripts del mismo origen
      imgSrc: ["'self'", "data:", "https:"], // Permitir imágenes de cualquier HTTPS
      connectSrc: ["'self'", "https://api.ebay.com", "https://api.sandbox.ebay.com", "https://api.mercadolibre.com", "https://sellingpartnerapi-na.amazon.com"], // APIs de marketplaces
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://meet.jit.si", "https://*.jit.si"], // Permitir iframes de Jitsi Meet
      upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null, // Solo en producción
    },
  },
  crossOriginEmbedderPolicy: false, // Deshabilitar para compatibilidad con APIs externas
}));

// ✅ PRODUCTION FIX: Validar y parsear CORS_ORIGIN con fallback de producción
let allowedOrigins: string[] = [];
try {
  // Función helper para normalizar URLs (eliminar trailing slash)
  const normalizeOrigin = (origin: string): string => {
    return origin.trim().replace(/\/+$/, '');
  };

  // Prioridad 1: CORS_ORIGIN desde ENV
  if (env.CORS_ORIGIN && typeof env.CORS_ORIGIN === 'string') {
    allowedOrigins = env.CORS_ORIGIN.split(',')
      .map(normalizeOrigin)
      .filter((origin) => origin.length > 0);
  }

  // Prioridad 2: Si CORS_ORIGIN está vacío pero FRONTEND_URL existe, usarlo
  if (allowedOrigins.length === 0 && env.FRONTEND_URL) {
    const normalizedFrontend = normalizeOrigin(env.FRONTEND_URL);
    if (normalizedFrontend) {
      allowedOrigins = [normalizedFrontend];
      // También agregar versión sin www si tiene www, y viceversa
      try {
        const url = new URL(normalizedFrontend);
        if (url.hostname.startsWith('www.')) {
          allowedOrigins.push(normalizedFrontend.replace('www.', ''));
        } else {
          allowedOrigins.push(normalizedFrontend.replace(url.hostname, `www.${url.hostname}`));
        }
      } catch {
        // Ignorar si no se puede parsear
      }
    }
  }

  // Prioridad 3: Fallback de producción
  if (allowedOrigins.length === 0) {
    if (env.NODE_ENV === 'production') {
      console.warn('⚠️  CORS_ORIGIN no configurada en producción, usando fallback de producción');
      allowedOrigins = [
        'https://www.ivanreseller.com',
        'https://ivanreseller.com'
      ];
    } else {
      console.warn('⚠️  CORS_ORIGIN no configurada, usando default de desarrollo');
      allowedOrigins = ['http://localhost:5173'];
    }
  }

  // Log final de origins configuradas
  console.log(`✅ CORS Origins configuradas (${allowedOrigins.length}):`);
  allowedOrigins.forEach((origin, idx) => {
    console.log(`   ${idx + 1}. ${origin}`);
  });
} catch (error) {
  console.error('❌ ERROR parseando CORS_ORIGIN:', error);
  // Fallback seguro de producción
  if (env.NODE_ENV === 'production') {
    allowedOrigins = [
      'https://www.ivanreseller.com',
      'https://ivanreseller.com'
    ];
  } else {
    allowedOrigins = ['http://localhost:5173'];
  }
}

const dynamicOriginMatchers = [
  /\.aliexpress\.[a-z]+$/i,
];

// Función para normalizar dominios (www y sin www)
const normalizeDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, ''); // Remover www para comparación
  } catch {
    return url;
  }
};

// ✅ PRODUCTION FIX: CORS robusto con manejo correcto de preflight
const corsOptions: CorsOptions = {
  credentials: true, // ✅ Se usa cookies/httpOnly tokens, mantener true
  origin: (origin, callback) => {
    // Si no viene Origin (curl, health checks, server-to-server), permitir
    if (!origin) {
      return callback(null, true);
    }

    // Normalizar origin (eliminar trailing slash)
    const normalizedOrigin = origin.replace(/\/+$/, '');

    // Permitir si está en la lista exacta (después de normalizar)
    if (allowedOrigins.includes('*')) {
      // ⚠️ NO usar * con credentials=true, pero si está configurado, permitirlo
      logger.warn('CORS: Using wildcard * with credentials=true (not recommended)');
      return callback(null, true);
    }

    if (allowedOrigins.includes(normalizedOrigin)) {
      logger.debug('CORS: Origin allowed (exact match)', { origin: normalizedOrigin });
      return callback(null, true);
    }

    // Normalizar y comparar dominios (www y sin www)
    try {
      const originDomain = normalizeDomain(normalizedOrigin);
      const isAllowed = allowedOrigins.some(allowedOrigin => {
        const normalizedAllowed = normalizeDomain(allowedOrigin);
        return originDomain === normalizedAllowed;
      });

      if (isAllowed) {
        logger.debug('CORS: Origin allowed (normalized match)', { origin: normalizedOrigin, originDomain });
        return callback(null, true);
      }

      // Verificar patrones dinámicos (AliExpress, etc.)
      const hostname = new URL(normalizedOrigin).hostname;
      if (dynamicOriginMatchers.some((pattern) => pattern.test(hostname))) {
        logger.debug('CORS: Origin allowed (pattern match)', { origin: normalizedOrigin, hostname });
        return callback(null, true);
      }
    } catch (error) {
      logger.warn('CORS: invalid origin received', { origin: normalizedOrigin, error });
    }

    // Origin no permitido
    logger.warn('CORS: origin not allowed', { 
      origin: normalizedOrigin, 
      allowedOrigins: allowedOrigins.slice(0, 3) // Solo mostrar primeros 3 para no saturar logs
    });
    return callback(new Error('Not allowed by CORS policy'), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Correlation-ID'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  preflightContinue: false, // ✅ No continuar al siguiente middleware en preflight
  optionsSuccessStatus: 204, // ✅ Responder 204 para OPTIONS
  exposedHeaders: ['Set-Cookie'], // Exponer Set-Cookie si se usa
};

// ✅ PRODUCTION FIX: Aplicar CORS antes de cualquier otra cosa
app.use(cors(corsOptions));

// ✅ PRODUCTION FIX: Manejar preflight OPTIONS explícitamente para todas las rutas /api/*
// Esto asegura que OPTIONS siempre responda correctamente, incluso si alguna ruta no lo maneja
app.options('/api/*', cors(corsOptions));
app.options('*', cors(corsOptions)); // Fallback para cualquier ruta

// Cookie parser (debe ir antes de las rutas)
app.use(cookieParser());

// ✅ PRODUCTION READY: Correlation ID middleware (después de cookie parser, antes de rutas)
app.use(correlationMiddleware);

// ✅ FASE 0: Version header middleware (adds X-App-Commit to all responses)
import { versionHeaderMiddleware, initBuildInfo, getBuildInfo } from './middleware/version-header.middleware';
// Initialize build info (will be called from server.ts on startup)
app.use(versionHeaderMiddleware);

// ====================================
// EARLY ROUTES (antes de middlewares pesados)
// ====================================
// ✅ FIX: Health endpoints ANTES de compression, body parsing, y otros middlewares pesados
// Esto asegura que /health y /ready respondan rápido sin interferencias

// ✅ FASE A: Readiness state variables (imported from server.ts)
// These are set during bootstrap
declare global {
  // eslint-disable-next-line no-var
  var __isDatabaseReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __isRedisReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __isServerReady: boolean | undefined;
}

/**
 * ✅ PRODUCTION READY: Health Check Endpoints (EARLY)
 * 
 * /health - Liveness probe (is the app running?)
 * /ready - Readiness probe (can the app serve traffic?)
 * 
 * IMPORTANTE: Estas rutas están ANTES de compression y otros middlewares
 * para garantizar respuesta rápida y sin interferencias
 */

// ✅ FASE 0: Version endpoint (for deployment verification)
app.get('/version', (_req: Request, res: Response) => {
  const buildInfo = getBuildInfo();
  res.status(200).json({
    gitSha: buildInfo.gitSha,
    buildTime: buildInfo.buildTime,
    node: buildInfo.nodeVersion,
    env: env.NODE_ENV,
    serviceName: 'ivan-reseller-backend',
    uptime: process.uptime(),
  });
});

// ✅ GO-LIVE: Config endpoint (diagnóstico seguro, sin secretos)
app.get('/config', (_req: Request, res: Response) => {
  try {
    // Parsear CORS origins
    const corsOrigins = env.CORS_ORIGIN
      ? env.CORS_ORIGIN.split(',')
          .map((o: string) => o.trim())
          .filter((o: string) => o.length > 0)
      : [];
    
    // Extraer información segura de DATABASE_URL (sin credenciales)
    let databaseHost = 'not configured';
    let hasDbUrl = false;
    if (env.DATABASE_URL) {
      hasDbUrl = true;
      try {
        const dbUrl = new URL(env.DATABASE_URL);
        databaseHost = dbUrl.hostname; // Solo hostname, sin user/pass/dbname
      } catch {
        databaseHost = 'invalid format';
      }
    }
    
    // Extraer información segura de REDIS_URL (sin credenciales)
    let redisHost = 'not configured';
    let hasRedisUrl = false;
    if (env.REDIS_URL && env.REDIS_URL !== 'redis://localhost:6379') {
      hasRedisUrl = true;
      try {
        const redisUrl = new URL(env.REDIS_URL);
        redisHost = redisUrl.hostname; // Solo hostname
      } catch {
        redisHost = 'invalid format';
      }
    }
    
    // Extraer información segura de API_URL y FRONTEND_URL
    let apiUrlHost = 'not configured';
    if (env.API_URL) {
      try {
        const apiUrl = new URL(env.API_URL);
        apiUrlHost = apiUrl.hostname;
      } catch {
        apiUrlHost = 'invalid format';
      }
    }
    
    let frontendUrlHost = 'not configured';
    if (env.FRONTEND_URL) {
      try {
        const frontendUrl = new URL(env.FRONTEND_URL);
        frontendUrlHost = frontendUrl.hostname;
      } catch {
        frontendUrlHost = 'invalid format';
      }
    }
    
    res.status(200).json({
      env: env.NODE_ENV,
      corsOriginCount: corsOrigins.length,
      corsOriginsSample: corsOrigins.length > 0 
        ? corsOrigins.slice(0, 3).map((o: string) => {
            try {
              const url = new URL(o);
              return url.hostname; // Solo hostname para seguridad
            } catch {
              return o;
            }
          })
        : [],
      apiUrl: apiUrlHost,
      frontendUrl: frontendUrlHost,
      hasDbUrl,
      databaseHost,
      hasRedisUrl,
      redisHost,
      // Flags de feature
      scraperBridgeEnabled: env.SCRAPER_BRIDGE_ENABLED ?? false,
      allowBrowserAutomation: env.ALLOW_BROWSER_AUTOMATION ?? false,
      aliExpressDataSource: env.ALIEXPRESS_DATA_SOURCE || 'api',
    });
  } catch (error: any) {
    logger.error('Error generating config endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to generate config',
      message: error.message,
    });
  }
});

// Liveness probe: Verifica que la aplicación está corriendo
app.get('/health', async (_req: Request, res: Response) => {
  // ✅ FIX: Health check ultra-rápido, sin imports dinámicos pesados
  // Solo información básica del proceso
  try {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ivan-reseller-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      // Memory info básico (sin import dinámico)
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    });
  } catch (error) {
    // Si algo falla, responder 200 de todas formas (proceso está vivo)
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ivan-reseller-backend'
    });
  }
});

// Readiness probe: Verifica que la aplicación puede servir tráfico
app.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    service: 'ivan-reseller-backend',
    environment: env.NODE_ENV
  };

  // ✅ FASE A: Use global state if available (set during bootstrap)
  const isDBReady = (global as any).__isDatabaseReady ?? false;
  const isRedisReady = (global as any).__isRedisReady ?? false;
  const isServerReady = (global as any).__isServerReady ?? false;

  // ✅ FASE A: Verificar conexión a base de datos (crítico) con timeout corto
  // Si el estado global indica que está listo, usar ese. Si no, verificar directamente.
  if (isDBReady) {
    checks.database = { status: 'healthy', connected: true, source: 'bootstrap_state' };
  } else {
    try {
      const { prisma } = await import('./config/database');
      // Timeout de 2 segundos para no bloquear
      const dbCheck = Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout')), 2000))
      ]);
      await dbCheck;
      checks.database = { status: 'healthy', connected: true, source: 'live_check' };
    } catch (error: any) {
      checks.database = { 
        status: 'unhealthy', 
        connected: false, 
        error: error.message || 'Database connection failed',
        source: 'live_check'
      };
    }
  }

  // Verificar conexión a Redis (opcional pero recomendado)
  if ((global as any).__isRedisReady === true || (global as any).__isRedisReady === false) {
    // Bootstrap state available
    checks.redis = { 
      status: isRedisReady ? 'healthy' : 'not_configured_or_unavailable', 
      connected: isRedisReady,
      source: 'bootstrap_state'
    };
  } else {
    // Check live
    try {
      const redisModule = await import('./config/redis');
      if (redisModule.isRedisAvailable) {
        // Timeout de 1 segundo para Redis
        const redisCheck = Promise.race([
          redisModule.redis.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000))
        ]);
        await redisCheck;
        checks.redis = { status: 'healthy', connected: true, source: 'live_check' };
      } else {
        checks.redis = { status: 'not_configured', connected: false, source: 'live_check' };
      }
    } catch (error: any) {
      checks.redis = { 
        status: 'unhealthy', 
        connected: false, 
        error: error.message || 'Redis connection failed',
        source: 'live_check'
      };
    }
  }

  // ✅ FASE A: Determinar estado general
  // CRÍTICO: DB debe estar healthy. Redis es opcional.
  const dbHealthy = checks.database?.status === 'healthy';
  const isServiceReady = dbHealthy && isServerReady;
  
  // ✅ FASE A: Devolver 503 si no está listo, 200 si está listo
  res.status(isServiceReady ? 200 : 503).json({
    ready: isServiceReady,
    checks,
    uptime: process.uptime()
  });
});

// ====================================
// MIDDLEWARE (después de health endpoints)
// ====================================

// ✅ PRODUCTION READY: Security headers adicionales
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';
app.use(securityHeadersMiddleware);

// ✅ PRODUCTION READY: Response time headers
import { responseTimeMiddleware } from './middleware/response-time.middleware';
app.use(responseTimeMiddleware);

// ✅ PRODUCTION READY: Rate limiting global para todas las rutas API
import { createRoleBasedRateLimit } from './middleware/rate-limit.middleware';
app.use('/api', createRoleBasedRateLimit());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// ✅ PRODUCTION READY: Request logging estructurado (todos los ambientes)
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
app.use(requestLoggerMiddleware);

// ====================================
// API ROUTES
// ====================================

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/access-requests', accessRequestsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Additional API routes
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/ai-suggestions', aiSuggestionsRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/autopilot', autopilotRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/marketplace-oauth', marketplaceOauthRoutes);
// ✅ AliExpress callback directo (según documentación: https://ivanreseller.com/aliexpress/callback)
app.use('/aliexpress', marketplaceOauthRoutes);
app.use('/api/amazon', amazonRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/proxies', proxiesRoutes);
app.use('/api/publisher', publisherRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/manual-captcha', manualCaptchaRoutes);
app.use('/api/credentials', apiCredentialsRoutes);
app.use('/api/workflow', workflowConfigRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminCommissionsRoutes);
app.use('/api/operations', successfulOperationsRoutes);
app.use('/api/financial-alerts', financialAlertsRoutes);
app.use('/api/business-metrics', businessMetricsRoutes);
app.use('/api/anti-churn', antiChurnRoutes);
app.use('/api/pricing-tiers', pricingTiersRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/cost-optimization', costOptimizationRoutes);
app.use('/api/ai-improvements', aiImprovementsRoutes);
app.use('/api/advanced-reports', advancedReportsRoutes);
app.use('/api/revenue-change', revenueChangeRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/dropshipping', dropshippingRoutes);
app.use('/api/regional', regionalRoutes);
app.use('/api/manual-auth', manualAuthRoutes);
app.use('/api/auth-status', authStatusRoutes);
app.use('/api/config-audit', configAuditRoutes);
app.use('/api/listing-lifetime', listingLifetimeRoutes);
app.use('/api/meeting-room', meetingRoomRoutes);
app.use('/debug', debugRoutes);

// Swagger API Documentation
if (env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  setupSwagger(app as any);
}

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
