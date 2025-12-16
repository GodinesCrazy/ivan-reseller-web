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

// CORS
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

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

const corsOptions: CorsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    // Logging para debug
    if (origin) {
      logger.info('CORS: Checking origin', { origin, allowedOrigins });
    }
    
    if (!origin) {
      return callback(null, true);
    }

    // Permitir si está en la lista exacta
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      logger.info('CORS: Origin allowed (exact match)', { origin });
      return callback(null, true);
    }

    // Normalizar y comparar dominios (www y sin www)
    try {
      const originDomain = normalizeDomain(origin);
      const isAllowed = allowedOrigins.some(allowedOrigin => {
        const normalizedAllowed = normalizeDomain(allowedOrigin);
        return originDomain === normalizedAllowed;
      });

      if (isAllowed) {
        logger.info('CORS: Origin allowed (normalized match)', { origin, originDomain });
        return callback(null, true);
      }

      // Verificar patrones dinámicos (AliExpress, etc.)
      const hostname = new URL(origin).hostname;
      if (dynamicOriginMatchers.some((pattern) => pattern.test(hostname))) {
        logger.info('CORS: Origin allowed (pattern match)', { origin, hostname });
        return callback(null, true);
      }
    } catch (error) {
      logger.warn('CORS: invalid origin received', { origin, error });
    }

    logger.warn('CORS: origin not allowed', { origin, allowedOrigins });
    return callback(new Error('Not allowed by CORS policy'), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Correlation-ID'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Cookie parser (debe ir antes de las rutas)
app.use(cookieParser());

// ✅ PRODUCTION READY: Correlation ID middleware (después de cookie parser, antes de rutas)
app.use(correlationMiddleware);

// ✅ PRODUCTION READY: Security headers adicionales
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';
app.use(securityHeadersMiddleware);

// ✅ PRODUCTION READY: Rate limiting global para todas las rutas API
import { createRoleBasedRateLimit } from './middleware/rate-limit.middleware';
app.use('/api', createRoleBasedRateLimit());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Request logging (development)
if (env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('HTTP Request', { method: req.method, path: req.path });
    next();
  });
}

// ====================================
// ROUTES
// ====================================

/**
 * ✅ PRODUCTION READY: Health Check Endpoints
 * 
 * /health - Liveness probe (is the app running?)
 * /ready - Readiness probe (can the app serve traffic?)
 */

// Liveness probe: Verifica que la aplicación está corriendo
app.get('/health', async (_req: Request, res: Response) => {
  // Health check simple y rápido - solo verifica que el proceso está vivo
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'ivan-reseller-backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV
  });
});

// Readiness probe: Verifica que la aplicación puede servir tráfico
app.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    service: 'ivan-reseller-backend',
    environment: env.NODE_ENV
  };

  let isReady = true;

  // Verificar conexión a base de datos (crítico)
  try {
    const { prisma } = await import('./config/database');
    // Timeout de 2 segundos para no bloquear
    const dbCheck = Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout')), 2000))
    ]);
    await dbCheck;
    checks.database = { status: 'healthy', connected: true };
  } catch (error: any) {
    checks.database = { 
      status: 'unhealthy', 
      connected: false, 
      error: error.message || 'Database connection failed'
    };
    isReady = false;
  }

  // Verificar conexión a Redis (opcional pero recomendado)
  try {
    const redisModule = await import('./config/redis');
    if (redisModule.isRedisAvailable) {
      // Timeout de 1 segundo para Redis
      const redisCheck = Promise.race([
        redisModule.redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000))
      ]);
      await redisCheck;
      checks.redis = { status: 'healthy', connected: true };
    } else {
      checks.redis = { status: 'not_configured', connected: false };
      // Redis no es crítico, no afecta readiness
    }
  } catch (error: any) {
    checks.redis = { 
      status: 'unhealthy', 
      connected: false, 
      error: error.message || 'Redis connection failed'
    };
    // Redis no es crítico, no afecta readiness si DB está OK
  }

  // Determinar estado general
  // Listo si DB está healthy (Redis es opcional)
  const isServiceReady = checks.database?.status === 'healthy';
  
  res.status(isServiceReady ? 200 : 503).json({
    ready: isServiceReady,
    checks,
    uptime: process.uptime()
  });
});

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
