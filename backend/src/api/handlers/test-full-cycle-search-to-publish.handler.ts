/**
 * Handler: POST /api/internal/test-full-cycle-search-to-publish
 * Ejecuta el ciclo completo tendencias → búsqueda → producto → aprobación → publicación eBay/ML.
 * Delega en opportunity-full-cycle-ebay.service (misma lógica que el endpoint autenticado).
 */
import { Request, Response } from 'express';
import { runOpportunityFullCycleToEbay } from '../../services/opportunity-full-cycle-ebay.service';
import { logger } from '../../config/logger';

export async function runTestFullCycleSearchToPublish(req: Request, res: Response): Promise<void> {
  const requestedUserId = Number(req.body?.userId);
  const hasBodyUser = Number.isFinite(requestedUserId) && requestedUserId > 0;

  try {
    const result = await runOpportunityFullCycleToEbay({
      userId: hasBodyUser ? requestedUserId : undefined,
      internalRunner: !hasBodyUser,
      keyword: (req.body?.keyword as string) || process.env.keyword,
      dryRun: req.body?.dryRun === true || process.env.DRY_RUN === '1',
      maxPriceUsd: Number(req.body?.maxPriceUsd),
      marketplace:
        String(req.body?.marketplace || 'ebay').toLowerCase() === 'mercadolibre' ? 'mercadolibre' : 'ebay',
      credentialEnvironment: req.body?.credentialEnvironment,
      allowFallbackProduct: true,
      region: 'us',
      maxItems: 5,
    });
    res.status(result.httpStatus).json(result.body);
  } catch (e: any) {
    logger.error('[INTERNAL] test-full-cycle-search-to-publish failed', { error: e?.message });
    res.status(500).json({
      success: false,
      error: e?.message || String(e),
    });
  }
}
