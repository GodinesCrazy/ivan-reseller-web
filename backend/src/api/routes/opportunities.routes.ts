import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import opportunityFinder from '../../services/opportunity-finder.service';
import ManualAuthRequiredError from '../../errors/manual-auth-required.error';
import { notificationService } from '../../services/notification.service';
import opportunityPersistence from '../../services/opportunity.service';
import { z } from 'zod';
import { logger } from '../../config/logger';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

// ✅ API-002: Validation schema para query parameters
const opportunitiesQuerySchema = z.object({
  query: z.string().optional().default(''),
  maxItems: z.string().optional().transform(val => val ? parseInt(val, 10) : 10).pipe(z.number().int().min(1).max(50)),
  marketplaces: z.string().optional().default('ebay,amazon,mercadolibre'),
  region: z.string().optional().default('us'),
  environment: z.enum(['sandbox', 'production']).optional(),
});

// GET /api/opportunities
// query params: query, maxItems, marketplaces (csv), region
router.get('/', async (req, res) => {
  let progressTimer: NodeJS.Timeout | null = null;
  let warnTimer: NodeJS.Timeout | null = null;
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // ✅ API-002: Validar query parameters con Zod
    const validatedQuery = opportunitiesQuerySchema.parse(req.query);
    const query = validatedQuery.query.trim();
    const maxItems = validatedQuery.maxItems;
    const region = validatedQuery.region;
    const marketplacesParam = validatedQuery.marketplaces;
    const marketplaces = marketplacesParam.split(',').map(s => s.trim()).filter(Boolean) as Array<'ebay'|'amazon'|'mercadolibre'>;
    const environment = validatedQuery.environment; // Opcional, se obtiene del usuario si no se especifica

    if (!query) {
      return res.json({ success: true, items: [], count: 0, data_source: 'profit_engine_real', timestamp: new Date().toISOString() });
    }

    // Notify start
    notificationService.sendToUser(userId, {
      type: 'JOB_STARTED',
      title: 'Búsqueda de oportunidades iniciada',
      message: `Query: "${query}", mercados: ${marketplaces.join(', ')}`,
      priority: 'NORMAL',
      category: 'JOB',
      data: { query, marketplaces, region, startedAt: new Date().toISOString() }
    } as any);

    const startTs = Date.now();
    const intervalMs = parseInt(process.env.OPPORTUNITY_PROGRESS_INTERVAL_MS || '30000', 10);
    const warnMs = parseInt(process.env.OPPORTUNITY_PROGRESS_WARN_MS || '300000', 10); // 5 min por defecto
    progressTimer = setInterval(() => {
      try {
        const elapsedMs = Date.now() - startTs;
        notificationService.sendToUser(userId, {
          type: 'JOB_PROGRESS',
          title: 'Análisis en progreso',
          message: `Llevamos ${(elapsedMs/1000).toFixed(0)}s analizando "${query}"...`,
          priority: 'LOW',
          category: 'JOB',
          data: { query, marketplaces, region, elapsedMs }
        } as any);
      } catch {}
    }, Math.max(10000, intervalMs));

    // Aviso único a los 5 minutos con recomendación
    warnTimer = setTimeout(() => {
      try {
        const elapsedMs = Date.now() - startTs;
        notificationService.sendToUser(userId, {
          type: 'JOB_PROGRESS',
          title: 'Búsqueda prolongada',
          message: `El análisis lleva ${(elapsedMs/60000).toFixed(1)} min. Considera reducir maxItems a 3-5 o ajustar términos para acelerar resultados.`,
          priority: 'HIGH',
          category: 'JOB',
          data: { query, marketplaces, region, elapsedMs, suggestion: 'reduce_max_items' },
          actions: [
            { id: 'open_opportunities', label: 'Abrir Oportunidades', url: '/opportunities', variant: 'primary' }
          ]
        } as any);
      } catch {}
    }, Math.max(60000, warnMs));
    // Find real opportunities via profit engine (searchOpportunities)
    let opportunities: any[] = [];
    try {
      // ✅ skipTrendsValidation: true para evitar filtrar productos por tendencias
      // ✅ relaxedMargin: true para búsqueda web - usa 5% mínimo cuando el 10% devolvería 0 resultados
      opportunities = await opportunityFinder.searchOpportunities(query, userId, {
        maxItems,
        marketplaces,
        region,
        environment,
        skipTrendsValidation: true,
        relaxedMargin: true
      });
    } catch (error: any) {
      // ✅ Si es error de CAPTCHA manual, retornar respuesta especial para que el frontend maneje
      if (error instanceof ManualAuthRequiredError) {
        logger.info('[OPPORTUNITIES-API] CAPTCHA manual requerido - retornando información al frontend', {
          userId,
          query,
          token: error.token,
          provider: error.provider
        });
        
        // ✅ CORREGIDO: Construir URL completa usando el origin del request o FRONTEND_URL
        const frontendBaseUrl = process.env.FRONTEND_URL || 
          (req.headers.origin || 'https://www.ivanreseller.com');
        const resolveCaptchaUrl = `${frontendBaseUrl}/resolve-captcha/${error.token}`;
        
        logger.info('[OPPORTUNITIES-API] Retornando respuesta CAPTCHA con URL completa', {
          userId,
          token: error.token,
          resolveCaptchaUrl,
          frontendBaseUrl
        });
        
        return res.status(202).json({
          success: false,
          requiresManualAuth: true,
          captchaRequired: true,
          provider: error.provider,
          token: error.token,
          captchaUrl: error.loginUrl,
          resolveCaptchaUrl: resolveCaptchaUrl, // URL completa
          message: 'AliExpress requiere que resuelvas un CAPTCHA para continuar. Se abrirá automáticamente la página de resolución.',
          expiresAt: error.expiresAt
        });
      }
      
      // ✅ FIX: Manejar errores de credenciales faltantes con 400/422, no 500
      const errorMessage = error?.message || String(error);
      const isCredentialsError = 
        errorMessage.includes('credentials') ||
        errorMessage.includes('CREDENTIALS_ERROR') ||
        errorMessage.includes('AUTH_REQUIRED') ||
        error?.errorCode === 'CREDENTIALS_ERROR' ||
        error?.details?.authRequired === true;
      
      if (isCredentialsError) {
        logger.warn('[OPPORTUNITIES-API] Missing credentials error', {
          userId,
          query,
          error: errorMessage,
          errorCode: error?.errorCode
        });
        
        return res.status(422).json({
          success: false,
          error: 'missing_credentials',
          message: 'Se requieren credenciales de API para buscar oportunidades. Por favor, configura al menos una API de búsqueda (AliExpress Affiliate, ScraperAPI, o ZenRows) en Settings → API Settings.',
          missingCredentials: true,
          query,
          suggestions: [
            'Configura AliExpress Affiliate API en Settings → API Settings',
            'O configura ScraperAPI o ZenRows como alternativa',
            'Revisa que las credenciales estén activas y correctamente configuradas'
          ]
        });
      }
      
      // Si es otro error, lanzarlo normalmente (será manejado por el catch general)
      throw error;
    }

    const durationMs = Date.now() - startTs;

    // Debug info para cuando no se encuentran productos
    const debugInfo: any = {};
    if (opportunities.length === 0) {
      debugInfo.message = 'No se encontraron productos en AliExpress. Posibles causas:';
      debugInfo.possibleCauses = [
        'El scraping puede estar fallando (Puppeteer no inició correctamente en Railway)',
        'AliExpress puede estar bloqueando el scraping (CAPTCHA o rate limiting)',
        'El término de búsqueda puede no tener resultados disponibles',
        'El bridge Python puede no estar disponible o configurado',
        '⚠️ NOTA: Las cookies NO son requeridas - el sistema funciona en modo público'
      ];
      debugInfo.suggestions = [
        'El sistema funciona en modo público sin cookies. Si ves CAPTCHA, entonces sí necesitarás cookies',
        'Intenta con un término de búsqueda más específico',
        'Espera unos minutos y vuelve a intentar (puede ser rate limiting)',
        'Revisa los logs del servidor para más detalles'
      ];
      logger.warn('No se encontraron oportunidades para query', { query, debugInfo, userId, environment });
    }

    // Notify completion
    notificationService.sendToUser(userId, {
      type: 'JOB_COMPLETED',
      title: 'Búsqueda de oportunidades completada',
      message: `Resultados: ${opportunities.length} en ${(durationMs/1000).toFixed(1)}s`,
      priority: opportunities.length > 0 ? 'NORMAL' : 'HIGH',
      category: 'JOB',
      data: { query, count: opportunities.length, durationMs, marketplaces, region, debugInfo: opportunities.length === 0 ? debugInfo : undefined },
      actions: [
        { id: 'view_opportunities', label: 'Ver Oportunidades', url: '/opportunities', variant: 'primary' }
      ]
    } as any);

    if (progressTimer) clearInterval(progressTimer);
    if (warnTimer) clearTimeout(warnTimer);

    console.log('[OPPORTUNITIES API] Found opportunities:', opportunities?.length ?? 0);

    return res.json({
      success: true,
      items: opportunities ?? [],
      count: opportunities?.length ?? 0,
      data_source: 'profit_engine_real',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // ✅ FIX: Single declaration of correlationId at the top of catch block
    const correlationId = (req as any).correlationId || 'unknown';
    
    if (progressTimer) clearInterval(progressTimer);
    if (warnTimer) clearTimeout(warnTimer);

    if (error instanceof ManualAuthRequiredError) {
      const userId = req.user?.userId;
      const manualPath = `/manual-login/${error.token}`;
      if (userId) {
        try {
          notificationService.sendToUser(userId, {
            type: 'USER_ACTION',
            title: 'Se requiere iniciar sesión en AliExpress',
            message: 'Abre la ventana de autenticación para completar el inicio de sesión y vuelve a intentar la búsqueda.',
            priority: 'HIGH',
            category: 'AUTH',
            actions: [
              { id: 'manual_login', label: 'Iniciar sesión ahora', url: manualPath, variant: 'primary' },
            ],
            data: {
              provider: error.provider,
              token: error.token,
              expiresAt: error.expiresAt,
            },
          } as any);
        } catch {}
      }
      return res.status(428).json({
        success: false,
        error: 'manual_login_required',
        provider: error.provider,
        token: error.token,
        loginUrl: error.loginUrl,
        manualUrl: manualPath,
        expiresAt: error.expiresAt,
      });
    }

    // ✅ FIX: Determinar código de estado apropiado según el tipo de error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isClientError = 
      errorMessage.includes('credentials') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('validation');
    
    const statusCode = isClientError ? 400 : 500;
    
    logger.error('Error in /api/opportunities', { 
      correlationId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.userId,
      statusCode,
      isClientError
    });
    
    try {
      const userId = req.user?.userId;
      if (userId) {
        // clear any possible interval leak — not strictly available here
        // (timers asociados al request se limpian al finalizar el proceso)
        notificationService.sendToUser(userId, {
          type: 'JOB_FAILED',
          title: 'Error en búsqueda de oportunidades',
          message: errorMessage,
          priority: 'HIGH',
          category: 'JOB'
        } as any).catch(() => {}); // Ignorar errores de notificación
      }
    } catch {}
    
    // ✅ FIX: Retornar error controlado, nunca 500 genérico (reuse correlationId from above)
    return res.status(statusCode).json({ 
      success: false, 
      error: isClientError ? 'invalid_request' : 'internal_error',
      message: isClientError 
        ? errorMessage 
        : 'Error procesando oportunidades. Por favor, intenta de nuevo más tarde.',
      query: req.query.query || '',
      correlationId // ✅ FIX: Include correlationId for client tracking
    });
  }
});

export default router;

// Additional endpoints: list and detail
router.get('/list', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const data = await opportunityPersistence.listUserOpportunities(userId, page, Math.min(limit, 50));
    return res.json({ success: true, ...data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to list opportunities' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    const id = parseInt(String(req.params.id), 10);
    const data = await opportunityPersistence.getOpportunity(userId, id);
    if (!data) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, ...data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to get opportunity' });
  }
});
