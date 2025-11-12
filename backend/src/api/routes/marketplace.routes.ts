import { Router, Request, Response } from 'express';
import { MarketplaceService } from '../../services/marketplace.service';
import { EbayService } from '../../services/ebay.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import crypto from 'crypto';
import { authenticate } from '../../middleware/auth.middleware';
import { z } from 'zod';
import { marketplaceRateLimit, ebayRateLimit, mercadolibreRateLimit, amazonRateLimit } from '../../middleware/rate-limit.middleware';

const router = Router();
const marketplaceService = new MarketplaceService();

// Apply auth middleware to all routes
router.use(authenticate);

// ✅ Aplicar rate limiting general
router.use(marketplaceRateLimit);

// Validation schemas
const publishProductSchema = z.object({
  productId: z.number(),
  marketplace: z.enum(['ebay', 'mercadolibre', 'amazon']),
  environment: z.enum(['sandbox', 'production']).optional(),
  customData: z.object({
    categoryId: z.string().optional(),
    price: z.number().optional(),
    quantity: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
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

/**
 * POST /api/marketplace/publish
 * Publish product to a single marketplace
 */
// ✅ Rate limit específico por marketplace
router.post('/publish', marketplaceRateLimit, async (req: Request, res: Response) => {
  try {
    const data = publishProductSchema.parse(req.body);
    
    const result = await marketplaceService.publishProduct(
      req.user!.userId,
      {
        productId: data.productId,
        marketplace: data.marketplace,
        customData: data.customData,
      },
      data.environment
    );

    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'Product published successfully',
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to publish product',
        error: result.error,
      });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

/**
 * POST /api/marketplace/publish-multiple
 * Publish product to multiple marketplaces
 */
router.post('/publish-multiple', async (req: Request, res: Response) => {
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
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

/**
 * POST /api/marketplace/credentials
 * Save or update marketplace credentials for current user
 */
router.post('/credentials', async (req: Request, res: Response) => {
  try {
    const data = credentialsSchema.parse(req.body);
    await marketplaceService.saveCredentials(req.user!.userId, data.marketplace, data.credentials);
    res.json({ success: true, message: 'Credentials saved' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ success: false, message: 'Failed to save credentials', error: error.message });
  }
});

/**
 * GET /api/marketplace/credentials
 * Get credential status (without secrets)
 */
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const marketplace = String(req.query.marketplace || '').toLowerCase();
    if (!['ebay', 'mercadolibre', 'amazon'].includes(marketplace)) {
      return res.status(400).json({ success: false, message: 'Invalid marketplace' });
    }
    const cred = await marketplaceService.getCredentials(req.user!.userId, marketplace);
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
router.post('/credentials', async (req: Request, res: Response) => {
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
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to save credentials',
      error: error.message,
    });
  }
});

/**
 * GET /api/marketplace/credentials/:marketplace
 * Get marketplace credentials (masked)
 */
router.get('/credentials/:marketplace', async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.params;
    
    if (!['ebay', 'mercadolibre', 'amazon'].includes(marketplace)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid marketplace',
      });
    }

    const credentials = await marketplaceService.getCredentials(req.user!.userId, marketplace);
    
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

    const result = await marketplaceService.testConnection(req.user!.userId, marketplace);
    
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
router.post('/sync-inventory', async (req: Request, res: Response) => {
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
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to sync inventory',
      error: error.message,
    });
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
  try {
    const { marketplace } = req.params;
    const { redirect_uri, environment: envParam } = req.query;
    const requestedEnv = typeof envParam === 'string' ? envParam.toLowerCase() : undefined;
    const environment = requestedEnv && ['sandbox', 'production'].includes(requestedEnv) ? requestedEnv : undefined;

    if (!['ebay', 'mercadolibre'].includes(marketplace)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid marketplace or OAuth not supported',
      });
    }

    const userId = req.user!.userId;
    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const secret = process.env.ENCRYPTION_KEY || 'default-key';

    let authUrl = '';
    let formatWarning: string | null = null; // Advertencia de formato del App ID (solo para eBay)

    if (marketplace === 'ebay') {
      const cred = await marketplaceService.getCredentials(userId, 'ebay', environment as any);
      const appId = cred?.credentials?.appId || process.env.EBAY_APP_ID || '';
      const devId = cred?.credentials?.devId || process.env.EBAY_DEV_ID || '';
      const certId = cred?.credentials?.certId || process.env.EBAY_CERT_ID || '';
      const resolvedEnv: 'sandbox' | 'production' = environment || (cred?.environment as any) || 'production';
      const sandbox = resolvedEnv === 'sandbox';
      const ruName = typeof redirect_uri === 'string' && redirect_uri.length > 0
        ? redirect_uri
        : cred?.credentials?.redirectUri || process.env.EBAY_REDIRECT_URI || '';
      
      // Validaciones antes de generar URL de OAuth
      if (!appId || !appId.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'El App ID de eBay es requerido. Por favor, guarda las credenciales primero.',
          code: 'MISSING_APP_ID'
        });
      }
      
      if (!devId || !devId.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'El Dev ID de eBay es requerido. Por favor, guarda las credenciales primero.',
          code: 'MISSING_DEV_ID'
        });
      }
      
      if (!certId || !certId.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'El Cert ID de eBay es requerido. Por favor, guarda las credenciales primero.',
          code: 'MISSING_CERT_ID'
        });
      }
      
      if (!ruName || !ruName.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'El Redirect URI (RuName) de eBay es requerido. Por favor, guarda las credenciales primero.',
          code: 'MISSING_REDIRECT_URI'
        });
      }
      
      // Validar formato del App ID según el ambiente (solo como advertencia, no bloqueante)
      // Limpiar el App ID de espacios y caracteres especiales
      const cleanedAppId = appId.trim().replace(/[\s\u200B-\u200D\uFEFF]/g, ''); // Remover espacios y caracteres invisibles
      const appIdUpper = cleanedAppId.toUpperCase();
      
      // Logging para debugging
      console.log('[eBay OAuth] Validating App ID:', {
        original: appId,
        cleaned: cleanedAppId,
        upper: appIdUpper,
        sandbox,
        environment: resolvedEnv,
        startsWithSBX: appIdUpper.startsWith('SBX-'),
        appIdLength: cleanedAppId.length,
        firstChars: cleanedAppId.substring(0, 10),
      });
      
      // Solo mostrar advertencia, no bloquear
      // Algunos App IDs de eBay pueden tener formatos diferentes o pueden ser válidos aunque no empiecen con SBX-
      if (sandbox && !appIdUpper.startsWith('SBX-')) {
        formatWarning = `⚠️ Advertencia: El App ID no parece ser de Sandbox (típicamente empiezan con "SBX-"). Si el error persiste, verifica en eBay Developer Portal que el App ID sea correcto para Sandbox.`;
        console.warn('[eBay OAuth] App ID format warning for Sandbox:', {
          appId: cleanedAppId.substring(0, 20) + '...',
          expectedPrefix: 'SBX-',
          actualPrefix: cleanedAppId.substring(0, 4),
        });
      }
      
      if (!sandbox && appIdUpper.startsWith('SBX-')) {
        formatWarning = `⚠️ Advertencia: El App ID parece ser de Sandbox (empieza con "SBX-"), pero estás usando Production. Si el error persiste, verifica que estés usando las credenciales correctas.`;
        console.warn('[eBay OAuth] App ID format warning for Production:', {
          appId: cleanedAppId.substring(0, 20) + '...',
          detectedPrefix: 'SBX-',
        });
      }
      
      // Usar el App ID limpiado para continuar
      const finalAppId = cleanedAppId;
      const redirB64 = Buffer.from(String(ruName)).toString('base64url');
      const payload = [userId, marketplace, ts, nonce, redirB64, resolvedEnv].join('|');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const state = Buffer.from([payload, sig].join('|')).toString('base64url');
      
      // Usar el App ID limpiado
      const ebay = new EbayService({ appId: finalAppId, devId: devId.trim(), certId: certId.trim(), sandbox });
      const url = new URL(ebay.getAuthUrl(String(ruName.trim())));
      url.searchParams.set('state', state);
      authUrl = url.toString();
      
      // Si hay advertencia de formato, incluirla en la respuesta pero no bloquear
      if (formatWarning) {
        console.log('[eBay OAuth] Format warning (non-blocking):', formatWarning);
      }
    } else if (marketplace === 'mercadolibre') {
      const cred = await marketplaceService.getCredentials(userId, 'mercadolibre', environment as any);
      const resolvedEnv: 'sandbox' | 'production' = environment || (cred?.environment as any) || 'production';
      const clientId = cred?.credentials?.clientId || process.env.MERCADOLIBRE_CLIENT_ID || '';
      const clientSecret = cred?.credentials?.clientSecret || process.env.MERCADOLIBRE_CLIENT_SECRET || '';
      const siteId = cred?.credentials?.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLM';
      const callbackUrl = typeof redirect_uri === 'string' && redirect_uri.length > 0
        ? redirect_uri
        : cred?.credentials?.redirectUri || process.env.MERCADOLIBRE_REDIRECT_URI || '';
      if (!callbackUrl) {
        return res.status(400).json({ success: false, message: 'Missing MercadoLibre Redirect URI' });
      }
      const redirB64 = Buffer.from(String(callbackUrl)).toString('base64url');
      const payload = [userId, marketplace, ts, nonce, redirB64, resolvedEnv].join('|');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const state = Buffer.from([payload, sig].join('|')).toString('base64url');
      const ml = new MercadoLibreService({ clientId, clientSecret, siteId });
      const url = new URL(ml.getAuthUrl(String(callbackUrl)));
      url.searchParams.set('state', state);
      authUrl = url.toString();
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
    
    res.json(responseData);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get auth URL',
    });
  }
});

export default router;
