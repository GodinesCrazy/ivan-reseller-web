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
import setupStatusRoutes from './api/routes/setup-status.routes';
import configAuditRoutes from './api/routes/config-audit.routes';
import manualCaptchaRoutes from './api/routes/manual-captcha.routes';
import accessRequestsRoutes from './api/routes/access-requests.routes';
import listingLifetimeRoutes from './api/routes/listing-lifetime.routes';
import meetingRoomRoutes from './api/routes/meeting-room.routes';
import debugRoutes from './api/routes/debug.routes';
import helpRoutes from './api/routes/help.routes';
import aliExpressRoutes from './modules/aliexpress/aliexpress.routes';
import trendsRoutes from './api/routes/trends.routes';
import profitabilityRoutes from './modules/profitability/profitability.routes';
import diagRoutes from './api/routes/diag.routes';
import internalRoutes from './api/routes/internal.routes';

// ✅ FIX STABILITY: Import overload protection and timeout middlewares
import { overloadProtectionMiddleware } from './middleware/overload-protection.middleware';
import { timeoutMiddleware } from './middleware/timeout.middleware';

const app: Application = express();
app.set('trust proxy', 1);

// ✅ PRODUCTION FIX DEFINITIVO: Deshabilitar ETag para /api/* para evitar 304 sin CORS
// Express por defecto puede devolver 304 (Not Modified) sin pasar por middlewares CORS
app.set('etag', false); // Deshabilitar ETag globalmente (más seguro para APIs)

// ====================================
// HEALTH-FIRST MIDDLEWARE (Railway healthcheck path: /health)
// Must be THE FIRST app.use() – no DB, Redis, queues, auth, or heavy deps.
// ====================================
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' || (req.path !== '/health' && req.path !== '/ready')) {
    return next();
  }
  
  // Handle /ready endpoint
  if (req.path === '/ready') {
    const start = Date.now();
    const correlationId = (req as any).correlationId || `ready-${Date.now()}`;
    console.log(`[READY] ${req.method} ${req.path} from ${req.ip || req.socket.remoteAddress || 'unknown'} correlationId=${correlationId}`);
    try {
      const mem = process.memoryUsage();
      const safeBoot = env.SAFE_BOOT || false;
      const port = Number(process.env.PORT || env.PORT || 3000);
      const responseTime = Date.now() - start;
      
      // ✅ P0: /ready is always ready if server is listening (SAFE_BOOT or not)
      const isReady = true; // Server is listening, so it's ready
      
      res.setHeader('X-Response-Time', `${responseTime}ms`);
      res.setHeader('X-Health', 'ok');
      res.setHeader('X-Correlation-Id', correlationId);
      res.status(200).json({
        ok: true,
        ready: isReady,
        safeBoot,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: process.uptime(),
        port,
        correlationId,
        service: 'ivan-reseller-backend',
        build: {
          gitSha: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown').toString().substring(0, 7),
          buildTime: process.env.BUILD_TIME || process.env.RAILWAY_BUILD_TIME || new Date().toISOString(),
        },
        memory: {
          used: Math.round(mem.heapUsed / 1024 / 1024),
          total: Math.round(mem.heapTotal / 1024 / 1024),
          unit: 'MB',
        },
      });
      return;
    } catch {
      const safeBoot = env.SAFE_BOOT || false;
      const port = Number(process.env.PORT || env.PORT || 3000);
      
      res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
      res.setHeader('X-Health', 'ok');
      res.setHeader('X-Correlation-Id', correlationId);
      res.status(200).json({
        ok: true,
        ready: true,
        safeBoot,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: process.uptime(),
        port,
        correlationId,
        service: 'ivan-reseller-backend',
      });
      return;
    }
  }
  
  // Handle /health endpoint
  if (req.path !== '/health') {
    return next();
  }
  const start = Date.now();
  const correlationId = (req as any).correlationId || `health-${Date.now()}`;
  // ✅ P0: Request logging para /health
  console.log(`[HEALTH] ${req.method} ${req.path} from ${req.ip || req.socket.remoteAddress || 'unknown'} correlationId=${correlationId}`);
  try {
    const mem = process.memoryUsage();
    const safeBoot = env.SAFE_BOOT ?? (process.env.NODE_ENV === 'production');
    const port = Number(process.env.PORT || env.PORT || 3000);
    const responseTime = Date.now() - start;
    
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    res.setHeader('X-Health', 'ok');
    res.status(200).json({
      status: 'healthy',
      safeBoot,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
      port,
      service: 'ivan-reseller-backend',
      version: process.env.npm_package_version || '1.0.0',
      build: {
        gitSha: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown').toString().substring(0, 7),
        buildTime: process.env.BUILD_TIME || process.env.RAILWAY_BUILD_TIME || new Date().toISOString(),
      },
      memory: {
        used: Math.round(mem.heapUsed / 1024 / 1024),
        total: Math.round(mem.heapTotal / 1024 / 1024),
        unit: 'MB',
      },
    });
  } catch {
    const safeBoot = env.SAFE_BOOT ?? (process.env.NODE_ENV === 'production');
    const port = Number(process.env.PORT || env.PORT || 3000);
    
    res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
    res.setHeader('X-Health', 'ok');
    res.setHeader('X-Correlation-Id', correlationId);
    res.status(200).json({
      status: 'healthy',
      ok: true,
      safeBoot,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
      port,
      correlationId,
      service: 'ivan-reseller-backend',
    });
  }
});

