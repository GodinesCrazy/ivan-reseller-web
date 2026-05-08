/**
 * Discover controller — search, evaluate, import-draft, ai-suggestions
 * Extracted from cj-shopify-usa.routes.ts for maintainability.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { cjShopifyUsaDiscoverService } from '../services/cj-shopify-usa-discover.service';
import { CJ_SHOPIFY_USA_TRACE_STEP } from '../cj-shopify-usa.constants';
import {
  cjShopifyUsaDiscoverSearchSchema,
  cjShopifyUsaDiscoverEvaluateBodySchema,
  cjShopifyUsaDiscoverImportDraftBodySchema,
  cjShopifyUsaDiscoverAiSuggestionsBodySchema,
} from '../schemas/cj-shopify-usa.schemas';
import { recordTrace } from './route-helpers';

const router = Router();

router.get('/discover/search', async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId || 0;
  try {
    const query = cjShopifyUsaDiscoverSearchSchema.parse(req.query);
    const results = await cjShopifyUsaDiscoverService.search(userId, query.keyword, query.page, query.pageSize);
    res.json({ ok: true, results, count: results.length, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_ERROR, 'discover.search.failed', {
      error: msg,
      stack: error instanceof Error ? error.stack : undefined,
      query: req.query,
    } as Prisma.InputJsonValue).catch(() => {});
    next(error);
  }
});

router.post('/discover/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaDiscoverEvaluateBodySchema.parse(req.body);
    const result = await cjShopifyUsaDiscoverService.evaluate(userId, body.cjProductId, body.quantity, body.destPostalCode);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/discover/import-draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaDiscoverImportDraftBodySchema.parse(req.body);
    const result = await cjShopifyUsaDiscoverService.importAndDraft(
      userId,
      body.cjProductId,
      body.variantCjVid,
      body.quantity,
      body.destPostalCode,
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/discover/ai-suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaDiscoverAiSuggestionsBodySchema.parse(req.body || {});
    const result = await cjShopifyUsaDiscoverService.aiSuggestions(userId, {
      count: body.count,
      destPostalCode: body.destPostalCode,
      keywords: body.keywords,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
