import { Router, Request, Response, NextFunction } from 'express';
import { MarketplaceService, MarketplaceName } from '../../services/marketplace.service';
import { MarketplacePublishService } from '../../modules/marketplace/marketplace-publish.service';
import { PublishMode } from '../../modules/marketplace/marketplace.types';
import { EbayService } from '../../services/ebay.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import crypto from 'crypto';
import { authenticate } from '../../middleware/auth.middleware';
import { z } from 'zod';
import { marketplaceRateLimit, ebayRateLimit, mercadolibreRateLimit, amazonRateLimit } from '../../middleware/rate-limit.middleware';
import { logger } from '../../config/logger';
import { AppError, ErrorCode } from '../../middleware/error.middleware';
import { getAliExpressDropshippingRedirectUri } from '../../utils/aliexpress-dropshipping-oauth';
import { getOAuthStateSecret } from '../../utils/oauth-state-secret';
import { getMercadoLibreRedirectUri } from '../../utils/oauth-redirect-uris';

const router = Router();
const marketplaceService = new MarketplaceService();
const marketplacePublishService = new MarketplacePublishService();

// Apply auth middleware to all routes
router.use(authenticate);

// ✅ Aplicar rate limiting general
router.use(marketplaceRateLimit);

// Validation schemas
const publishProductSchema = z.object({
  productId: z.number(),
  marketplace: z.enum(['ebay', 'mercadolibre', 'amazon']),
  environment: z.enum(['sandbox', 'production']).optional(),
  duplicateListing: z.boolean().optional(),
  publishMode: z.enum(['local', 'international']).optional(),
  publishIntent: z.enum(['dry_run', 'pilot', 'production']).optional(),
  pilotManualAck: z.boolean().optional(),
  customData: z.object({
    publishMode: z.enum(['local', 'international']).optional(),
    publishIntent: z.enum(['dry_run', 'pilot', 'production']).optional(),
    pilotManualAck: z.boolean().optional(),
    categoryId: z.string().optional(),
    price: z.number().optional(),
    quantity: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
});

const publishBatchSchema = z.object({
  marketplace: z.enum(['ebay', 'mercadolibre', 'amazon']),
  limit: z.number().min(1).max(25).optional(),
  mode: z.nativeEnum(PublishMode).optional(),
});

const multipleMarketplacesSchema = z.object({
  productId: z.number(),
  marketplaces: z.array(z.enum(['ebay', 'mercadolibre', 'amazon'])),
  environment: z.enum(['sandbox', 'production']).optional(),
});

const credentialsSchema = z.object({
  marketplace: z.enum(['ebay', 'mercadolibre', 'amazon']),
  credentials: z.object({
    // eBay credentials
    appId: z.string().optional(),
    devId: z.string().optional(),
    certId: z.string().optional(),
    token: z.string().optional(),
    refreshToken: z.string().optional(),
    sandbox: z.boolean().optional(),
    
    // MercadoLibre credentials
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    accessToken: z.string().optional(),
    userId: z.string().optional(),
    siteId: z.string().optional(),
  }),
});

const syncInventorySchema = z.object({
  productId: z.number(),
  quantity: z.number().min(0),
});

const pilotApprovalCreateSchema = z.object({
  productId: z.number().int().positive(),
  requestedMode: z.enum(['local', 'international']).default('international'),
  approvedBy: z.string().min(1).max(120),
  reason: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
  evidenceSnapshot: z.record(z.any()).optional(),
});

const pilotAllowlistUpsertSchema = z.object({
  enabled: z.boolean(),
  notes: z.string().max(1000).optional(),
  createdBy: z.string().max(120).optional(),
  siteId: z.string().max(12).optional(),
});

const pilotControlStateSchema = z.object({
  state: z.enum(['ready', 'aborted', 'rollback_requested', 'rollback_completed']),
  reason: z.string().max(1000).optional(),
  createdBy: z.string().max(120).optional(),
  evidenceSnapshot: z.record(z.any()).optional(),
});

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

/**
 * GET /api/marketplace/validate/:marketplace
 * ✅ P0.4: Validar credenciales de un marketplace antes de publicar
 */
router.get('/validate/:marketplace', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const marketplace = req.params.marketplace as MarketplaceName;
    const environment = req.query.environment as 'sandbox' | 'production' | undefined;
    const userId = req.user!.userId;
    
    // Obtener ambiente del usuario si no se proporciona
    let userEnvironment: 'sandbox' | 'production' = 'production';
    if (!environment) {
      const { workflowConfigService } = await import('../../services/workflow-config.service');
      userEnvironment = await workflowConfigService.getUserEnvironment(userId);
    } else {
      userEnvironment = environment;
    }
    
    // Validar que el marketplace es válido
    if (!['ebay', 'amazon', 'mercadolibre'].includes(marketplace)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid marketplace',
        message: `Marketplace must be one of: ebay, amazon, mercadolibre`
      });
    }
    
    // Verificar credenciales
    const credentials = await marketplaceService.getCredentials(
      userId,
      marketplace as MarketplaceName,
      userEnvironment
    );
    
    if (!credentials || !credentials.isActive) {
      return res.status(200).json({
        success: false,
        hasCredentials: false,
        message: `Please configure your ${marketplace} credentials before publishing.`,
        action: 'configure_credentials',
        settingsUrl: '/settings?tab=api-credentials'
      });
    }
    
    // Probar conexión
    const testResult = await marketplaceService.testConnection(
      userId,
      marketplace as MarketplaceName,
      userEnvironment
    );
    
    if (!testResult.success) {
      return res.status(200).json({
        success: false,
        hasCredentials: true,
        isValid: false,
        message: testResult.message || `Your ${marketplace} credentials are invalid or expired.`,
        action: 'update_credentials',
        settingsUrl: '/settings?tab=api-credentials'
      });
    }
    
    return res.json({
      success: true,
      hasCredentials: true,
      isValid: true,
      message: `${marketplace} credentials are valid and ready to use.`
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/marketplace/mercadolibre/program-verification
 * Canonical external/declarative program verification snapshot for MLC channel readiness.
 */
router.get('/mercadolibre/program-verification', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const environment = req.query.environment as 'sandbox' | 'production' | undefined;
    const requestedMode =
      String(req.query.requestedMode || req.query.mode || '').toLowerCase() === 'international'
        ? 'international'
        : 'local';
    const { buildMercadoLibreProgramVerification } = await import(
      '../../services/mercadolibre-publish-preflight.service'
    );
    const data = await buildMercadoLibreProgramVerification({
      userId: req.user!.userId,
      environment,
      requestedMode,
    });
    return res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/mercadolibre/pilot-approvals
 * Creates persistent auditable pilot approval for a product.
 */
router.post('/mercadolibre/pilot-approvals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = pilotApprovalCreateSchema.parse(req.body || {});
    const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
    const approval = await mlPilotOpsService.createPilotLaunchApproval({
      userId: req.user!.userId,
      productId: input.productId,
      marketplace: 'mercadolibre',
      requestedMode: input.requestedMode,
      approvedBy: input.approvedBy,
      reason: input.reason,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      evidenceSnapshot: input.evidenceSnapshot,
    });
    return res.status(201).json({ success: true, data: approval });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/mercadolibre/pilot-approvals
 * Lists pilot approvals for the authenticated user.
 */
router.get('/mercadolibre/pilot-approvals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productIdRaw = req.query.productId;
    const decisionRaw = req.query.decision;
    const limitRaw = Number(req.query.limit);
    const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
    const approvals = await mlPilotOpsService.listPilotApprovals({
      userId: req.user!.userId,
      marketplace: 'mercadolibre',
      productId:
        productIdRaw != null && Number.isFinite(Number(productIdRaw))
          ? Number(productIdRaw)
          : undefined,
      decision:
        typeof decisionRaw === 'string' &&
        ['approved', 'rejected', 'expired', 'consumed'].includes(decisionRaw)
          ? (decisionRaw as any)
          : undefined,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    return res.json({ success: true, count: approvals.length, data: approvals });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/mercadolibre/pilot-approvals/:approvalId
 * Retrieves a single pilot approval.
 */
router.get(
  '/mercadolibre/pilot-approvals/:approvalId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
      const approval = await mlPilotOpsService.getPilotApprovalById(
        req.user!.userId,
        String(req.params.approvalId || '')
      );
      return res.json({ success: true, data: approval });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/marketplace/mercadolibre/pilot-category-allowlist
 * Lists category allowlist entries for MLC pilot.
 */
router.get(
  '/mercadolibre/pilot-category-allowlist',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const siteId = String(req.query.siteId || 'MLC').toUpperCase();
      const enabled = parseBooleanQuery(req.query.enabled);
      const limit = Number(req.query.limit);
      const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
      const entries = await mlPilotOpsService.listPilotCategoryAllowlist({
        marketplace: 'mercadolibre',
        siteId,
        enabled,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return res.json({ success: true, count: entries.length, data: entries });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/marketplace/mercadolibre/pilot-category-allowlist/:categoryKey
 * Upserts category allowlist entry for MLC pilot.
 */
router.put(
  '/mercadolibre/pilot-category-allowlist/:categoryKey',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = pilotAllowlistUpsertSchema.parse(req.body || {});
      const categoryKey = String(req.params.categoryKey || '').trim();
      if (!categoryKey) {
        return res.status(400).json({ success: false, error: 'categoryKey is required' });
      }
      const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
      const entry = await mlPilotOpsService.upsertPilotCategoryAllowlistEntry({
        marketplace: 'mercadolibre',
        siteId: payload.siteId || 'MLC',
        categoryKey,
        enabled: payload.enabled,
        notes: payload.notes,
        createdBy: payload.createdBy || req.user?.username || `user_${req.user!.userId}`,
      });
      return res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/marketplace/mercadolibre/pilot-ledger
 * Lists pilot decision ledger rows (assessment + attempts).
 */
router.get('/mercadolibre/pilot-ledger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productIdRaw = req.query.productId;
    const limit = Number(req.query.limit);
    const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
    const rows = await mlPilotOpsService.listPilotDecisionLedger({
      userId: req.user!.userId,
      productId:
        productIdRaw != null && Number.isFinite(Number(productIdRaw))
          ? Number(productIdRaw)
          : undefined,
      marketplace: 'mercadolibre',
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/mercadolibre/pilot-control/:productId
 * Returns current abort/rollback control state for product.
 */
router.get('/mercadolibre/pilot-control/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid productId' });
    }
    const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
    const state = await mlPilotOpsService.getPilotControlState({
      userId: req.user!.userId,
      productId,
      marketplace: 'mercadolibre',
    });
    return res.json({
      success: true,
      data: state || {
        userId: req.user!.userId,
        productId,
        marketplace: 'mercadolibre',
        state: 'ready',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketplace/mercadolibre/pilot-control/:productId
 * Sets abort/rollback control state and appends ledger evidence.
 */
router.post('/mercadolibre/pilot-control/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid productId' });
    }
    const payload = pilotControlStateSchema.parse(req.body || {});
    const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
    const control = await mlPilotOpsService.setPilotControlState({
      userId: req.user!.userId,
      productId,
      marketplace: 'mercadolibre',
      state: payload.state,
      reason: payload.reason,
      createdBy: payload.createdBy || req.user?.username || `user_${req.user!.userId}`,
      evidenceSnapshot: payload.evidenceSnapshot,
    });
    if (
      payload.state === 'aborted' ||
      payload.state === 'rollback_requested' ||
      payload.state === 'rollback_completed'
    ) {
      await mlPilotOpsService.appendPilotDecisionLedger({
        userId: req.user!.userId,
        productId,
        marketplace: 'mercadolibre',
        publishIntent: 'pilot',
        requestedMode: 'international',
        modeResolved: 'international',
        result: payload.state,
        reason: payload.reason || `pilot_control:${payload.state}`,
        evidenceSnapshot: {
          controlState: payload.state,
          createdBy: payload.createdBy || req.user?.username || `user_${req.user!.userId}`,
        },
      });
    }
    return res.json({ success: true, data: control });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketplace/mercadolibre/pilot-post-publish/:productId
 * Returns minimum post-publication pilot monitoring snapshot.
 */
router.get(
  '/mercadolibre/pilot-post-publish/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = Number(req.params.productId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid productId' });
      }
      const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
      const data = await mlPilotOpsService.getPilotPostPublishStatus({
        userId: req.user!.userId,
        productId,
        marketplace: 'mercadolibre',
      });
      return res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/marketplace/publish
 * Publish product to a single marketplace
 * ✅ P0.4: Validar credenciales antes de publicar
 */
// ✅ Rate limit específico por marketplace
router.post('/publish', marketplaceRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'productId')) {
      const data = publishProductSchema.parse(req.body);
      const resolvedPublishMode =
        data.publishMode ||
        data.customData?.publishMode ||
        'local';
      const resolvedPublishIntent =
        data.publishIntent ||
        data.customData?.publishIntent ||
        'production';
      const customDataWithMode = {
        ...(data.customData || {}),
        publishMode: resolvedPublishMode,
        publishIntent: resolvedPublishIntent,
        pilotManualAck:
          data.pilotManualAck === true || data.customData?.pilotManualAck === true,
      };

      // ✅ P0.4: Validar credenciales antes de publicar
      const credentials = await marketplaceService.getCredentials(
        req.user!.userId,
        data.marketplace,
        data.environment
      );

      if (!credentials || !credentials.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Missing credentials',
          message: `Please configure your ${data.marketplace} credentials before publishing.`,
          action: 'configure_credentials',
          settingsUrl: '/settings?tab=api-credentials'
        });
      }

      // Probar conexión antes de publicar
      const testResult = await marketplaceService.testConnection(
        req.user!.userId,
        data.marketplace,
        data.environment
      );

      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid credentials',
          message: testResult.message || `Your ${data.marketplace} credentials are invalid or expired. Please update them in Settings.`,
          action: 'update_credentials',
          settingsUrl: '/settings?tab=api-credentials'
        });
      }

      const result = await marketplaceService.publishProduct(
        req.user!.userId,
        {
          productId: data.productId,
          marketplace: data.marketplace,
          customData: customDataWithMode,
          duplicateListing: data.duplicateListing,
        },
        data.environment
      );

      if (result.success) {
        const isDryRun = result.dryRun === true;
        res.status(isDryRun ? 200 : 201).json({
          success: true,
          message: isDryRun ? 'Dry-run completed. No publication executed.' : 'Product published successfully',
          data: result,
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to publish product',
          error: result.error,
        });
      }
      return;
    }

    const data = publishBatchSchema.parse(req.body);
    const allowLegacyMlBatchPublish = process.env.ALLOW_LEGACY_ML_BATCH_PUBLISH === 'true';
    if (data.marketplace === 'mercadolibre' && !allowLegacyMlBatchPublish) {
      return res.status(423).json({
        success: false,
        error: 'mercadolibre_batch_publish_blocked_phase1',
        message:
          'MercadoLibre batch publish path is blocked to prevent canonical guard bypass. Use /api/marketplace/publish (single product) or /api/publisher/approve/:id. Legacy path requires explicit emergency flags and is not allowed for normal operation.',
      });
    }

    const result = await marketplacePublishService.publish({
      userId: req.user!.userId,
      marketplace: data.marketplace,
      limit: data.limit,
      mode: data.mode,
    });

    res.status(201).json({
      success: true,
      message: 'Marketplace publish execution completed',
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/marketplace/publish-multiple
 * Publish product to multiple marketplaces
 */
router.post('/publish-multiple', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = multipleMarketplacesSchema.parse(req.body);
    
    const results = await marketplaceService.publishToMultipleMarketplaces(
      req.user!.userId,
      data.productId,
      data.marketplaces,
      data.environment
    );

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    res.status(201).json({
      success: successCount > 0,
      message: `Published to ${successCount}/${totalCount} marketplaces`,
      data: results,
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/marketplace/credentials (duplicate - removing old one)
 */

/**
 * GET /api/marketplace/credentials
 * Get credential status (without secrets)
 */
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const marketplace = String(req.query.marketplace || '').toLowerCase();
    // ✅ CORRECCIÓN EBAY OAUTH: Aceptar environment como query param para evitar ambigüedad
    const environment = (req.query.environment as 'sandbox' | 'production' | undefined);
    
    if (!['ebay', 'mercadolibre', 'amazon'].includes(marketplace)) {
      return res.status(400).json({ success: false, message: 'Invalid marketplace' });
    }
    
    // ✅ CORRECCIÓN EBAY OAUTH: Pasar environment explícito para evitar usar workflow config incorrecto
    const cred = await marketplaceService.getCredentials(
      req.user!.userId, 
      marketplace as MarketplaceName,
      environment // ✅ Pasar environment explícito (puede ser undefined si no se proporciona)
    );
    
    res.json({
      success: true,
      data: {
        marketplace,
        isActive: !!cred?.isActive,
        present: !!cred,
        environment: cred?.environment,
        issues: cred?.issues || [],
        warnings: cred?.warnings || [],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to get credentials', error: error.message });
  }
});

/**
 * POST /api/marketplace/credentials
 * Save marketplace credentials
 */
router.post('/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = credentialsSchema.parse(req.body);
    
    await marketplaceService.saveCredentials(
      req.user!.userId,
      data.marketplace,
      data.credentials
    );

    res.json({
      success: true,
      message: 'Credentials saved successfully',
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/marketplace/credentials/:marketplace
 * Get marketplace credentials (masked)
 */
router.get('/credentials/:marketplace', async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.params;
    // ✅ CORRECCIÓN EBAY OAUTH: Aceptar environment como query param para evitar ambigüedad
    const environment = (req.query.environment as 'sandbox' | 'production' | undefined);
    
    if (!['ebay', 'mercadolibre', 'amazon'].includes(marketplace)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid marketplace',
      });
    }

    // ✅ CORRECCIÓN EBAY OAUTH: Pasar environment explícito para evitar usar workflow config incorrecto
    const credentials = await marketplaceService.getCredentials(
      req.user!.userId, 
      marketplace as MarketplaceName,
      environment
    );
    
    if (!credentials) {
      return res.status(404).json({
        success: false,
        message: 'Credentials not found',
      });
    }

    // Mask sensitive data
    const maskedCredentials = {
      ...credentials,
      credentials: {
        ...credentials.credentials,
        // Mask sensitive fields
        ...(credentials.credentials.appId && { appId: `***${credentials.credentials.appId.slice(-4)}` }),
        ...(credentials.credentials.clientSecret && { clientSecret: '***masked***' }),
        ...(credentials.credentials.token && { token: '***masked***' }),
      },
    };

    res.json({
      success: true,
      data: {
        ...maskedCredentials,
        environment: credentials.environment,
        issues: credentials.issues || [],
        warnings: credentials.warnings || [],
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get credentials',
      error: error.message,
    });
  }
});

/**
 * POST /api/marketplace/test-connection/:marketplace
 * Test marketplace connection
 */
router.post('/test-connection/:marketplace', async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.params;
    
    if (!['ebay', 'mercadolibre', 'amazon'].includes(marketplace)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid marketplace',
      });
    }

    const result = await marketplaceService.testConnection(req.user!.userId, marketplace as MarketplaceName);
    
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to test connection',
      error: error.message,
    });
  }
});

/**
 * POST /api/marketplace/sync-inventory
 * Sync inventory across all marketplaces
 */
router.post('/sync-inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = syncInventorySchema.parse(req.body);
    
    await marketplaceService.syncInventory(
      req.user!.userId,
      data.productId,
      data.quantity
    );

    res.json({
      success: true,
      message: 'Inventory synced successfully',
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/marketplace/stats
 * Get marketplace statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await marketplaceService.getMarketplaceStats(req.user!.userId);
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get marketplace stats',
      error: error.message,
    });
  }
});

/**
 * GET /api/marketplace/auth-url/:marketplace
 * Get OAuth authorization URL for marketplace
 */
router.get('/auth-url/:marketplace', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';
  const userId = req.user?.userId;
  
  try {
    const { marketplace } = req.params;
    const { redirect_uri, environment: envParam, return_origin: returnOriginParam } = req.query;
    const requestedEnv = typeof envParam === 'string' ? envParam.toLowerCase() : undefined;
    const environment = requestedEnv && ['sandbox', 'production'].includes(requestedEnv) ? requestedEnv : undefined;

    // ✅ FIX OAUTH LOGOUT: Obtener origin del frontend para redirigir al mismo host (evita www vs no-www cookie mismatch)
    const allowedOrigins = [
      'https://ivanreseller.com',
      'https://www.ivanreseller.com',
      'http://ivanreseller.com',
      'http://www.ivanreseller.com',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ];
    const frontendOrigin =
      (typeof returnOriginParam === 'string' ? returnOriginParam.trim() : null) ||
      (req.get('Origin') || '').replace(/\/$/, '') ||
      (() => {
        const ref = req.get('Referer') || '';
        try {
          return ref ? new URL(ref).origin : '';
        } catch {
          return '';
        }
      })();
    const returnOrigin =
      frontendOrigin && allowedOrigins.includes(frontendOrigin)
        ? frontendOrigin.replace(/\/$/, '')
        : '';

    // ✅ FIX: Incluir aliexpress-dropshipping y aliexpress-affiliate en marketplaces soportados
    const supportedMarketplaces = ['ebay', 'mercadolibre', 'aliexpress-dropshipping', 'aliexpress_dropshipping', 'aliexpress-affiliate', 'aliexpress_affiliate'];
    const normalizedMarketplace = marketplace.toLowerCase().replace('_', '-');
    
    if (!supportedMarketplaces.includes(normalizedMarketplace)) {
      logger.warn('[Marketplace OAuth] Unsupported marketplace requested', {
        correlationId,
        marketplace,
        normalizedMarketplace,
        userId,
        supportedMarketplaces,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid marketplace or OAuth not supported',
        message: `Marketplace "${marketplace}" no es soportado para OAuth. Marketplaces soportados: ${supportedMarketplaces.filter(m => !m.includes('_')).join(', ')}`,
        correlationId,
      });
    }

    if (!userId) {
      logger.warn('[Marketplace OAuth] Unauthenticated request', {
        correlationId,
        marketplace: normalizedMarketplace,
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Debes estar autenticado para iniciar OAuth',
        correlationId,
      });
    }

    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const secret = getOAuthStateSecret();
    if (!secret) {
      return res.status(500).json({
        success: false,
        error: 'OAuth state secret not configured',
        message: 'Configure ENCRYPTION_KEY or JWT_SECRET in Railway variables.',
        correlationId,
      });
    }

    let authUrl = '';
    let formatWarning: string | null = null; // Advertencia de formato del App ID (solo para eBay)

    if (marketplace === 'ebay') {
      // Obtener credenciales primero (sin ambiente específico para obtener el ambiente guardado)
      const credTemp = await marketplaceService.getCredentials(userId, 'ebay');
      
      // 🔄 CONSISTENCIA: Usar resolver de ambiente centralizado
      const { resolveEnvironment } = await import('../../utils/environment-resolver');
      const resolvedEnv = await resolveEnvironment({
        explicit: environment as 'sandbox' | 'production' | undefined,
        fromCredentials: credTemp?.environment as 'sandbox' | 'production' | undefined,
        userId,
        default: 'production'
      });
      
      // Obtener credenciales con el ambiente resuelto
      const cred = await marketplaceService.getCredentials(userId, 'ebay', resolvedEnv);
      const appId = cred?.credentials?.appId || process.env.EBAY_APP_ID || '';
      const devId = cred?.credentials?.devId || process.env.EBAY_DEV_ID || '';
      const certId = cred?.credentials?.certId || process.env.EBAY_CERT_ID || '';
      const sandbox = resolvedEnv === 'sandbox';
      
      // 🔄 CONSISTENCIA: Usar siempre 'redirectUri' (no 'ruName')
      // eBay lo llama "RuName" internamente, pero usamos 'redirectUri' en nuestro código
      let redirectUri = typeof redirect_uri === 'string' && redirect_uri.length > 0
        ? redirect_uri
        : cred?.credentials?.redirectUri || process.env.EBAY_REDIRECT_URI || '';
      
      // Normalizar usando CredentialsManager (centralizado)
      const { CredentialsManager } = await import('../../services/credentials-manager.service');
      const normalizedCreds = CredentialsManager.normalizeCredential('ebay', { redirectUri }, resolvedEnv);
      redirectUri = normalizedCreds.redirectUri || redirectUri;
      // ✅ Aceptar tanto RuName como URL completa - eBay soporta ambos; no forzar conversión
      // Limpiar el Redirect URI - eBay es muy estricto con esto
      // Remover espacios al inicio y final, pero NO modificar el contenido interno
      // porque eBay requiere que coincida EXACTAMENTE con el registrado
      redirectUri = redirectUri.trim();
      
      // Logging detallado para debugging (redactado)
      logger.debug('[eBay OAuth] Redirect URI validation', {
        originalLength: typeof redirect_uri === 'string' ? redirect_uri.length : 0,
        fromCredsLength: cred?.credentials?.redirectUri?.length || 0,
        fromEnvLength: process.env.EBAY_REDIRECT_URI?.length || 0,
        finalLength: redirectUri.length,
        finalPreview: redirectUri.substring(0, 30) + (redirectUri.length > 30 ? '...' : ''),
        isEmpty: !redirectUri || redirectUri.length === 0,
        hasSpaces: redirectUri.includes(' '),
        firstChars: redirectUri.substring(0, 20),
        lastChars: redirectUri.substring(Math.max(0, redirectUri.length - 20)),
      });
      
      // ✅ VALIDACIÓN: Validar campos requeridos con códigos de error consistentes
      if (!appId || !appId.trim()) {
        throw new AppError(
          'El App ID de eBay es requerido. Por favor, guarda las credenciales primero.',
          400,
          ErrorCode.MISSING_REQUIRED_FIELD,
          { field: 'appId', apiName: 'ebay' }
        );
      }
      
      // Dev ID es opcional para OAuth (el token exchange solo usa App ID + Cert ID)
      // Se usa '' si no está configurado; EbayService no envía el header si devId está vacío
      
      if (!certId || !certId.trim()) {
        throw new AppError(
          'El Cert ID de eBay es requerido. Por favor, guarda las credenciales primero.',
          400,
          ErrorCode.MISSING_REQUIRED_FIELD,
          { field: 'certId', apiName: 'ebay' }
        );
      }
      
      // ✅ VALIDACIÓN: Validar Redirect URI con códigos de error consistentes
      if (!redirectUri || !redirectUri.trim()) {
        throw new AppError(
          'El Redirect URI de eBay es requerido. Por favor, guarda las credenciales primero.',
          400,
          ErrorCode.MISSING_REQUIRED_FIELD,
          { field: 'redirectUri', apiName: 'ebay' }
        );
      }
      
      // Validar formato del Redirect URI
      if (redirectUri.length < 3 || redirectUri.length > 255) {
        throw new AppError(
          `El Redirect URI debe tener entre 3 y 255 caracteres. Longitud actual: ${redirectUri.length}`,
          400,
          ErrorCode.VALIDATION_ERROR,
          { 
            field: 'redirectUri',
            length: redirectUri.length,
            minLength: 3,
            maxLength: 255
          }
        );
      }
      
      // Validar caracteres problemáticos
      const problematicChars = /[<>"{}|\\^`\[\]]/;
      if (problematicChars.test(redirectUri)) {
        throw new AppError(
          'El Redirect URI contiene caracteres inválidos. eBay requiere que coincida exactamente con el registrado.',
          400,
          ErrorCode.VALIDATION_ERROR,
          { 
            field: 'redirectUri',
            invalidChars: redirectUri.match(problematicChars)?.map(c => c)
          }
        );
      }
      
      // Advertencia si el Redirect URI contiene espacios (puede causar problemas)
      // No bloqueamos, solo advertimos, porque algunos RuNames válidos pueden tener espacios
      if (redirectUri.includes(' ')) {
        logger.warn('[eBay OAuth] Redirect URI contains spaces - this may cause issues', {
          redirectUriPreview: redirectUri.substring(0, 30) + '...',
          redirectUriLength: redirectUri.length,
          spacesCount: (redirectUri.match(/ /g) || []).length,
        });
        formatWarning = (formatWarning ? formatWarning + '\n\n' : '') + 
          `⚠️ Advertencia: El Redirect URI contiene espacios. eBay requiere que el Redirect URI coincida EXACTAMENTE con el registrado en eBay Developer Portal. Verifica que no haya espacios adicionales.`;
      }
      
      // ✅ CORRECCIÓN: Validar formato del App ID según el ambiente (solo como advertencia, no bloqueante)
      // Limpiar el App ID de espacios y caracteres especiales
      const cleanedAppId = appId.trim().replace(/[\s\u200B-\u200D\uFEFF]/g, ''); // Remover espacios y caracteres invisibles
      const appIdUpper = cleanedAppId.toUpperCase();
      
      // ✅ CORRECCIÓN: Buscar "SBX-" en cualquier parte del App ID, no solo al inicio
      // Los App IDs de eBay pueden tener formato: "IvanMart-IVANRese-SBX-1eb10af0a-358ddf27"
      // donde "SBX-" aparece después de otros prefijos
      const containsSBX = appIdUpper.includes('SBX-');
      
      // Logging para debugging (redactado)
      logger.debug('[eBay OAuth] Validating App ID', {
        originalLength: appId.length,
        cleanedLength: cleanedAppId.length,
        upperPreview: appIdUpper.substring(0, 20) + '...',
        sandbox,
        environment: resolvedEnv,
        containsSBX,
        appIdLength: cleanedAppId.length,
        firstChars: cleanedAppId.substring(0, 20) + '...',
      });
      
      // ✅ CORRECCIÓN: Solo mostrar advertencia si realmente hay una inconsistencia clara
      // Si es sandbox pero NO contiene "SBX-" en ninguna parte, advertir
      // Si es production pero contiene "SBX-", advertir
      if (sandbox && !containsSBX) {
        formatWarning = `⚠️ Advertencia: El App ID no parece ser de Sandbox (típicamente contienen "SBX-"). Si el error persiste, verifica en eBay Developer Portal que el App ID sea correcto para Sandbox.`;
        logger.warn('[eBay OAuth] App ID format warning for Sandbox', {
          appIdPreview: cleanedAppId.substring(0, 20) + '...' + cleanedAppId.substring(cleanedAppId.length - 4),
          expectedContains: 'SBX-',
          actualAppId: cleanedAppId.substring(0, 30) + '...',
        });
      } else if (!sandbox && containsSBX) {
        formatWarning = `⚠️ Advertencia: El App ID parece ser de Sandbox (contiene "SBX-"), pero estás usando Production. Si el error persiste, verifica que estés usando las credenciales correctas.`;
        logger.warn('[eBay OAuth] App ID format warning for Production', {
          appIdPreview: cleanedAppId.substring(0, 20) + '...' + cleanedAppId.substring(cleanedAppId.length - 4),
          detectedContains: 'SBX-',
        });
      }
      
      // Usar el App ID limpiado para continuar
      const finalAppId = cleanedAppId;
      const redirB64 = Buffer.from(String(redirectUri)).toString('base64url');
      
      // 🔒 SEGURIDAD: Agregar expiración al state parameter (10 minutos)
      // ✅ FIX OAUTH LOGOUT: Incluir returnOrigin para redirigir al mismo host (evita www vs no-www)
      const expirationTime = Date.now() + (10 * 60 * 1000); // 10 minutos desde ahora
      const payload = [userId, marketplace, ts, nonce, redirB64, resolvedEnv, expirationTime.toString(), returnOrigin || ''].join('|');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const state = Buffer.from([payload, sig].join('|')).toString('base64url');
      
      // Usar el App ID limpiado
      try {
        // Construir URL de OAuth directamente para tener control total sobre la codificación
        // NO usar ebay.getAuthUrl() porque genera su propio state, y necesitamos usar nuestro state personalizado
        const authBase = sandbox 
          ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
          : 'https://auth.ebay.com/oauth2/authorize';
        
        // Construir parámetros manualmente con codificación explícita
        // eBay requiere que redirect_uri coincida EXACTAMENTE con el registrado
        // IMPORTANTE: eBay OAuth requiere scopes en formato URL completo (invalid_scope si se usan cortos)
        const scopes = [
          'https://api.ebay.com/oauth/api_scope',
          'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
          'https://api.ebay.com/oauth/api_scope/sell.inventory',
          'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
          'https://api.ebay.com/oauth/api_scope/sell.marketing',
          'https://api.ebay.com/oauth/api_scope/sell.account',
          'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
        ];
        
        // ✅ CORRECCIÓN: Verificar si el redirectUri necesita codificación
        // eBay RuName típicamente solo contiene: letras, números, guiones (-), guiones bajos (_)
        // Si tiene estos caracteres, NO codificar (eBay lo espera sin codificar)
        // Solo codificar si tiene caracteres que realmente requieren codificación URL
        const needsEncoding = /[^a-zA-Z0-9\-_.]/.test(redirectUri);
        const encodedRedirectUri = needsEncoding ? encodeURIComponent(redirectUri) : redirectUri;
        
        // ✅ VALIDACIÓN CRÍTICA: Verificar que redirectUri no tenga espacios internos
        // eBay es muy estricto - cualquier espacio o carácter inesperado causa "invalid_request"
        if (/\s/.test(redirectUri)) {
          logger.error('[eBay OAuth] CRITICAL: Redirect URI contains spaces', {
            redirectUri: redirectUri.substring(0, 50) + '...',
            redirectUriLength: redirectUri.length,
            spacesFound: redirectUri.match(/\s/g)?.length || 0,
            warning: 'eBay does not allow spaces in RuName. This will cause "invalid_request" error.'
          });
          throw new AppError(
            'El Redirect URI (RuName) contiene espacios. eBay no permite espacios en el RuName. Por favor, copia el RuName exactamente desde eBay Developer Portal sin espacios.',
            400,
            ErrorCode.VALIDATION_ERROR,
            { field: 'redirectUri', apiName: 'ebay' }
          );
        }
        
        // ✅ VALIDACIÓN: Aceptar tanto RuName como URL completa - eBay soporta ambos
        // RuName: letras, números, guiones (-), guiones bajos (_)
        // URL: https?://...
        const ruNamePattern = /^[a-zA-Z0-9\-_]+$/;
        const urlPattern = /^https?:\/\/[^\s<>"{}|\\^`\[\]]+$/i;
        const isValidRuName = ruNamePattern.test(redirectUri);
        const isValidUrl = urlPattern.test(redirectUri.trim());
        if (!isValidRuName && !isValidUrl) {
          const invalidChars = redirectUri.match(/[<>"{}|\\^`\[\]]/g);
          throw new AppError(
            `El Redirect URI contiene caracteres inválidos${invalidChars?.length ? `: ${invalidChars.join(', ')}` : ''}. Usa solo el RuName (ej. Ivan_Marty-IvanMart-IVANRe-cgcqu) O la URL completa (ej. https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay).`,
            400,
            ErrorCode.VALIDATION_ERROR,
            { field: 'redirectUri', apiName: 'ebay' }
          );
        }
        
        // ✅ VALIDACIÓN: Verificar que el App ID no esté vacío después de limpiar
        if (!finalAppId || finalAppId.length === 0) {
          throw new AppError(
            'El App ID está vacío después de limpiar. Por favor, verifica que el App ID sea correcto.',
            400,
            ErrorCode.VALIDATION_ERROR,
            { field: 'appId', apiName: 'ebay' }
          );
        }
        
        // ✅ VALIDACIÓN: Verificar que el state no sea demasiado largo
        // eBay tiene un límite de longitud para parámetros (aunque no está documentado claramente)
        if (state.length > 2000) {
          logger.warn('[eBay OAuth] State parameter is very long', {
            stateLength: state.length,
            warning: 'eBay may reject very long state parameters'
          });
        }
        
        const scopeStr = scopes.join(' ');
        const finalParams = [
          `client_id=${encodeURIComponent(finalAppId)}`,
          `redirect_uri=${encodedRedirectUri}`, // Codificar solo si es necesario
          `response_type=${encodeURIComponent('code')}`,
          `scope=${encodeURIComponent(scopeStr)}`,
          `state=${encodeURIComponent(state)}`, // Usar nuestro state personalizado
        ].join('&');
        
        authUrl = `${authBase}?${finalParams}`;
        
        // ✅ VALIDACIÓN FINAL: Parsear la URL para verificar que todos los parámetros están presentes
        try {
          const testUrl = new URL(authUrl);
          const hasClientId = testUrl.searchParams.has('client_id');
          const hasRedirectUri = testUrl.searchParams.has('redirect_uri');
          const hasResponseType = testUrl.searchParams.has('response_type');
          const hasScope = testUrl.searchParams.has('scope');
          const hasState = testUrl.searchParams.has('state');
          
          if (!hasClientId || !hasRedirectUri || !hasResponseType || !hasScope || !hasState) {
            logger.error('[eBay OAuth] CRITICAL: Missing required parameters in generated URL', {
              hasClientId,
              hasRedirectUri,
              hasResponseType,
              hasScope,
              hasState,
              warning: 'This will cause "invalid_request" error from eBay'
            });
            throw new AppError(
              'Error al generar URL de autorización: faltan parámetros requeridos. Por favor, verifica las credenciales.',
              500,
              ErrorCode.INTERNAL_ERROR
            );
          }
          
          // Verificar que los valores no estén vacíos
          const clientIdValue = testUrl.searchParams.get('client_id');
          const redirectUriValue = testUrl.searchParams.get('redirect_uri');
          
          if (!clientIdValue || clientIdValue.length === 0) {
            throw new AppError(
              'El client_id está vacío en la URL generada. Por favor, verifica el App ID.',
              500,
              ErrorCode.INTERNAL_ERROR
            );
          }
          
          if (!redirectUriValue || redirectUriValue.length === 0) {
            throw new AppError(
              'El redirect_uri está vacío en la URL generada. Por favor, verifica el Redirect URI (RuName).',
              500,
              ErrorCode.INTERNAL_ERROR
            );
          }
          
          // Verificar que el redirectUri decodificado coincida con el original
          const decodedRedirectUri = decodeURIComponent(redirectUriValue);
          if (decodedRedirectUri !== redirectUri && encodedRedirectUri === redirectUri) {
            logger.warn('[eBay OAuth] Redirect URI may have been double-encoded', {
              original: redirectUri,
              decoded: decodedRedirectUri,
              warning: 'This mismatch may cause "invalid_request" error'
            });
          }
          
        } catch (urlValidationError: any) {
          logger.error('[eBay OAuth] Error validating generated URL', {
            error: urlValidationError.message,
            authUrlPreview: authUrl.substring(0, 200) + '...'
          });
          // No lanzar error aquí - la URL podría ser válida, solo loguear
        }
        
        // Logging detallado para debugging
        const urlObj = new URL(authUrl);
        const clientIdParam = urlObj.searchParams.get('client_id');
        const redirectUriParam = urlObj.searchParams.get('redirect_uri');
        
        // 🔒 SEGURIDAD: Redactar URL completa en logs para evitar exposición de tokens
        const { redactUrlForLogging } = await import('../../utils/redact');
        logger.info('[eBay OAuth] Generated auth URL', {
          sandbox,
          environment: resolvedEnv,
          appId: finalAppId.substring(0, 8) + '...' + finalAppId.substring(finalAppId.length - 4),
          appIdLength: finalAppId.length,
          redirectUri: redirectUri.substring(0, 30) + '...',
          redirectUriLength: redirectUri.length,
          redirectUriInUrl: redirectUriParam ? redirectUriParam.substring(0, 30) + '...' : null,
          clientIdInUrl: clientIdParam ? clientIdParam.substring(0, 8) + '...' + clientIdParam.substring(clientIdParam.length - 4) : null,
          authUrlLength: authUrl.length,
          authUrlPreview: redactUrlForLogging(authUrl), // Redactar URL completa
          needsEncoding,
          encodedRedirectUri: encodedRedirectUri.substring(0, 30) + '...',
          // ✅ DEBUG: Información adicional para troubleshooting
          hasSpaces: /\s/.test(redirectUri),
          allowedCharsOnly: /^[a-zA-Z0-9\-_]+$/.test(redirectUri),
          stateLength: state.length,
          scopesCount: scopes.length,
        });
        
        // ✅ VALIDACIÓN: Verificar que el redirectUri se mantuvo igual después de decodificar
        // URLSearchParams.get() decodifica automáticamente, así que debe coincidir con el original
        if (redirectUriParam !== redirectUri) {
          logger.error('[eBay OAuth] CRITICAL: Redirect URI mismatch after URL parsing', {
            original: redirectUri,
            originalLength: redirectUri.length,
            parsed: redirectUriParam,
            parsedLength: redirectUriParam?.length,
            needsEncoding,
            encoded: encodedRedirectUri,
            warning: 'This mismatch will cause unauthorized_client error. The RuName must match EXACTLY.',
          });
          
          // Intentar usar el valor sin codificar si la codificación causó el problema
          if (!needsEncoding && redirectUriParam !== redirectUri) {
            logger.warn('[eBay OAuth] Retrying without encoding redirect_uri', {
              original: redirectUri,
            });
            // Reconstruir URL sin codificar redirect_uri
            const retryParams = [
              `client_id=${encodeURIComponent(finalAppId)}`,
              `redirect_uri=${redirectUri}`, // Sin codificar
              `response_type=${encodeURIComponent('code')}`,
              `scope=${encodeURIComponent(scopeStr)}`,
              `state=${encodeURIComponent(state)}`,
            ].join('&');
            authUrl = `${authBase}?${retryParams}`;
            logger.info('[eBay OAuth] Retry URL generated without encoding redirect_uri', {
              authUrlPreview: redactUrlForLogging(authUrl),
            });
          }
        } else {
          logger.debug('[eBay OAuth] Redirect URI matches correctly after encoding', {
            redirectUri: redirectUri.substring(0, 30) + '...',
          });
        }
      } catch (urlError: any) {
        // Preservar AppError (400) para que el cliente reciba el mensaje correcto y no 500
        if (urlError && typeof urlError.statusCode === 'number' && urlError.statusCode < 500) {
          return res.status(urlError.statusCode).json({
            success: false,
            message: urlError.message,
            code: urlError.errorCode,
            hint: urlError.message?.includes('RuName') ? 'En eBay, el campo "Redirect URI" debe ser solo el RuName (ej: Ivan_Marty-IvanMart-IVANRe-xxxx), no la URL completa. Cópialo desde eBay Developer → User Tokens → RuName.' : undefined,
            correlationId,
          });
        }
        logger.error('[eBay OAuth] Error generating auth URL', {
          error: urlError?.message,
          stack: urlError?.stack,
          appId: finalAppId?.substring(0, 8) + '...' + finalAppId?.substring(finalAppId?.length - 4),
          redirectUri: redirectUri?.substring(0, 30) + '...',
        });
        throw new Error(`Error al generar URL de autorización: ${urlError?.message}`);
      }
      
      // Si hay advertencia de formato, incluirla en la respuesta pero no bloquear
      if (formatWarning) {
        logger.info('[eBay OAuth] Format warning (non-blocking)', { warning: formatWarning });
      }
    } else if (marketplace === 'mercadolibre') {
      // Obtener credenciales primero (sin ambiente específico para obtener el ambiente guardado)
      const credTemp = await marketplaceService.getCredentials(userId, 'mercadolibre');
      
      // 🔄 CONSISTENCIA: Usar resolver de ambiente centralizado
      const { resolveEnvironment } = await import('../../utils/environment-resolver');
      const resolvedEnv = await resolveEnvironment({
        explicit: environment as 'sandbox' | 'production' | undefined,
        fromCredentials: credTemp?.environment as 'sandbox' | 'production' | undefined,
        userId,
        default: 'production'
      });
      
      // Obtener credenciales con el ambiente resuelto
      const cred = await marketplaceService.getCredentials(userId, 'mercadolibre', resolvedEnv);
      const clientId = process.env.MERCADOLIBRE_CLIENT_ID || cred?.credentials?.clientId || '';
      const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET || cred?.credentials?.clientSecret || '';
      const siteId = cred?.credentials?.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC';
      const rawCallbackUrl = typeof redirect_uri === 'string' && redirect_uri.length > 0
        ? redirect_uri.trim()
        : (cred?.credentials?.redirectUri || process.env.MERCADOLIBRE_REDIRECT_URI || process.env.MERCADOLIBRE_REDIRECT_URL || getMercadoLibreRedirectUri()).trim();
      if (!rawCallbackUrl) {
        return res.status(400).json({ success: false, message: 'Missing MercadoLibre Redirect URI' });
      }
      const normalizedCallback = String(rawCallbackUrl).trim().replace(/\/$/, '');
      // MercadoLibre has a ~128 char limit on state. Use compact format:
      // ml:<userId>:<ts_hex>:<nonce_short>:<env_char>:<returnOrigin_flag>:<sig_short>
      // env_char: p=production, s=sandbox
      // returnOrigin_flag: 0=none, 1=www.ivanreseller.com, 2=ivanreseller.com
      const normalizedReturnOrigin = (returnOrigin || '').replace(/\/$/, '');
      const tsHex = BigInt(ts).toString(16);
      const nonceShort = nonce.substring(0, 8);
      const envChar = resolvedEnv === 'sandbox' ? 's' : 'p';
      const roFlag = normalizedReturnOrigin.includes('www.') ? '1' : (normalizedReturnOrigin.includes('ivanreseller') ? '2' : '0');
      const compactPayload = `ml:${userId}:${tsHex}:${nonceShort}:${envChar}:${roFlag}`;
      const compactSig = crypto.createHmac('sha256', secret).update(compactPayload).digest('hex').substring(0, 16);
      const state = Buffer.from(`${compactPayload}:${compactSig}`).toString('base64url');
      const ml = new MercadoLibreService({ clientId, clientSecret, siteId });
      const url = new URL(ml.getAuthUrl(normalizedCallback));
      url.searchParams.set('state', state);
      authUrl = url.toString();
    } else if (normalizedMarketplace === 'aliexpress-dropshipping') {
      // ✅ FIX: Validación robusta para AliExpress Dropshipping OAuth
      logger.info('[AliExpress Dropshipping OAuth] Starting authorization URL generation', {
        correlationId,
        userId,
        environment: environment || 'production (default)',
        hasRedirectUri: !!redirect_uri,
      });

      // Resolver ambiente con default seguro
      const { resolveEnvironment } = await import('../../utils/environment-resolver');
      const credTemp = await marketplaceService.getCredentials(userId, 'aliexpress-dropshipping' as any);
      const resolvedEnv = await resolveEnvironment({
        explicit: environment as 'sandbox' | 'production' | undefined,
        fromCredentials: credTemp?.environment as 'sandbox' | 'production' | undefined,
        userId,
        default: 'production'
      });

      // ✅ CANONICAL: Siempre usar una sola redirect_uri para auth y token exchange.
      const callbackUrl = getAliExpressDropshippingRedirectUri();

      logger.debug('[AliExpress Dropshipping OAuth] Callback URL resolved', {
        correlationId,
        userId,
        callbackUrl: callbackUrl.substring(0, 50) + '...',
        source: 'backend_canonical',
      });

      // Obtener credenciales base (appKey y appSecret)
      const { CredentialsManager } = await import('../../services/credentials-manager.service');
      const cred = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', resolvedEnv);
      
      // ✅ VALIDACIÓN ROBUSTA: Verificar credenciales con mensajes claros
      if (!cred) {
        logger.warn('[AliExpress Dropshipping OAuth] Credentials not found in DB', {
          correlationId,
          userId,
          environment: resolvedEnv,
        });
        return res.status(422).json({
          success: false,
          error: 'Missing AliExpress Dropshipping credentials',
          message: 'Credenciales no encontradas. Por favor configura App Key y App Secret antes de autorizar OAuth.',
          missingFields: ['appKey', 'appSecret'],
          correlationId,
        });
      }

      const { appKey, appSecret } = cred as any;
      const missingFields: string[] = [];
      
      if (!appKey || !String(appKey).trim()) {
        missingFields.push('appKey');
      }
      if (!appSecret || !String(appSecret).trim()) {
        missingFields.push('appSecret');
      }

      if (missingFields.length > 0) {
        logger.warn('[AliExpress Dropshipping OAuth] Missing required credential fields', {
          correlationId,
          userId,
          environment: resolvedEnv,
          missingFields,
          hasAppKey: !!appKey,
          hasAppSecret: !!appSecret,
        });
        return res.status(422).json({
          success: false,
          error: 'Missing AliExpress Dropshipping credentials',
          message: `Faltan campos requeridos: ${missingFields.join(', ')}. Por favor guarda las credenciales completas antes de autorizar OAuth.`,
          missingFields,
          correlationId,
        });
      }

      // State como JWT stateless (sin memoria/Redis) para evitar "Invalid authorization state signature"
      const { signStateAliExpress } = await import('../../utils/oauth-state');
      const state = signStateAliExpress(userId);

      // Generar URL de autorización
      const { aliexpressDropshippingAPIService } = await import('../../services/aliexpress-dropshipping-api.service');
      const url = aliexpressDropshippingAPIService.getAuthUrl(String(callbackUrl), state, String(appKey));
      authUrl = url;

      logger.info('[AliExpress Dropshipping OAuth] Authorization URL generated successfully', {
        correlationId,
        userId,
        environment: resolvedEnv,
        hasAuthUrl: !!authUrl,
        authUrlLength: authUrl.length,
        callbackUrl: callbackUrl.substring(0, 50) + '...',
        appKeyPreview: String(appKey).substring(0, 8) + '...',
        duration: `${Date.now() - startTime}ms`,
      });
    } else if (normalizedMarketplace === 'aliexpress-affiliate') {
      // AliExpress Affiliate: URL from aliexpress-oauth.service (canonical redirect_uri from BACKEND_URL or ALIEXPRESS_REDIRECT_URI)
      try {
        const { getAuthorizationUrl } = await import('../../services/aliexpress-oauth.service');
        authUrl = getAuthorizationUrl();
        logger.info('[AliExpress Affiliate OAuth] Authorization URL generated', {
          correlationId,
          userId,
          hasAuthUrl: !!authUrl,
          duration: `${Date.now() - startTime}ms`,
        });
      } catch (err: any) {
        logger.warn('[AliExpress Affiliate OAuth] Failed to generate auth URL', {
          correlationId,
          userId,
          error: err?.message,
        });
        return res.status(422).json({
          success: false,
          error: 'AliExpress Affiliate OAuth not configured',
          message: err?.message || 'Configura ALIEXPRESS_AFFILIATE_APP_KEY y ALIEXPRESS_REDIRECT_URI (o BACKEND_URL) antes de autorizar.',
          correlationId,
        });
      }
    }

    // Validar que authUrl se haya generado correctamente
    if (!authUrl || !authUrl.trim()) {
      logger.error('[eBay OAuth] authUrl is empty after generation');
      return res.status(500).json({
        success: false,
        message: 'Error: No se pudo generar la URL de autorización. Verifica los logs del servidor.',
      });
    }
    
    // Validar que la URL sea válida
    try {
      new URL(authUrl);
    } catch (urlError: any) {
      const { redactUrlForLogging } = await import('../../utils/redact');
      logger.error('[eBay OAuth] Invalid authUrl generated', {
        authUrlPreview: redactUrlForLogging(authUrl),
        error: urlError.message,
      });
      return res.status(500).json({
        success: false,
        message: `Error: La URL de autorización generada no es válida: ${urlError.message}`,
      });
    }
    
    // Incluir advertencia si existe (solo para eBay)
    const responseData: any = {
      success: true,
      data: {
        authUrl,
      },
    };
    
    if (marketplace === 'ebay' && formatWarning) {
      responseData.warning = formatWarning;
      responseData.message = 'URL de autorización generada. Revisa la advertencia sobre el formato del App ID si el OAuth falla.';
    }
    
    const duration = Date.now() - startTime;
    logger.info('[Marketplace OAuth] Returning auth URL response', {
      correlationId,
      marketplace: normalizedMarketplace,
      userId,
      success: responseData.success,
      hasAuthUrl: !!responseData.data.authUrl,
      authUrlLength: responseData.data.authUrl?.length,
      hasWarning: !!responseData.warning,
      duration: `${duration}ms`,
      durationMs: duration,
    });
    
    res.json(responseData);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('[Marketplace OAuth] Error generating auth URL', {
      correlationId,
      marketplace: req.params.marketplace,
      userId,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      durationMs: duration,
    });
    
    // ✅ RESILIENT ERROR HANDLING: Nunca devolver 500 genérico, siempre incluir correlationId
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to get auth URL',
      message: error.message || 'Error al generar URL de autorización. Verifica los logs del servidor.',
      correlationId,
    });
  }
});

export default router;