// ✅ FIX 502: Middleware para detectar requests desde Vercel y logging detallado
app.use((req: Request, res: Response, next: NextFunction) => {
  const isFromVercel = req.headers['x-vercel-id'] || 
                       req.headers['x-forwarded-for']?.includes('vercel') ||
                       req.headers['host']?.includes('vercel') ||
                       req.headers['referer']?.includes('vercel') ||
                       req.headers['referer']?.includes('ivanreseller.com');
  // ✅ Añadir headers de trazabilidad para confirmar que la petición llega a Railway
  if (req.path.startsWith('/api/')) {
    res.setHeader('X-Railway-Proxy', 'railway-backend');
    res.setHeader('X-Proxy-Target', process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PROXY_TARGET || 'railway');
  }
  
  if (isFromVercel || req.path.startsWith('/api/')) {
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        host: req.headers.host,
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-vercel-id': req.headers['x-vercel-id'],
        'user-agent': req.headers['user-agent'],
        origin: req.headers.origin,
        referer: req.headers.referer,
      },
      ip: req.ip,
      isFromVercel: !!isFromVercel,
    };
    
    console.log(`[VERCEL-PROXY] ${req.method} ${req.path}`, JSON.stringify(logData, null, 2));
  }
  
  next();
});

// ====================================
// CORS ORIGINS CONFIGURATION (LEER PRIMERO)
// ====================================

