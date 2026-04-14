import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import opportunityFinder from '../../services/opportunity-finder.service';
import ManualAuthRequiredError from '../../errors/manual-auth-required.error';
import { notificationService } from '../../services/notification.service';
import opportunityPersistence from '../../services/opportunity.service';
import { cacheService } from '../../services/cache.service';
import { getDefaultRegionForUser } from '../../services/regional-config.service';
import competitorAnalyzer from '../../services/competitor-analyzer.service';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { OPPORTUNITY_MAX_PAGE } from '../../utils/opportunity-search-pagination';
import { runOpportunityFullCycleToEbay } from '../../services/opportunity-full-cycle-ebay.service';

const router = Router();
const OPPORTUNITIES_CACHE_TTL = Number(process.env.OPPORTUNITIES_CACHE_TTL_SECONDS) || 120;

// Require authentication for all endpoints
router.use(authenticate);

function queryParamScalar(v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseOpportunitiesInt(v: unknown, fallback: number, min: number, max: number): number {
  const raw = queryParamScalar(v);
  if (raw === undefined || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ✅ API-002: Query parameters (coerce string | string[] | number — some gateways vary)
const opportunitiesQuerySchema = z
  .object({
    query: z.preprocess((v) => {
      const x = queryParamScalar(v);
      return x === undefined || x === null ? '' : String(x).trim();
    }, z.string()),
    maxItems: z.preprocess(
      (v) => parseOpportunitiesInt(v, 20, 1, 20),
      z.number().int().min(1).max(20)
    ),
    page: z.preprocess(
      (v) => parseOpportunitiesInt(v, 1, 1, OPPORTUNITY_MAX_PAGE),
      z.number().int().min(1).max(OPPORTUNITY_MAX_PAGE)
    ),
    /** Skip Redis read when `1` / `true` / `yes` (fresh provider fetch for same query/page). */
    refresh: z.preprocess((v) => queryParamScalar(v), z.string().optional()),
    marketplaces: z.preprocess((v) => queryParamScalar(v), z.string().optional()).default('ebay,amazon,mercadolibre'),
    region: z.preprocess((v) => queryParamScalar(v), z.string().optional()).default('us'),
    environment: z.enum(['sandbox', 'production']).optional(),
  })
  .passthrough();

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
    const page = validatedQuery.page;
    const skipCache = ['1', 'true', 'yes'].includes(String(validatedQuery.refresh || '').toLowerCase());
    let region = validatedQuery.region;
    // Use RegionalConfig as default when region is default ('us')
    if (region === 'us') {
      const defaultRegion = await getDefaultRegionForUser(userId);
      if (defaultRegion) region = defaultRegion;
    }
    const marketplacesParam = validatedQuery.marketplaces;
    const marketplaces = marketplacesParam.split(',').map(s => s.trim()).filter(Boolean) as Array<'ebay'|'amazon'|'mercadolibre'>;
    const environment = validatedQuery.environment; // Opcional, se obtiene del usuario si no se especifica

    if (!query) {
      return res.json({ success: true, items: [], count: 0, data_source: 'profit_engine_real', timestamp: new Date().toISOString() });
    }

    const marketplacesKey = [...marketplaces].sort().join(',');
    const envKey = environment ?? 'production';
    const cacheKey = `opportunities:${userId}:${query.toLowerCase().trim()}:p${page}:sz${maxItems}:${marketplacesKey}:${region}:${envKey}`;
    const cached =
      skipCache ? null : await cacheService.get<{ items: any[]; count: number; timestamp: string }>(cacheKey);
    res.setHeader('Cache-Control', 'private, no-store');
    if (cached != null) {
      const returned = (cached.items ?? []).length;
      return res.json({
        success: true,
        items: cached.items ?? [],
        count: cached.count ?? returned,
        pagination: {
          page,
          pageSize: maxItems,
          returned,
          mayHaveMore: returned >= maxItems && maxItems > 0,
        },
        data_source: 'profit_engine_real',
        timestamp: cached.timestamp ?? new Date().toISOString(),
        _cached: true,
      });
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
        pageNo: page,
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
      const stats = (opportunities as any)._searchStats;
      const productsFound = stats?.productsFound ?? 0;
      const skippedMargin = stats?.skippedLowMargin ?? 0;

      if (productsFound === 0) {
        debugInfo.cause = 'no_products_from_aliexpress';
        debugInfo.message = 'AliExpress Affiliate API no devolvió productos para esta búsqueda.';
        debugInfo.suggestions = [
          'Prueba el término en inglés (ej: "ipad stand" en lugar de "soporte ipad")',
          'Prueba con un término más genérico (ej: "tablet holder")',
          'Verifica que las credenciales de AliExpress Affiliate API estén configuradas en API Settings',
        ];
      } else if (skippedMargin > 0) {
        debugInfo.cause = 'margin_filter';
        debugInfo.message = `AliExpress encontró ${productsFound} productos pero todos fueron descartados por margen insuficiente para ${region.toUpperCase()}.`;
        debugInfo.suggestions = [
          'Chile/LatAm tienen IVA 19% + arancel 6% que reducen el margen neto significativamente',
          'Prueba con productos de menor precio en AliExpress (mayor margen relativo)',
          'Considera buscar en región US donde los impuestos son menores',
        ];
      } else {
        debugInfo.cause = 'unknown';
        debugInfo.message = 'La búsqueda no encontró oportunidades con los criterios actuales.';
        debugInfo.suggestions = [
          'Prueba otro término de búsqueda',
          'Cambia la región o los marketplaces seleccionados',
        ];
      }
      logger.warn('No se encontraron oportunidades para query', { query, debugInfo, userId, environment, productsFound, skippedMargin });
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

    const timestamp = new Date().toISOString();
    await cacheService.set(
      cacheKey,
      { items: opportunities ?? [], count: (opportunities ?? []).length, timestamp },
      { ttl: OPPORTUNITIES_CACHE_TTL }
    ).catch(() => {});

    console.log('[OPPORTUNITIES API] Found opportunities:', opportunities?.length ?? 0);

    const returned = opportunities?.length ?? 0;
    return res.json({
      success: true,
      items: opportunities ?? [],
      count: returned,
      pagination: {
        page,
        pageSize: maxItems,
        returned,
        mayHaveMore: returned >= maxItems && maxItems > 0,
      },
      data_source: 'profit_engine_real',
      timestamp
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

// --- Phase 2: Product Research API (lightweight search, no job notifications) ---
const researchQuerySchema = z.object({
  query: z.preprocess((v) => String(queryParamScalar(v) ?? '').trim(), z.string().min(1, 'Query is required')),
  maxItems: z.preprocess((v) => parseOpportunitiesInt(v, 10, 1, 20), z.number().int().min(1).max(20)),
  page: z.preprocess(
    (v) => parseOpportunitiesInt(v, 1, 1, OPPORTUNITY_MAX_PAGE),
    z.number().int().min(1).max(OPPORTUNITY_MAX_PAGE)
  ),
  marketplaces: z.preprocess((v) => queryParamScalar(v), z.string().optional()).default('ebay,amazon,mercadolibre'),
  region: z.preprocess((v) => queryParamScalar(v), z.string().optional()).default('us'),
  environment: z.enum(['sandbox', 'production']).optional(),
});

router.get('/research', async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = researchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid parameters', details: parsed.error.flatten() });
    }
    const { query, maxItems, page: researchPage, marketplaces: marketplacesCsv, region: regionParam, environment } =
      parsed.data;
    let region = regionParam;
    if (region === 'us') {
      const defaultRegion = await getDefaultRegionForUser(userId);
      if (defaultRegion) region = defaultRegion;
    }
    const marketplaces = marketplacesCsv.split(',').map((s) => s.trim()).filter(Boolean) as Array<'ebay' | 'amazon' | 'mercadolibre'>;

    const opportunities = await opportunityFinder.searchOpportunities(query, userId, {
      maxItems,
      pageNo: researchPage,
      marketplaces,
      region,
      environment,
      skipTrendsValidation: true,
      relaxedMargin: true,
    });

    const returned = (opportunities ?? []).length;
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      success: true,
      items: opportunities ?? [],
      count: returned,
      pagination: {
        page: researchPage,
        pageSize: maxItems,
        returned,
        mayHaveMore: returned >= maxItems && maxItems > 0,
      },
      data_source: 'research',
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    if (e instanceof ManualAuthRequiredError) {
      const frontendBaseUrl = process.env.FRONTEND_URL || (req.headers?.origin || 'https://www.ivanreseller.com');
      return res.status(202).json({
        success: false,
        requiresManualAuth: true,
        captchaRequired: true,
        provider: e.provider,
        token: e.token,
        resolveCaptchaUrl: `${frontendBaseUrl}/resolve-captcha/${e.token}`,
        message: 'AliExpress requiere que resuelvas un CAPTCHA para continuar.',
        expiresAt: e.expiresAt,
      });
    }
    const msg = e?.message || String(e);
    const isCredentials = msg.includes('credentials') || msg.includes('CREDENTIALS_ERROR') || msg.includes('AUTH_REQUIRED');
    return res.status(isCredentials ? 422 : 500).json({
      success: false,
      error: isCredentials ? 'missing_credentials' : 'internal_error',
      message: msg,
    });
  }
});

// POST /api/opportunities/add-from-research — save one research item as opportunity (runs competitor analysis then save)
const addFromResearchSchema = z.object({
  title: z.string().min(1),
  sourceMarketplace: z.string().default('aliexpress'),
  costUsd: z.number(),
  shippingCost: z.number().optional(),
  importTax: z.number().optional(),
  totalCost: z.number().optional(),
  targetCountry: z.string().optional(),
  suggestedPriceUsd: z.number(),
  profitMargin: z.number(),
  roiPercentage: z.number(),
  competitionLevel: z.string(),
  marketDemand: z.string(),
  confidenceScore: z.number(),
  feesConsidered: z.record(z.number()).optional(),
  targetMarketplaces: z.array(z.string()).default(['ebay']),
});

router.post('/add-from-research', async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = addFromResearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
    }
    const data = parsed.data;
    let region = 'us';
    try {
      const defaultRegion = await getDefaultRegionForUser(userId);
      if (defaultRegion) region = defaultRegion;
    } catch {
      /* ignore */
    }

    const analyses = await competitorAnalyzer.analyzeCompetition(
      userId,
      data.title,
      data.targetMarketplaces as Array<'ebay' | 'amazon' | 'mercadolibre'>,
      region
    );

    const opp = await opportunityPersistence.saveOpportunity(userId, {
      title: data.title,
      sourceMarketplace: data.sourceMarketplace,
      costUsd: data.costUsd,
      shippingCost: data.shippingCost,
      importTax: data.importTax,
      totalCost: data.totalCost,
      targetCountry: data.targetCountry,
      suggestedPriceUsd: data.suggestedPriceUsd,
      profitMargin: data.profitMargin,
      roiPercentage: data.roiPercentage,
      competitionLevel: data.competitionLevel,
      marketDemand: data.marketDemand,
      confidenceScore: data.confidenceScore,
      feesConsidered: data.feesConsidered ?? {},
      targetMarketplaces: data.targetMarketplaces,
    }, analyses);

    return res.json({ success: true, opportunityId: opp.id, message: 'Opportunity saved.' });
  } catch (e: any) {
    logger.error('[opportunities/add-from-research]', { error: e?.message, userId: (req as any).user?.userId });
    return res.status(500).json({
      success: false,
      error: 'internal_error',
      message: e?.message || 'Failed to save opportunity.',
    });
  }
});

