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
  customData: z.object({
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
 * POST /api/marketplace/publish
 * Publish product to a single marketplace
 * ✅ P0.4: Validar credenciales antes de publicar
 */
// ✅ Rate limit específico por marketplace
router.post('/publish', marketplaceRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'productId')) {
      const data = publishProductSchema.parse(req.body);

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
      return;
    }

    const data = publishBatchSchema.parse(req.body);
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
    const { redirect_uri, environment: envParam } = req.query;
    const requestedEnv = typeof envParam === 'string' ? envParam.toLowerCase() : undefined;
    const environment = requestedEnv && ['sandbox', 'production'].includes(requestedEnv) ? requestedEnv : undefined;

    // ✅ FIX: Incluir aliexpress-dropshipping en marketplaces soportados
    const supportedMarketplaces = ['ebay', 'mercadolibre', 'aliexpress-dropshipping', 'aliexpress_dropshipping'];
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
    const secret = process.env.ENCRYPTION_KEY || 'default-key';

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
      const expirationTime = Date.now() + (10 * 60 * 1000); // 10 minutos desde ahora
      const payload = [userId, marketplace, ts, nonce, redirB64, resolvedEnv, expirationTime.toString()].join('|');
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
        // IMPORTANTE: El RuName NO debe codificarse si solo contiene caracteres alfanuméricos, guiones y guiones bajos
        // Solo codificar si tiene caracteres especiales que realmente necesiten codificación
        const scopes = ['sell.inventory.readonly', 'sell.inventory', 'sell.marketing.readonly', 'sell.marketing'];
        
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
        
        // ✅ VALIDACIÓN: Verificar que el redirectUri solo contenga caracteres permitidos
        // eBay RuName solo permite: letras, números, guiones (-), guiones bajos (_)
        const allowedPattern = /^[a-zA-Z0-9\-_]+$/;
        if (!allowedPattern.test(redirectUri)) {
          const invalidChars = redirectUri.match(/[^a-zA-Z0-9\-_]/g);
          logger.error('[eBay OAuth] CRITICAL: Redirect URI contains invalid characters', {
            redirectUri: redirectUri.substring(0, 50) + '...',
            invalidChars: invalidChars?.join(', ') || 'unknown',
            warning: 'eBay RuName only allows: letters, numbers, hyphens (-), underscores (_)'
          });
          throw new AppError(
            `El Redirect URI (RuName) contiene caracteres inválidos: ${invalidChars?.join(', ') || 'desconocidos'}. eBay solo permite letras, números, guiones (-) y guiones bajos (_).`,
            400,
            ErrorCode.VALIDATION_ERROR,
            { field: 'redirectUri', apiName: 'ebay', invalidChars: invalidChars }
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
        
        const finalParams = [
          `client_id=${encodeURIComponent(finalAppId)}`,
          `redirect_uri=${encodedRedirectUri}`, // Codificar solo si es necesario
          `response_type=${encodeURIComponent('code')}`,
          `scope=${encodeURIComponent(scopes.join(' '))}`,
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
              `scope=${encodeURIComponent(scopes.join(' '))}`,
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
        logger.error('[eBay OAuth] Error generating auth URL', {
          error: urlError.message,
          stack: urlError.stack,
          appId: finalAppId.substring(0, 8) + '...' + finalAppId.substring(finalAppId.length - 4),
          redirectUri: redirectUri.substring(0, 30) + '...',
        });
        throw new Error(`Error al generar URL de autorización: ${urlError.message}`);
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

      // ✅ DEFAULT SEGURO: Callback URL con dominio público
      const webBaseUrl = process.env.WEB_BASE_URL || 
                        (process.env.NODE_ENV === 'production' ? 'https://www.ivanreseller.com' : 'http://localhost:5173');
      const defaultCallbackUrl = `${webBaseUrl}/api/aliexpress/callback`;
      
      const callbackUrl = typeof redirect_uri === 'string' && redirect_uri.length > 0
        ? redirect_uri.trim()
        : credTemp?.credentials?.redirectUri || process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI || defaultCallbackUrl;

      logger.debug('[AliExpress Dropshipping OAuth] Callback URL resolved', {
        correlationId,
        userId,
        callbackUrl: callbackUrl.substring(0, 50) + '...',
        source: typeof redirect_uri === 'string' ? 'query_param' : 
                credTemp?.credentials?.redirectUri ? 'credentials' :
                process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI ? 'env_var' : 'default',
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