// ✅ PRODUCTION FIX DEFINITIVO: Parser SUPER ROBUSTO para leer CORS origins
// Maneja casos edge: CORS_ORIGIN= incrustado, comillas, espacios, etc.
function readCorsOrigins(): string[] {
  // Normalizar origin: trim, remover trailing slash
  const normalizeOrigin = (origin: string): string => {
    return origin.trim().replace(/\/+$/, '');
  };

  // Limpiar un token individual: remover prefijos incrustados, comillas, etc.
  const cleanToken = (token: string): string => {
    let cleaned = token.trim();
    
    // Remover comillas simples/dobles alrededor
    cleaned = cleaned.replace(/^["']|["']$/g, '');
    
    // Remover prefijos incrustados SOLO si están al inicio (case-insensitive)
    // Patrón: ^\s*(CORS_ORIGINS?|FRONTEND_URL)\s*=\s*
    const prefixPattern = /^\s*(CORS_ORIGINS?|FRONTEND_URL)\s*=\s*/i;
    if (prefixPattern.test(cleaned)) {
      cleaned = cleaned.replace(prefixPattern, '');
      // Si después del = hay OTRO prefijo, limpiar también (caso anidado)
      if (prefixPattern.test(cleaned)) {
        cleaned = cleaned.replace(prefixPattern, '');
      }
    }
    
    // Remover trailing slash
    cleaned = cleaned.replace(/\/+$/, '');
    
    return cleaned.trim();
  };

  // Parsear un valor (string con múltiples origins separados por coma)
  const parseOrigins = (value: string | undefined): string[] => {
    if (!value || typeof value !== 'string') return [];
    
    return value
      .split(',')
      .map(cleanToken)
      .filter((token) => {
        // Validar que sea una URL válida (http:// o https://)
        return token.length > 0 && 
               (token.startsWith('http://') || token.startsWith('https://')) &&
               !token.includes('CORS_ORIGIN=') && // Rechazar si aún tiene prefijo
               !token.includes('CORS_ORIGINS=');
      })
      .map(normalizeOrigin);
  };

  let origins: string[] = [];

  // Prioridad 1: CORS_ORIGINS (plural) - preferir plural si existe
  if (process.env.CORS_ORIGINS) {
    origins = parseOrigins(process.env.CORS_ORIGINS);
  }

  // Prioridad 2: CORS_ORIGIN (singular) - solo si plural no dio resultados
  if (origins.length === 0 && process.env.CORS_ORIGIN) {
    origins = parseOrigins(process.env.CORS_ORIGIN);
  }

  // Prioridad 3: FRONTEND_URL como fallback
  if (origins.length === 0 && env.FRONTEND_URL) {
    const normalized = normalizeOrigin(env.FRONTEND_URL);
    if (normalized && (normalized.startsWith('http://') || normalized.startsWith('https://'))) {
      origins = [normalized];
      // Agregar versión www y sin www automáticamente
      try {
        const url = new URL(normalized);
        if (url.hostname.startsWith('www.')) {
          origins.push(normalized.replace('www.', ''));
        } else {
          origins.push(normalized.replace(url.hostname, `www.${url.hostname}`));
        }
      } catch {
        // Ignorar si no se puede parsear
      }
    }
  }

  // ✅ CRÍTICO: SIEMPRE agregar fallback de producción (incluso si ya hay origins)
  // Esto garantiza que https://www.ivanreseller.com y https://ivanreseller.com SIEMPRE funcionen
  const productionFallbacks = [
    'https://www.ivanreseller.com',
    'https://ivanreseller.com'
  ];
  
  // Agregar fallbacks si no están ya presentes
  for (const fallback of productionFallbacks) {
    if (!origins.includes(fallback)) {
      origins.push(fallback);
    }
  }

  // Deduplicar (case-insensitive para hostname)
  const uniqueOrigins: string[] = [];
  const seenHostnames = new Set<string>();
  
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      const hostnameKey = url.hostname.toLowerCase();
      if (!seenHostnames.has(hostnameKey)) {
        seenHostnames.add(hostnameKey);
        uniqueOrigins.push(origin);
      }
    } catch {
      // Si no se puede parsear como URL, rechazar (no agregar)
      console.warn(`⚠️  CORS: Origin inválido rechazado: ${origin}`);
    }
  }

  return uniqueOrigins;
}

// ✅ PRODUCTION FIX DEFINITIVO: Leer CORS origins con función robusta
let allowedOrigins: string[] = [];
let allowedHostNoWww: Set<string> = new Set(); // Set para matching eficiente www vs no-www

try {
  allowedOrigins = readCorsOrigins();
  
  // Construir Set de hostnames sin www para matching eficiente
  for (const origin of allowedOrigins) {
    try {
      const url = new URL(origin);
      const hostNoWww = url.hostname.toLowerCase().replace(/^www\./, '');
      allowedHostNoWww.add(hostNoWww);
    } catch {
      // Ignorar origins inválidos
    }
  }
  
  // Log final de origins configuradas (solo en startup)
  console.log(`✅ CORS Origins configuradas (${allowedOrigins.length}):`);
  allowedOrigins.forEach((origin, idx) => {
    console.log(`   ${idx + 1}. ${origin}`);
  });
  console.log(`✅ CORS Hosts permitidos (sin www): ${Array.from(allowedHostNoWww).join(', ')}`);
} catch (error) {
  console.error('❌ ERROR parseando CORS origins:', error);
  // Fallback seguro de producción
  allowedOrigins = [
    'https://www.ivanreseller.com',
    'https://ivanreseller.com'
  ];
  allowedHostNoWww = new Set(['ivanreseller.com']);
}