/** Ciclo autenticado: búsqueda → producto → aprobación → publicación eBay (o ML si se pide). Refleja la misma lógica que /api/internal/test-full-cycle-search-to-publish sin producto placeholder. */
const fullCycleEbayBodySchema = z.object({
  keyword: z.string().min(1).max(200).optional(),
  dryRun: z.boolean().optional(),
  maxPriceUsd: z.number().positive().max(5000).optional(),
  marketplace: z.enum(['ebay', 'mercadolibre']).optional(),
  credentialEnvironment: z.enum(['sandbox', 'production']).optional(),
  region: z.string().min(2).max(16).optional(),
  maxItems: z.number().int().min(1).max(20).optional(),
});

router.post('/full-cycle-ebay', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const parsed = fullCycleEbayBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    let region = b.region?.toLowerCase() || 'us';
    if (!b.region) {
      try {
        const dr = await getDefaultRegionForUser(userId);
        if (dr) region = dr;
      } catch {
        /* keep us */
      }
    }
    const result = await runOpportunityFullCycleToEbay({
      userId,
      internalRunner: false,
      keyword: b.keyword,
      dryRun: b.dryRun === true,
      maxPriceUsd: b.maxPriceUsd,
      marketplace: b.marketplace,
      credentialEnvironment: b.credentialEnvironment,
      allowFallbackProduct: false,
      region,
      maxItems: b.maxItems,
    });
    return res.status(result.httpStatus).json(result.body);
  } catch (e: any) {
    logger.error('[opportunities/full-cycle-ebay]', { error: e?.message, userId: req.user?.userId });
    return res.status(500).json({ success: false, error: e?.message || 'full_cycle_failed' });
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

const MAX_SAFE_OPPORTUNITY_ID = 2147483647; // PostgreSQL INT max

router.get('/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    const numId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(numId) || numId < 1 || numId > MAX_SAFE_OPPORTUNITY_ID) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const data = await opportunityPersistence.getOpportunity(userId, numId);
    if (!data) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, ...data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to get opportunity' });
  }
});
