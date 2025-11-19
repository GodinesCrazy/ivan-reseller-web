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
      return res.json({ success: true, items: [], count: 0, query, targetMarketplaces: marketplaces, data_source: 'real_analysis' });
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
    // Find real opportunities (may return empty until marketplace analyzers are fully wired)
    const items = await opportunityFinder.findOpportunities(userId, { query, maxItems, marketplaces, region, environment });

    const durationMs = Date.now() - startTs;

    // Debug info para cuando no se encuentran productos
    const debugInfo: any = {};
    if (items.length === 0) {
      debugInfo.message = 'No se encontraron productos en AliExpress. Posibles causas:';
      debugInfo.possibleCauses = [
        'La sesión de AliExpress puede haber expirado (revisa API Settings)',
        'AliExpress puede estar bloqueando el scraping (CAPTCHA o rate limiting)',
        'El término de búsqueda puede no tener resultados disponibles',
        'El bridge Python puede no estar disponible o configurado'
      ];
      debugInfo.suggestions = [
        'Verifica que AliExpress tenga sesión activa en API Settings',
        'Intenta con un término de búsqueda más específico',
        'Espera unos minutos y vuelve a intentar (puede ser rate limiting)'
      ];
      logger.warn('No se encontraron oportunidades para query', { query, debugInfo });
    }

    // Notify completion
    notificationService.sendToUser(userId, {
      type: 'JOB_COMPLETED',
      title: 'Búsqueda de oportunidades completada',
      message: `Resultados: ${items.length} en ${(durationMs/1000).toFixed(1)}s`,
      priority: items.length > 0 ? 'NORMAL' : 'HIGH',
      category: 'JOB',
      data: { query, count: items.length, durationMs, marketplaces, region, debugInfo: items.length === 0 ? debugInfo : undefined },
      actions: [
        { id: 'view_opportunities', label: 'Ver Oportunidades', url: '/opportunities', variant: 'primary' }
      ]
    } as any);

    if (progressTimer) clearInterval(progressTimer);
    if (warnTimer) clearTimeout(warnTimer);

    return res.json({
      success: true,
      items,
      count: items.length,
      query,
      targetMarketplaces: marketplaces,
      timestamp: new Date().toISOString(),
      data_source: 'real_analysis',
      ...(items.length === 0 && Object.keys(debugInfo).length > 0 ? { debug: debugInfo } : {})
    });
  } catch (error) {
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

    logger.error('Error in /api/opportunities', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.userId
    });
    try {
      const userId = req.user?.userId;
      if (userId) {
        // clear any possible interval leak — not strictly available here
        // (timers asociados al request se limpian al finalizar el proceso)
        notificationService.sendToUser(userId, {
          type: 'JOB_FAILED',
          title: 'Error en búsqueda de oportunidades',
          message: error instanceof Error ? error.message : 'Error desconocido',
          priority: 'HIGH',
          category: 'JOB'
        } as any);
      }
    } catch {}
    return res.status(500).json({ success: false, error: 'Error processing opportunities' });
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