// ====================================
// CORS HARDENED MIDDLEWARE (PRIMERO - ANTES DE TODO)
// ====================================

// ✅ PRODUCTION FIX DEFINITIVO: Middleware CORS hardened manual
// Se ejecuta ANTES de todo para garantizar headers CORS en TODAS las respuestas
function createCorsHardenedMiddleware(allowedOriginsList: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const method = req.method;
    const path = req.path;
    
    // Normalizar origin
    const normalizeOrigin = (o: string): string => {
      return o.trim().replace(/\/+$/, '').toLowerCase();
    };
    
    const normalizeDomain = (url: string): string => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        return url.toLowerCase();
      }
    };
    
    // Determinar si el origin está permitido
    let isAllowed = false;
    let matchedOrigin: string | null = null;
    let matchedRule = 'none';
    
    if (!origin) {
      // Sin Origin (curl, health checks) - permitir pero no setear CORS headers
      isAllowed = true;
      matchedRule = 'no-origin';
    } else {
      const normalizedOrigin = normalizeOrigin(origin);
      
      // Match exacto (case-insensitive)
      const exactMatch = allowedOriginsList.find(allowed => normalizeOrigin(allowed) === normalizedOrigin);
      if (exactMatch) {
        isAllowed = true;
        matchedOrigin = exactMatch; // Usar el de la lista (preserva case)
        matchedRule = 'exact-match';
      } else {
        // Match por dominio (www vs sin www)
        const originDomain = normalizeDomain(origin);
        const domainMatch = allowedOriginsList.find(allowed => {
          const normalizedAllowed = normalizeDomain(allowed);
          return originDomain === normalizedAllowed;
        });
        
        if (domainMatch) {
          isAllowed = true;
          matchedOrigin = domainMatch;
          matchedRule = 'domain-match';
        }
      }
    }
    
    // Logging (solo una línea por request, evitar spam)
    if (origin && (env.LOG_LEVEL === 'debug' || !isAllowed)) {
      logger.info('CORS', {
        origin,
        allowed: isAllowed,
        matchedRule,
        path,
        method
      });
    }
    
    // Si es OPTIONS (preflight), responder inmediatamente
    if (method === 'OPTIONS') {
      if (isAllowed && matchedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        
        // Métodos permitidos
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        
        // Headers permitidos (usar el request si existe, si no default)
        const requestedHeaders = req.headers['access-control-request-headers'];
        if (requestedHeaders) {
          res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
        } else {
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Correlation-ID');
        }
        
        res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
        
        return res.status(204).end();
      } else {
        // Origin no permitido en preflight
        return res.status(403).json({ error: 'CORS policy: origin not allowed' });
      }
    }
    
    // Para requests normales, establecer headers CORS si el origin está permitido
    if (isAllowed && matchedOrigin && origin) {
      res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
    }
    
    // Cache-Control: no-store para /api/* (evitar 304)
    if (path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  };
}

// ✅ PRODUCTION FIX DEFINITIVO: Aplicar CORS hardened ANTES de todo
app.use(createCorsHardenedMiddleware(allowedOrigins));

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

// ✅ ELIMINADO: Función readCorsOrigins() duplicada (ya definida arriba antes de helmet)
// ✅ ELIMINADO: allowedOrigins duplicado (ya definido arriba)
// ✅ ELIMINADO: normalizeDomain duplicado (ya definido en el middleware hardened)

const dynamicOriginMatchers = [
  /\.aliexpress\.[a-z]+$/i,
];

// ✅ PRODUCTION FIX DEFINITIVO: CORS robusto con manejo correcto de preflight
// CRÍTICO: Con credentials:true, el callback debe devolver el origin EXACTO, no true
const corsOptions: CorsOptions = {
  credentials: true, // ✅ Se usa cookies/httpOnly tokens, mantener true
  origin: (origin, callback) => {
    // Si no viene Origin (curl, health checks, server-to-server), permitir
    // Esto permite health checks y herramientas de monitoreo
    if (!origin) {
      return callback(null, true);
    }

    // Normalizar origin (eliminar trailing slash, lower-case)
    const normalizedOrigin = origin.replace(/\/+$/, '').toLowerCase();

    // Permitir si está en la lista exacta (después de normalizar)
    if (allowedOrigins.includes('*')) {
      // ⚠️ NO usar * con credentials=true, pero si está configurado, permitirlo
      logger.warn('CORS: Using wildcard * with credentials=true (not recommended)');
      return callback(null, true);
    }

    // ✅ CRÍTICO: Si hay match exacto (case-insensitive), devolver el origin de la lista
    const exactMatch = allowedOrigins.find(allowed => allowed.toLowerCase() === normalizedOrigin);
    if (exactMatch) {
      logger.debug('CORS: Origin allowed (exact match)', { origin, matched: exactMatch });
      return callback(null, exactMatch); // ✅ Devolver origin de la lista (preserva case original)
    }

    // ✅ PRODUCTION FIX: Matching por hostname sin www (más eficiente con Set)
    try {
      const url = new URL(origin);
      const hostNoWww = url.hostname.toLowerCase().replace(/^www\./, '');
      const protocol = url.protocol;
      
      // Verificar si el hostname (sin www) está permitido
      if (allowedHostNoWww.has(hostNoWww)) {
        // En producción, exigir HTTPS (excepto localhost en dev)
        if (env.NODE_ENV === 'production' && protocol !== 'https:' && !hostNoWww.includes('localhost')) {
          logger.warn('CORS: Rejecting HTTP in production', { origin, protocol });
          return callback(new Error(`CORS blocked: HTTP not allowed in production`), false);
        }
        
        // Encontrar el origin de la lista que corresponde (puede tener www o no)
        const matchedOrigin = allowedOrigins.find(allowed => {
          try {
            const allowedUrl = new URL(allowed);
            const allowedHostNoWww = allowedUrl.hostname.toLowerCase().replace(/^www\./, '');
            return allowedHostNoWww === hostNoWww;
          } catch {
            return false;
          }
        });
        
        if (matchedOrigin) {
          logger.debug('CORS: Origin allowed (hostname match)', { origin, hostNoWww, matchedOrigin });
          return callback(null, matchedOrigin); // ✅ Devolver origin de la lista
        }
      }

      // Verificar patrones dinámicos (AliExpress, etc.)
      const hostname = url.hostname.toLowerCase();
      if (dynamicOriginMatchers.some((pattern) => pattern.test(hostname))) {
        logger.debug('CORS: Origin allowed (pattern match)', { origin, hostname });
        return callback(null, origin); // ✅ Devolver origin original
      }
    } catch (error) {
      logger.warn('CORS: invalid origin received', { origin, error });
    }

    // Origin no permitido
    logger.warn('CORS REJECT', { 
      receivedOrigin: origin, 
      allowedOrigins: allowedOrigins.slice(0, 5), // Mostrar primeros 5
      allowedHostNoWww: Array.from(allowedHostNoWww).slice(0, 5)
    });
    return callback(new Error(`CORS blocked: ${origin} not in allowlist`), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Correlation-ID'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  preflightContinue: false, // ✅ No continuar al siguiente middleware en preflight
  optionsSuccessStatus: 204, // ✅ Responder 204 para OPTIONS
  exposedHeaders: ['Set-Cookie'], // Exponer Set-Cookie si se usa
};

// ✅ PRODUCTION FIX: Aplicar cors() del paquete como backup (después del middleware hardened)
// El middleware hardened ya estableció los headers, pero cors() puede agregar validaciones adicionales
app.use(cors(corsOptions));

// ✅ PRODUCTION FIX DEFINITIVO: Manejar preflight OPTIONS explícitamente (backup)
// El middleware hardened ya maneja OPTIONS, pero esto es un backup adicional
app.options('/api/*', cors(corsOptions));
app.options('*', cors(corsOptions)); // Fallback para cualquier ruta

// Cookie parser (debe ir antes de las rutas)
app.use(cookieParser());

// ✅ FIX AUTH: Correlation ID middleware PRIMERO (antes de body parser para tener correlationId disponible)
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

// ✅ PRODUCTION FIX DEFINITIVO: Endpoint de debug CORS mejorado
app.get('/api/cors-debug', (req: Request, res: Response) => {
  const receivedOrigin = req.headers.origin || null;
  
  // Determinar matched rule (misma lógica que el callback de CORS)
  let matched = false;
  let matchedRule = 'none';
  let matchedOrigin: string | null = null;
  
  if (!receivedOrigin) {
    matchedRule = 'no-origin';
  } else {
    const normalizedOrigin = receivedOrigin.replace(/\/+$/, '').toLowerCase();
    
    // Match exacto
    const exactMatch = allowedOrigins.find(allowed => allowed.toLowerCase() === normalizedOrigin);
    if (exactMatch) {
      matched = true;
      matchedRule = 'exact-match';
      matchedOrigin = exactMatch;
    } else {
      // Match por hostname sin www
      try {
        const url = new URL(receivedOrigin);
        const hostNoWww = url.hostname.toLowerCase().replace(/^www\./, '');
        
        if (allowedHostNoWww.has(hostNoWww)) {
          matched = true;
          matchedRule = 'hostname-match';
          // Encontrar el origin de la lista
          matchedOrigin = allowedOrigins.find(allowed => {
            try {
              const allowedUrl = new URL(allowed);
              const allowedHostNoWww = allowedUrl.hostname.toLowerCase().replace(/^www\./, '');
              return allowedHostNoWww === hostNoWww;
            } catch {
              return false;
            }
          }) || null;
        }
      } catch {
        matchedRule = 'invalid-origin';
      }
    }
  }
  
  res.status(200).json({
    ok: true,
    receivedOrigin,
    matched,
    matchedRule,
    matchedOrigin,
    allowedOriginsParsed: allowedOrigins,
    allowedHostNoWww: Array.from(allowedHostNoWww),
    envCorsOriginRaw: process.env.CORS_ORIGIN || null,
    envCorsOriginsRaw: process.env.CORS_ORIGINS || null,
    envFrontendUrlRaw: env.FRONTEND_URL || null,
    'access-control-allow-origin': res.getHeader('Access-Control-Allow-Origin') || null,
    'access-control-allow-credentials': res.getHeader('Access-Control-Allow-Credentials') || null,
    timestamp: new Date().toISOString(),
  });
});

// ✅ PRODUCTION FIX DEFINITIVO: Alias /api/health para consistencia (sin romper /health existente)
// Este endpoint se define aquí (después de CORS) para que tenga headers CORS
// ✅ FIX 502: Siempre responde 200 OK, incluso si falta ENCRYPTION_KEY (modo degraded)
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    // ✅ Verificar estado de ENCRYPTION_KEY (puede no estar configurado)
    const isEncryptionKeyValid = (global as any).__isEncryptionKeyValid ?? true;
    
    res.status(200).json({
      status: isEncryptionKeyValid ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ivan-reseller-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      degraded: !isEncryptionKeyValid,
      degradedReason: !isEncryptionKeyValid ? 'ENCRYPTION_KEY or JWT_SECRET not configured' : undefined,
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

// ✅ ELIMINADO: Duplicado de /api/health (ya definido arriba después de CORS en línea 358)

// Liveness /health: handled by health-first middleware above (GET /health returns 200 immediately).

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
app.use(express.json({ 
  limit: '1mb',
  strict: false, // Permitir JSON más flexible (acepta comentarios, trailing commas, etc.)
  type: ['application/json', 'application/*+json'], // Aceptar diferentes content-types
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Safe JSON error handler (captura SyntaxError del body parser)
import { safeJsonErrorHandler } from './middleware/safe-json.middleware';
app.use(safeJsonErrorHandler);

// Compression
app.use(compression());

// ✅ PRODUCTION READY: Request logging estructurado (todos los ambientes)
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
app.use(requestLoggerMiddleware);

// ✅ FIX STABILITY: Overload protection y timeout middlewares ANTES de las rutas API
// Esto previene 502 cuando el sistema está sobrecargado
app.use(overloadProtectionMiddleware());
app.use(timeoutMiddleware());

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
// ✅ AliExpress Affiliate API routes
// ✅ CRÍTICO: Logging para confirmar que el router se monta correctamente
console.log('[APP] Mounting AliExpress routes at /api/aliexpress');
console.log('[APP] Router loaded:', !!aliExpressRoutes);
if (aliExpressRoutes) {
  console.log('[APP] Router type:', typeof aliExpressRoutes);
  console.log('[APP] Router has stack:', !!(aliExpressRoutes as any).stack);
}
app.use('/api/aliexpress', aliExpressRoutes);
console.log('[APP] ✅ AliExpress routes mounted at /api/aliexpress');
console.log('[BOOT] AliExpress routes mounted at /api/aliexpress');
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
app.use('/api/setup-status', setupStatusRoutes);
app.use('/api/config-audit', configAuditRoutes);
app.use('/api/listing-lifetime', listingLifetimeRoutes);
app.use('/api/meeting-room', meetingRoomRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/trends', trendsRoutes); // ✅ FASE 1: Detección de Tendencias
app.use('/api/profitability', profitabilityRoutes); // ✅ FASE 3: Evaluación de Rentabilidad
// ✅ INTERNAL: Endpoint protegido para ejecutar ciclo real de eBay
app.use('/api/internal', internalRoutes);
if (internalRoutes) {
  console.log('[INTERNAL] Routes mounted at /api/internal');
  console.log('[INTERNAL]   - GET  /api/internal/health (no auth)');
  console.log('[INTERNAL]   - POST /api/internal/run-ebay-cycle (requires x-internal-secret)');
  logger.info('[INTERNAL] Internal routes router mounted successfully', {
    path: '/api/internal',
    hasSecret: !!process.env.INTERNAL_RUN_SECRET,
    routesCount: (internalRoutes as any).stack?.length || 0,
  });
} else {
  console.error('[INTERNAL] ❌ Internal routes router is null/undefined');
  logger.error('[INTERNAL] Failed to mount internal routes - router is null/undefined');
}
app.use('/api/diag', diagRoutes); // ✅ FIX STABILITY: Endpoint de diagnóstico /api/diag/ping
app.use('/api/debug', debugRoutes); // ✅ FIX STABILITY: Endpoint de debug /api/debug/auth-status-crash-safe
app.use('/debug', debugRoutes); // Mantener ruta legacy

// ✅ DEBUG: Log routers mounted
console.log('✅ Mounted routers:');
console.log('   - /api/aliexpress (aliExpressRoutes)');
if (aliExpressRoutes) {
  console.log('   ✅ AliExpress router loaded successfully');
} else {
  console.log('   ❌ AliExpress router is null/undefined');
}
console.log('   - /api/internal (internalRoutes)');
if (internalRoutes) {
  console.log('   ✅ Internal routes router loaded successfully');
  const internalRoutesCount = (internalRoutes as any).stack?.length || 0;
  console.log(`   ✅ Internal routes registered: ${internalRoutesCount} route(s)`);
  (internalRoutes as any).stack?.forEach((layer: any) => {
    if (layer.route) {
      const method = layer.route.stack?.[0]?.method?.toUpperCase() || 'UNKNOWN';
      const path = layer.route.path || 'UNKNOWN';
      console.log(`      ${method} /api/internal${path}`);
    }
  });
} else {
  console.log('   ❌ Internal routes router is null/undefined');
}

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
