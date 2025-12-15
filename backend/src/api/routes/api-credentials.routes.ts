import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { PrismaClient, CredentialScope } from '@prisma/client';
import { AppError, ErrorCode } from '../../middleware/error.middleware';
import { apiAvailability } from '../../services/api-availability.service';
import { CredentialsManager } from '../../services/credentials-manager.service';
import { supportsEnvironments } from '../../config/api-keys.config';
import { logger } from '../../config/logger';
import type { ApiName, ApiEnvironment } from '../../types/api-credentials.types';

const router = Router();
const prisma = new PrismaClient();
router.use(authenticate);

function resolveTargetUserId(req: Request, provided: any): number {
  const actorId = req.user!.userId;
  const actorRole = req.user!.role?.toUpperCase() || 'USER';

  if (provided === undefined || provided === null || provided === '') {
    return actorId;
  }

  const parsed = Number(provided);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new AppError('targetUserId must be a valid numeric value', 400);
  }

  if (parsed !== actorId && actorRole !== 'ADMIN') {
    throw new AppError('No tienes permisos para administrar credenciales de otro usuario', 403);
  }

  return parsed;
}

// APIs que deben ser únicamente personales (no pueden ser globales)
const PERSONAL_ONLY_APIS: ApiName[] = ['ebay', 'amazon', 'mercadolibre', 'paypal'];

const normalizeScope = (value: any, actorRole: string, apiName?: string): CredentialScope => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : value;
  
  // Si la API es de marketplace o PayPal, forzar scope 'user'
  if (apiName && PERSONAL_ONLY_APIS.includes(apiName as ApiName)) {
    if (normalized === 'global') {
      throw new AppError(
        `Las credenciales de ${apiName} deben ser personales. Cada usuario debe usar sus propias credenciales de vendedor.`,
        400
      );
    }
    return 'user';
  }
  
  if (normalized === 'global') {
    if (actorRole !== 'ADMIN') {
      throw new AppError('Solo los administradores pueden administrar credenciales globales', 403);
    }
    return 'global';
  }
  return 'user';
};

// GET /api/api-credentials - Listar APIs configuradas del usuario
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // Usar CredentialsManager para listar APIs configuradas
    const apis = await CredentialsManager.listConfiguredApis(userId);
    
    // ✅ FIX: Mapear 'serpapi' a 'googletrends' para el frontend
    // El backend usa 'serpapi' internamente pero el frontend espera 'googletrends'
    const mappedApis = apis.map(api => ({
      ...api,
      apiName: api.apiName === 'serpapi' ? 'googletrends' : api.apiName
    }));
    
    const personalCount = mappedApis.filter(
      (api) => api.scope === 'user' && api.owner?.id === userId
    ).length;
    const sharedCount = mappedApis.filter((api) => api.scope === 'global').length;

    res.json({
      success: true,
      data: mappedApis,
      summary: {
        total: apis.length,
        personal: personalCount,
        shared: sharedCount,
        active: apis.filter((a) => a.isActive).length,
        inactive: apis.filter((a) => !a.isActive).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/credentials/status - Estado de todas las APIs con capabilities
// ✅ OBJETIVO B: Mejorar manejo de errores para no bloquear la página
router.get('/status', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // ✅ Intentar obtener estados con manejo de errores individual
    let statuses: any[] = [];
    let capabilities: any = {};
    
    try {
      statuses = await apiAvailability.getAllAPIStatus(userId);
      // ✅ FIX: Mapear 'serpapi' a 'googletrends' para el frontend
      statuses = statuses.map(status => ({
        ...status,
        apiName: status.apiName === 'serpapi' ? 'googletrends' : status.apiName,
        name: status.name === 'SerpAPI (Google Trends)' ? 'Google Trends API (SerpAPI)' : status.name
      }));
    } catch (statusError: any) {
      logger.error('Error getting API statuses', {
        error: statusError?.message || String(statusError),
        userId,
        stack: statusError?.stack
      });
      // Continuar con array vacío en lugar de fallar completamente
      statuses = [];
    }
    
    try {
      capabilities = await apiAvailability.getCapabilities(userId);
    } catch (capError: any) {
      logger.error('Error getting API capabilities', {
        error: capError?.message || String(capError),
        userId
      });
      // Continuar con objeto vacío
      capabilities = {};
    }

    // ✅ Retornar respuesta estructurada incluso si hay errores parciales
    res.json({ 
      success: true,
      data: {
        apis: statuses,
        capabilities,
        summary: {
          total: statuses.length,
          configured: statuses.filter(s => s.isConfigured).length,
          available: statuses.filter(s => s.isAvailable).length,
          missing: statuses.filter(s => !s.isConfigured).length,
        },
        // ✅ Incluir información sobre errores si los hubo
        warnings: statuses.length === 0 ? ['No se pudieron cargar todos los estados de credenciales. Algunos pueden no estar disponibles.'] : undefined
      }
    });
  } catch (error: any) {
    // ✅ Si hay un error crítico, retornar respuesta parcial en lugar de error 500
    logger.error('Critical error in /api/credentials/status', {
      error: error?.message || String(error),
      userId: req.user?.userId,
      stack: error?.stack
    });
    
    // Retornar respuesta con estructura válida pero vacía
    res.status(200).json({
      success: true,
      data: {
        apis: [],
        capabilities: {},
        summary: {
          total: 0,
          configured: 0,
          available: 0,
          missing: 0,
        },
        error: 'No se pudieron cargar los estados de credenciales. Verifica tu conexión y configuración.',
        warnings: ['Error al cargar estados. Algunas funcionalidades pueden estar limitadas.']
      }
    });
  }
});

// GET /api/credentials/minimum-dropshipping - Estado de APIs mínimas necesarias para dropshipping completo
router.get('/minimum-dropshipping', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // Obtener estados de todas las APIs
    let allStatuses: any[] = [];
    try {
      allStatuses = await apiAvailability.getAllAPIStatus(userId);
    } catch (statusError: any) {
      logger.error('Error getting API statuses for minimum dropshipping check', {
        error: statusError?.message || String(statusError),
        userId
      });
      allStatuses = [];
    }

    // Definir APIs mínimas necesarias para dropshipping completo
    const minimumAPIs = [
      {
        apiName: 'aliexpress-affiliate',
        name: 'AliExpress Affiliate API',
        description: 'Búsqueda de oportunidades de negocio y productos',
        category: 'search',
        required: true
      },
      {
        apiName: 'marketplace',
        name: 'Marketplace API',
        description: 'Publicación de productos en marketplaces',
        category: 'publish',
        required: true,
        alternatives: ['mercadolibre', 'ebay', 'amazon'] // Al menos uno debe estar configurado
      },
      {
        apiName: 'paypal',
        name: 'PayPal API',
        description: 'Procesamiento de pagos y recepción de comisiones',
        category: 'payment',
        required: true
      },
      {
        apiName: 'aliexpress-dropshipping',
        name: 'AliExpress Dropshipping API',
        description: 'Compra automatizada para el cliente final',
        category: 'purchase',
        required: true
      }
    ];

    // Verificar estado de cada API mínima
    const apiStatuses = minimumAPIs.map(minAPI => {
      if (minAPI.apiName === 'marketplace') {
        // Para marketplace, verificar si al menos uno de los alternativos está configurado
        const marketplaceAPIs = ['mercadolibre', 'ebay', 'amazon'];
        const marketplaceStatuses = marketplaceAPIs.map(mpName => {
          const status = allStatuses.find(s => s.apiName === mpName);
          return {
            apiName: mpName,
            name: mpName === 'mercadolibre' ? 'MercadoLibre API' : 
                  mpName === 'ebay' ? 'eBay API' : 'Amazon SP-API',
            isConfigured: status?.isConfigured || false,
            isAvailable: status?.isAvailable || false,
            status: status?.status || 'unknown',
            message: status?.message,
            error: status?.error
          };
        });

        const atLeastOneConfigured = marketplaceStatuses.some(s => s.isConfigured);
        const atLeastOneAvailable = marketplaceStatuses.some(s => s.isAvailable);

        return {
          apiName: minAPI.apiName,
          name: minAPI.name,
          description: minAPI.description,
          category: minAPI.category,
          required: minAPI.required,
          isConfigured: atLeastOneConfigured,
          isAvailable: atLeastOneAvailable,
          status: atLeastOneAvailable ? 'healthy' : (atLeastOneConfigured ? 'degraded' : 'unhealthy'),
          alternatives: marketplaceStatuses,
          message: atLeastOneConfigured 
            ? `Al menos un marketplace configurado: ${marketplaceStatuses.filter(s => s.isConfigured).map(s => s.name).join(', ')}`
            : 'Configura al menos un marketplace (MercadoLibre, eBay o Amazon)',
          error: atLeastOneConfigured ? undefined : 'Ningún marketplace configurado'
        };
      } else {
        // Para otras APIs, buscar directamente en allStatuses
        const status = allStatuses.find(s => s.apiName === minAPI.apiName);
        return {
          apiName: minAPI.apiName,
          name: minAPI.name,
          description: minAPI.description,
          category: minAPI.category,
          required: minAPI.required,
          isConfigured: status?.isConfigured || false,
          isAvailable: status?.isAvailable || false,
          status: status?.status || 'unknown',
          message: status?.message || (status?.isConfigured ? 'Configurada' : 'No configurada'),
          error: status?.error
        };
      }
    });

    // Calcular progreso
    const configuredCount = apiStatuses.filter(s => s.isConfigured).length;
    const totalCount = apiStatuses.length;
    const progressPercentage = Math.round((configuredCount / totalCount) * 100);
    const isComplete = apiStatuses.every(s => s.isConfigured && s.isAvailable);

    // Determinar estado general
    let overallStatus: 'complete' | 'partial' | 'incomplete' = 'incomplete';
    if (isComplete) {
      overallStatus = 'complete';
    } else if (configuredCount > 0) {
      overallStatus = 'partial';
    }

    res.json({
      success: true,
      data: {
        apis: apiStatuses,
        progress: {
          configured: configuredCount,
          total: totalCount,
          percentage: progressPercentage,
          isComplete
        },
        overallStatus,
        summary: {
          search: apiStatuses.find(s => s.category === 'search'),
          publish: apiStatuses.find(s => s.category === 'publish'),
          payment: apiStatuses.find(s => s.category === 'payment'),
          purchase: apiStatuses.find(s => s.category === 'purchase')
        }
      }
    });
  } catch (error: any) {
    logger.error('Error in /api/credentials/minimum-dropshipping', {
      error: error?.message || String(error),
      userId: req.user?.userId,
      stack: error?.stack
    });
    
    res.status(200).json({
      success: true,
      data: {
        apis: [],
        progress: {
          configured: 0,
          total: 4,
          percentage: 0,
          isComplete: false
        },
        overallStatus: 'incomplete',
        error: 'No se pudieron cargar los estados de las APIs mínimas.'
      }
    });
  }
});

/**
 * @swagger
 * /api/api-credentials/{apiName}:
 *   get:
 *     summary: Obtener credenciales de una API
 *     description: Obtiene las credenciales de una API específica para el usuario autenticado. Soporta ambientes sandbox/production.
 *     tags: [API Credentials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apiName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ebay, amazon, mercadolibre, groq, openai, scraperapi, zenrows, 2captcha, paypal, aliexpress, email, twilio, slack, stripe]
 *         description: Nombre de la API
 *       - in: query
 *         name: environment
 *         schema:
 *           type: string
 *           enum: [sandbox, production]
 *           default: production
 *         description: Ambiente (solo para APIs que lo soportan)
 *       - in: query
 *         name: includeGlobal
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Incluir credenciales globales si no hay personales
 *     responses:
 *       200:
 *         description: Credenciales obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ApiCredential'
 *       400:
 *         description: Error de validación
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Credenciales no encontradas
 */
// GET /api/api-credentials/:apiName - Obtener credenciales de una API específica
router.get('/:apiName', authenticate, async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role?.toUpperCase() || 'USER';
    const targetUserId = resolveTargetUserId(req, req.query.targetUserId);
    let { apiName } = req.params;
    const environment = (req.query.environment as ApiEnvironment) || 'production';
    const includeGlobal = req.query.includeGlobal !== 'false';

    // ✅ FIX: Normalizar 'googletrends' a 'serpapi' para búsqueda en backend
    // El frontend usa 'googletrends' pero el backend usa 'serpapi' internamente
    const backendApiName = apiName === 'googletrends' ? 'serpapi' : apiName;

    // ✅ VALIDACIÓN: Validar que API soporte ambientes antes de aceptar parámetro (usar backendApiName)
    const supportsEnv = supportsEnvironments(backendApiName);
    if (!supportsEnv && environment !== 'production') {
      throw new AppError(
        `API "${apiName}" does not support environments. Only "production" is allowed.`,
        400,
        ErrorCode.VALIDATION_ERROR,
        { apiName, environment, supportsEnvironments: false }
      );
    }

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError(
        'Invalid environment. Must be "sandbox" or "production"',
        400,
        ErrorCode.VALIDATION_ERROR,
        { environment, allowedValues: ['sandbox', 'production'] }
      );
    }

    const entry = await CredentialsManager.getCredentialEntry(
      targetUserId,
      backendApiName as ApiName,
      supportsEnv ? environment : 'production',
      { includeGlobal }
    );

    if (!entry) {
      // ✅ FIX: Mapear 'serpapi' a 'googletrends' para el frontend
      const displayApiName = apiName === 'googletrends' ? 'googletrends' : (backendApiName === 'serpapi' ? 'googletrends' : apiName);
      return res.json({
        success: true,
        data: {
          apiName: displayApiName,
          originalApiName: backendApiName !== displayApiName ? backendApiName : undefined,
          environment,
          credentials: null,
          isActive: false,
          supportsEnvironments: supportsEnv,
        }
      });
    }

    const shouldMaskCredentials = entry.scope === 'global' && role !== 'ADMIN';
    const credentials = shouldMaskCredentials ? {} : entry.credentials;
    
    // ✅ FIX: Mapear 'serpapi' a 'googletrends' para el frontend
    const displayApiName = backendApiName === 'serpapi' ? 'googletrends' : apiName;
 
    res.json({ 
      success: true,
      data: {
        apiName: displayApiName,
        originalApiName: apiName !== displayApiName ? apiName : undefined,
        environment,
        credentials,
        isActive: entry.isActive,
        supportsEnvironments: supportsEnv,
        scope: entry.scope,
        ownerUserId: entry.ownerUserId,
        sharedByUserId: entry.sharedByUserId,
        masked: shouldMaskCredentials,
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/api-credentials - Crear o actualizar credenciales de API
router.post('/', async (req: Request, res: Response, next) => {
  try {
    const actorId = req.user!.userId;
    const actorRole = req.user!.role?.toUpperCase() || 'USER';
    const {
      apiName,
      credentials,
      environment = 'production',
      isActive = true,
      targetUserId: targetUserIdRaw,
      scope: scopeRaw,
    } = req.body;

    const targetUserId = resolveTargetUserId(req, targetUserIdRaw);
    
    // Validar apiName
    if (!apiName || typeof apiName !== 'string') {
      throw new AppError(
        'API name is required',
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'apiName' }
      );
    }

    // ✅ FIX: Normalizar 'googletrends' a 'serpapi' para consistencia
    // El frontend usa 'googletrends' pero el backend usa 'serpapi' internamente
    const normalizedApiName = apiName === 'googletrends' ? 'serpapi' : apiName;
    
    // ✅ VALIDACIÓN: Usar normalizedApiName para scope y validaciones
    const scope = normalizeScope(scopeRaw, actorRole, normalizedApiName);
    const ownerUserId = scope === 'global' ? actorId : targetUserId;
    const sharedByUserId =
      scope === 'global'
        ? actorId
        : actorRole === 'ADMIN' && ownerUserId !== actorId
        ? actorId
        : null;

    // ✅ VALIDACIÓN: Validar que API soporte ambientes antes de aceptar parámetro
    const supportsEnv = supportsEnvironments(normalizedApiName);
    if (!supportsEnv && environment !== 'production') {
      throw new AppError(
        `API "${apiName}" does not support environments. Only "production" is allowed.`,
        400,
        ErrorCode.VALIDATION_ERROR,
        { apiName, environment, supportsEnvironments: false }
      );
    }

    // Validar environment
    const env = environment as ApiEnvironment;
    if (env !== 'sandbox' && env !== 'production') {
      throw new AppError(
        'Invalid environment. Must be "sandbox" or "production"',
        400,
        ErrorCode.VALIDATION_ERROR,
        { environment, allowedValues: ['sandbox', 'production'] }
      );
    }

    // Validar credentials
    if (!credentials || typeof credentials !== 'object') {
      throw new AppError(
        'Credentials object is required',
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'credentials' }
      );
    }

    // 🔒 SEGURIDAD: Log para debugging (redactado - sin datos sensibles)
    const { redactSensitiveData } = await import('../../utils/redact');
    logger.info(`[API Credentials] Saving ${apiName} for owner ${ownerUserId} (target ${targetUserId})`, {
      apiName,
      environment: env,
      hasCredentials: !!credentials,
      credentialKeys: Object.keys(credentials || {}),
      twoFactorEnabled: credentials?.twoFactorEnabled,
      twoFactorEnabledType: typeof credentials?.twoFactorEnabled,
      credentialsPreview: redactSensitiveData(credentials || {})
    });

    // ✅ AUDITORÍA: Registrar intento de guardado
    const { APICredentialsAuditService } = await import('../../services/api-credentials-audit.service');
    const startTime = Date.now();

    // Validar credenciales usando CredentialsManager (usar nombre normalizado)
    const validation = CredentialsManager.validateCredentials(
      normalizedApiName as ApiName,
      credentials
    );

    if (!validation.valid) {
      logger.error(`[API Credentials] Validation failed for ${normalizedApiName}`, { 
        errors: validation.errors,
        apiName: normalizedApiName,
        originalApiName: apiName !== normalizedApiName ? apiName : undefined,
        userId: ownerUserId
      });

      // ✅ AUDITORÍA: Registrar error de validación
      await APICredentialsAuditService.logSaveAttempt({
        userId: ownerUserId,
        apiName: normalizedApiName, // ✅ Usar nombre normalizado
        environment: env,
        success: false,
        error: 'Invalid credentials format',
        errorCode: ErrorCode.VALIDATION_ERROR,
        fieldErrors: validation.errors,
        metadata: {
          credentialKeys: Object.keys(credentials || {}),
          validationErrors: validation.errors,
          originalApiName: apiName, // Guardar nombre original para auditoría
          normalizedApiName: normalizedApiName
        }
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid credentials format',
        errorCode: ErrorCode.VALIDATION_ERROR,
        details: validation.errors,
        received: {
          keys: Object.keys(credentials || {}),
          twoFactorEnabled: credentials?.twoFactorEnabled,
          twoFactorEnabledType: typeof credentials?.twoFactorEnabled
        }
      });
    }

    // Validar credenciales antes de guardar (health check inmediato)
    // ✅ NO validar inmediatamente si es eBay y no hay token OAuth (normal después de guardar credenciales base)
    let validationResult: { success: boolean; message?: string } | null = null;
    const shouldValidate = ['ebay', 'amazon', 'mercadolibre'].includes(apiName.toLowerCase());
    const isEbayWithoutToken = apiName.toLowerCase() === 'ebay' && !credentials.token && !credentials.authToken;
    
    if (shouldValidate && validation.valid && !isEbayWithoutToken) {
      try {
        const { MarketplaceService } = await import('../../services/marketplace.service');
        const marketplaceService = new MarketplaceService();
        
        // Test connection before saving (usar normalizedApiName)
        const testResult = await marketplaceService.testConnection(
          ownerUserId,
          normalizedApiName.toLowerCase() as 'ebay' | 'amazon' | 'mercadolibre',
          env
        );
        
        validationResult = {
          success: testResult.success,
          message: testResult.message,
        };
        
        if (!testResult.success) {
          // Credentials are invalid, but still save them (user might fix later)
          // ✅ Para eBay sin token, esto es esperado - no es un error real
          if (isEbayWithoutToken || testResult.message?.includes('OAuth token required')) {
            logger.info(`eBay credentials saved (OAuth pending). This is expected.`, {
              userId: ownerUserId,
              message: testResult.message,
            });
          } else {
            logger.warn(`Credentials validation failed for ${normalizedApiName}`, {
              userId: ownerUserId,
              error: testResult.message,
              originalApiName: apiName !== normalizedApiName ? apiName : undefined
            });
          }
        }
      } catch (error: any) {
        logger.warn(`Error validating credentials for ${normalizedApiName}`, {
          userId: ownerUserId,
          error: error.message,
          originalApiName: apiName !== normalizedApiName ? apiName : undefined
        });
        // Continue saving even if validation fails (might be temporary issue)
      }
    } else if (isEbayWithoutToken) {
      // ✅ eBay sin token OAuth: normal después de guardar credenciales base
      logger.info(`eBay base credentials saved. Complete OAuth authorization to use the API.`, {
        userId: ownerUserId,
      });
    }

    // Guardar credenciales usando CredentialsManager (usar nombre normalizado)
    await CredentialsManager.saveCredentials(
      ownerUserId,
      normalizedApiName as ApiName,
      credentials,
      env,
      {
        scope,
        sharedByUserId,
      }
    );

    // Actualizar isActive si es necesario (usar nombre normalizado)
    if (isActive !== undefined) {
      await CredentialsManager.toggleCredentials(
        ownerUserId,
        normalizedApiName as ApiName,
        env,
        scope,
        isActive
      );
    }

    // 🚀 PERFORMANCE: Asegurar invalidación de caché incluso si hay errores
    // ✅ FIX: Usar normalizedApiName y también limpiar caché para ambos nombres (googletrends y serpapi)
    try {
      // Lista de nombres de API para limpiar caché (normalizado + original si es diferente)
      const apiNamesToClear = [normalizedApiName];
      if (apiName !== normalizedApiName) {
        apiNamesToClear.push(apiName); // Limpiar también el nombre original
      }
      
      if (scope === 'global' && actorRole === 'ADMIN') {
        // Si es credencial global, invalidar cache para todos los usuarios
        const users = await prisma.user.findMany({ select: { id: true } });
        const invalidationPromises = users.flatMap(user => 
          apiNamesToClear.map(apiNameToClear =>
            apiAvailability.clearAPICache(user.id, apiNameToClear).catch(err => {
              logger.warn(`Failed to clear cache for user ${user.id}`, { error: err, apiName: apiNameToClear });
              return null; // Continuar con otros usuarios aunque falle uno
            })
          )
        );
        await Promise.all(invalidationPromises);
        logger.info(`Cache invalidated for all users (global ${normalizedApiName} credentials, cleared for: ${apiNamesToClear.join(', ')})`);
      } else {
        // Si es credencial personal, invalidar cache solo para el usuario objetivo
        const clearPromises = apiNamesToClear.map(apiNameToClear =>
          apiAvailability.clearAPICache(targetUserId, apiNameToClear).catch(err => {
            logger.warn(`Failed to clear cache for user ${targetUserId}`, { error: err, apiName: apiNameToClear });
            // No fallar la request si la invalidación falla
          })
        );
        await Promise.all(clearPromises);
        logger.info(`Cache invalidated for user ${targetUserId} (${normalizedApiName} credentials, cleared for: ${apiNamesToClear.join(', ')})`);
      }
      
      // 🚀 PERFORMANCE: Invalidar también el caché de credenciales desencriptadas
      // Nota: clearCredentialsCache es síncrona (void), no una Promise
      try {
        const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
        apiNamesToClear.forEach(apiNameToClear => {
          clearCredentialsCache(targetUserId, apiNameToClear, env);
        });
      } catch (err: any) {
        logger.warn(`Failed to clear credentials cache`, { error: err?.message || err, userId: targetUserId, apiName: normalizedApiName, environment: env });
      }
    } catch (error: any) {
      // Log pero no fallar la request si la invalidación de caché falla
      logger.error('Error invalidating cache after saving credentials', {
        error: error.message,
        userId: targetUserId,
        apiName: normalizedApiName,
        scope
      });
    }

    // Force immediate health check after saving
    try {
      if (shouldValidate) {
        // Trigger health check to update status immediately
        await apiAvailability.checkEbayAPI(targetUserId, env, true).catch(() => {});
      }
    } catch (error) {
      // Don't fail the request if health check fails
      logger.warn('Error performing immediate health check after saving credentials', { error });
    }

    // Log activity (usar nombre normalizado pero mantener original en metadata)
    await prisma.activity.create({
      data: {
        userId: actorId,
        action: 'API_CREDENTIAL_UPDATED',
        description: `API credentials updated: ${normalizedApiName} (${env}) [${scope}]`,
        metadata: JSON.stringify({
          apiName: normalizedApiName, // Usar nombre normalizado
          originalApiName: apiName !== normalizedApiName ? apiName : undefined, // Guardar original solo si es diferente
          environment: env,
          isActive,
          scope,
          targetUserId,
        }),
      },
    });

    // ✅ AUDITORÍA: Registrar guardado exitoso (usar nombre normalizado)
    await APICredentialsAuditService.logSaveAttempt({
      userId: ownerUserId,
      apiName: normalizedApiName,
      environment: env,
      success: true,
      metadata: {
        scope,
        isActive,
        validationResult: validationResult?.success ? 'passed' : (validationResult ? 'failed' : 'skipped'),
        validationMessage: validationResult?.message,
        duration: Date.now() - startTime,
        originalApiName: apiName !== normalizedApiName ? apiName : undefined
      }
    }).catch(err => {
      logger.warn('[API Credentials Audit] Failed to log successful save', { error: err });
      // No fallar la request si la auditoría falla
    });

    // Build response message (usar nombre normalizado pero mostrar original al usuario)
    const displayName = apiName !== normalizedApiName ? `${apiName} (normalized to ${normalizedApiName})` : normalizedApiName;
    let message = `${displayName} credentials saved successfully for ${env} environment`;
    if (validationResult !== null) {
      if (validationResult.success) {
        message += ' and validated successfully';
      } else {
        message += ` but validation failed: ${validationResult.message}`;
      }
    }

    // ✅ FIX: Forzar verificación inmediata del estado después de guardar (sin caché)
    // Esto asegura que el frontend reciba el estado actualizado inmediatamente
    // IMPORTANTE: Enviar respuesta ANTES de guardar en caché para evitar que crash SIGSEGV interrumpa la respuesta
    let immediateStatus = null;
    try {
      // Limpiar caché antes de verificar (sin await para no bloquear)
      apiAvailability.clearAPICache(targetUserId, normalizedApiName).catch(() => {});
      if (apiName !== normalizedApiName) {
        apiAvailability.clearAPICache(targetUserId, apiName).catch(() => {});
      }
      
      // Verificar estado inmediatamente (sin usar caché)
      if (normalizedApiName === 'serpapi' || apiName === 'googletrends') {
        // ✅ FIX: Obtener status sin guardar en caché de forma síncrona
        // Esto previene que el crash SIGSEGV interrumpa la respuesta HTTP
        immediateStatus = await apiAvailability.checkSerpAPI(targetUserId);
      }
    } catch (statusError: any) {
      logger.warn('Failed to get immediate status after saving', {
        error: statusError?.message,
        userId: targetUserId,
        apiName: normalizedApiName
      });
      // ✅ FIX: Si falla la verificación, NO asumir que está configurado
      // El frontend deberá verificar el estado usando el endpoint /status después
      // Esto previene mostrar "configurado" cuando en realidad no se pudo verificar
      immediateStatus = null;
    }

    // ✅ FIX: Enviar respuesta inmediatamente, antes de cualquier operación que pueda causar crash
    res.json({
      success: true,
      message,
      data: {
        apiName: apiName === 'serpapi' ? 'googletrends' : apiName, // ✅ FIX: Mapear serpapi a googletrends para frontend
        originalApiName: apiName !== normalizedApiName ? apiName : undefined, // Incluir original si es diferente
        environment: env,
        isActive,
        supportsEnvironments: supportsEnvironments(normalizedApiName),
        scope,
        validated: validationResult !== null,
        validationSuccess: validationResult?.success ?? null,
        validationMessage: validationResult?.message,
        // ✅ Incluir advertencias de validación si hay errores
        warnings: validation.errors && validation.errors.length > 0 ? validation.errors : undefined,
        // ✅ Incluir estado inmediato si está disponible
        immediateStatus: immediateStatus ? {
          isConfigured: immediateStatus.isConfigured,
          isAvailable: immediateStatus.isAvailable,
          status: immediateStatus.status,
          message: immediateStatus.message
        } : undefined
      }
    });
  } catch (error: any) {
    next(error);
  }
});

// PUT /api/api-credentials/:apiName/toggle - Activar/desactivar API
router.put('/:apiName/toggle', async (req: Request, res: Response, next) => {
  try {
    const actorId = req.user!.userId;
    const actorRole = req.user!.role?.toUpperCase() || 'USER';
    const { apiName } = req.params;
    const {
      environment = 'production',
      targetUserId: targetUserIdRaw,
      scope: scopeRaw,
    } = req.body;
    const targetUserId = resolveTargetUserId(req, targetUserIdRaw);
    const requestedScope = scopeRaw ? normalizeScope(scopeRaw, actorRole, apiName) : undefined;

    // ✅ VALIDACIÓN: Validar que API soporte ambientes antes de aceptar parámetro
    const supportsEnv = supportsEnvironments(apiName);
    if (!supportsEnv && environment !== 'production') {
      throw new AppError(
        `API "${apiName}" does not support environments. Only "production" is allowed.`,
        400,
        ErrorCode.VALIDATION_ERROR,
        { apiName, environment, supportsEnvironments: false }
      );
    }

    // Validar environment
    const env = environment as ApiEnvironment;
    if (env !== 'sandbox' && env !== 'production') {
      throw new AppError(
        'Invalid environment. Must be "sandbox" or "production"',
        400,
        ErrorCode.VALIDATION_ERROR,
        { environment, allowedValues: ['sandbox', 'production'] }
      );
    }

    const entry = await CredentialsManager.getCredentialEntry(
      targetUserId,
      apiName as ApiName,
      env,
      { includeGlobal: true }
    );

    if (!entry) {
      throw new AppError(`${apiName} credentials not found for ${env} environment`, 404);
    }

    if (requestedScope && entry.scope !== requestedScope) {
      throw new AppError(
        `The requested scope (${requestedScope}) does not match the stored credential scope (${entry.scope}).`,
        400
      );
    }

    if (entry.scope === 'global' && actorRole !== 'ADMIN') {
      throw new AppError('Solo los administradores pueden activar/desactivar credenciales globales', 403);
    }

    const newState = !entry.isActive;

    // Toggle estado
    await CredentialsManager.toggleCredentials(
      entry.ownerUserId,
      apiName as ApiName,
      env,
      entry.scope,
      newState
    );

    // Clear cache
    if (entry.scope === 'global' && actorRole === 'ADMIN') {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const user of users) {
        await apiAvailability.clearAPICache(user.id, apiName);
      }
    } else {
      await apiAvailability.clearAPICache(targetUserId, apiName);
    }

    // Log activity
    await prisma.activity.create({
      data: {
        userId: actorId,
        action: 'API_CREDENTIAL_TOGGLED',
        description: `API ${apiName} (${env}) ${newState ? 'activated' : 'deactivated'} [${entry.scope}]`,
        metadata: JSON.stringify({
          apiName,
          environment: env,
          isActive: newState,
          scope: entry.scope,
          targetUserId,
        }),
      },
    });

    res.json({ 
      success: true,
      message: `${apiName} (${env}) ${newState ? 'activated' : 'deactivated'}`,
      data: {
        apiName,
        environment: env,
        isActive: newState,
      }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/api-credentials/:apiName - Eliminar credenciales
router.delete('/:apiName', async (req: Request, res: Response, next) => {
  try {
    const actorId = req.user!.userId;
    const actorRole = req.user!.role?.toUpperCase() || 'USER';
    const { apiName } = req.params;
    const environment = (req.query.environment as ApiEnvironment) || 'production';
    const targetUserId = resolveTargetUserId(req, req.query.targetUserId);
    const scopeParam = req.query.scope;
    const requestedScope =
      scopeParam !== undefined ? normalizeScope(scopeParam, actorRole, apiName) : undefined;

    // ✅ VALIDACIÓN: Validar que API soporte ambientes antes de aceptar parámetro
    const supportsEnv = supportsEnvironments(apiName);
    if (!supportsEnv && environment !== 'production') {
      throw new AppError(
        `API "${apiName}" does not support environments. Only "production" is allowed.`,
        400,
        ErrorCode.VALIDATION_ERROR,
        { apiName, environment, supportsEnvironments: false }
      );
    }

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError(
        'Invalid environment. Must be "sandbox" or "production"',
        400,
        ErrorCode.VALIDATION_ERROR,
        { environment, allowedValues: ['sandbox', 'production'] }
      );
    }

    const entry = await CredentialsManager.getCredentialEntry(
      targetUserId,
      apiName as ApiName,
      environment,
      { includeGlobal: true }
    );

    if (!entry) {
      throw new AppError(
        `${apiName} credentials not found for ${environment} environment`,
        404
      );
    }

    if (requestedScope && entry.scope !== requestedScope) {
      throw new AppError(
        `The requested scope (${requestedScope}) does not match the stored credential scope (${entry.scope}).`,
        400
      );
    }

    if (entry.scope === 'global' && actorRole !== 'ADMIN') {
      throw new AppError('Solo los administradores pueden eliminar credenciales globales', 403);
    }

    await CredentialsManager.deleteCredentials(
      entry.ownerUserId,
      apiName as ApiName,
      environment,
      entry.scope
    );

    if (entry.scope === 'global' && actorRole === 'ADMIN') {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const user of users) {
        await apiAvailability.clearAPICache(user.id, apiName);
      }
    } else {
      await apiAvailability.clearAPICache(targetUserId, apiName);
    }

    // Log activity
    await prisma.activity.create({
      data: {
        userId: actorId,
        action: 'API_CREDENTIAL_DELETED',
        description: `API credentials deleted: ${apiName} (${environment}) [${entry.scope}]`,
        metadata: JSON.stringify({
          apiName,
          environment,
          scope: entry.scope,
          targetUserId,
        }),
      },
    });

    res.json({ 
      success: true,
      message: `${apiName} credentials deleted successfully for ${environment} environment` 
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/api-credentials/:apiName/test - Probar conexión de API
router.post('/:apiName/test', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    let { apiName } = req.params;
    const { environment = 'production', credentials: tempCredentials } = req.body;

    // ✅ FIX: Normalizar 'googletrends' a 'serpapi' para búsqueda en backend
    // El frontend usa 'googletrends' pero el backend usa 'serpapi' internamente
    const normalizedApiName = apiName === 'googletrends' ? 'serpapi' : apiName;

    // ✅ VALIDACIÓN: Validar que API soporte ambientes antes de aceptar parámetro (usar normalizedApiName)
    const supportsEnv = supportsEnvironments(normalizedApiName);
    if (!supportsEnv && environment !== 'production') {
      throw new AppError(
        `API "${apiName}" does not support environments. Only "production" is allowed.`,
        400,
        ErrorCode.VALIDATION_ERROR,
        { apiName, environment, supportsEnvironments: false }
      );
    }

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError(
        'Invalid environment. Must be "sandbox" or "production"',
        400,
        ErrorCode.VALIDATION_ERROR,
        { environment, allowedValues: ['sandbox', 'production'] }
      );
    }

    // ✅ Si se proporcionan credenciales temporales del formulario, validarlas primero
    if (tempCredentials && typeof tempCredentials === 'object') {
      // Validar formato de credenciales (usar normalizedApiName)
      const validation = CredentialsManager.validateCredentials(
        normalizedApiName as ApiName,
        tempCredentials
      );

      if (!validation.valid) {
        return res.json({
          success: true,
          data: {
            name: `${apiName} API`,
            isConfigured: false,
            isAvailable: false,
            lastChecked: new Date(),
            error: 'Invalid credentials format',
            message: `Formato de credenciales inválido: ${validation.errors.join(', ')}`,
            missingFields: validation.errors
          }
        });
      }

      // ✅ Si las credenciales son válidas, verificar que tengan los campos requeridos
      // Convertir credenciales temporales al formato que espera getUserCredentials
      const requiredFieldsMap: Record<string, string[]> = {
        'ebay': ['EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID'],
        'amazon': ['AMAZON_SELLER_ID', 'AMAZON_CLIENT_ID', 'AMAZON_CLIENT_SECRET', 'AMAZON_REFRESH_TOKEN', 'AMAZON_ACCESS_KEY_ID', 'AMAZON_SECRET_ACCESS_KEY'],
        'mercadolibre': ['MERCADOLIBRE_CLIENT_ID', 'MERCADOLIBRE_CLIENT_SECRET'],
        'groq': ['GROQ_API_KEY'],
        'scraperapi': ['SCRAPERAPI_KEY'],
        'zenrows': ['ZENROWS_API_KEY'],
        '2captcha': ['CAPTCHA_2CAPTCHA_KEY'],
        'paypal': ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
        'googletrends': [], // ✅ Opcional - no requiere campos
        'serpapi': [], // ✅ Opcional - mismo que googletrends
        'aliexpress': ['ALIEXPRESS_EMAIL', 'ALIEXPRESS_PASSWORD'],
      };

      // ✅ FIX: Usar normalizedApiName para buscar requiredFields
      const requiredFields = requiredFieldsMap[normalizedApiName] || requiredFieldsMap[apiName] || [];
      const missingFields: string[] = [];

      // Mapear credenciales del backend a nombres de campos requeridos
      const fieldMapping: Record<string, Record<string, string>> = {
        'ebay': { 'appId': 'EBAY_APP_ID', 'devId': 'EBAY_DEV_ID', 'certId': 'EBAY_CERT_ID' },
        'amazon': { 'sellerId': 'AMAZON_SELLER_ID', 'clientId': 'AMAZON_CLIENT_ID', 'clientSecret': 'AMAZON_CLIENT_SECRET', 'refreshToken': 'AMAZON_REFRESH_TOKEN', 'awsAccessKeyId': 'AMAZON_ACCESS_KEY_ID', 'awsSecretAccessKey': 'AMAZON_SECRET_ACCESS_KEY' },
        'mercadolibre': { 'clientId': 'MERCADOLIBRE_CLIENT_ID', 'clientSecret': 'MERCADOLIBRE_CLIENT_SECRET' },
        'groq': { 'apiKey': 'GROQ_API_KEY' },
        'scraperapi': { 'apiKey': 'SCRAPERAPI_KEY' },
        'zenrows': { 'apiKey': 'ZENROWS_API_KEY' },
        '2captcha': { 'apiKey': 'CAPTCHA_2CAPTCHA_KEY' },
        'paypal': { 'clientId': 'PAYPAL_CLIENT_ID', 'clientSecret': 'PAYPAL_CLIENT_SECRET', 'environment': 'PAYPAL_ENVIRONMENT' },
        'googletrends': { 'apiKey': 'SERP_API_KEY' }, // ✅ Google Trends usa SerpAPI Key
        'serpapi': { 'apiKey': 'SERP_API_KEY' }, // ✅ SerpAPI mismo mapping
        'aliexpress': { 'email': 'ALIEXPRESS_EMAIL', 'password': 'ALIEXPRESS_PASSWORD' },
      };

      // ✅ FIX: Usar normalizedApiName para buscar el mapping
      const mapping = fieldMapping[normalizedApiName] || fieldMapping[apiName] || {};
      for (const requiredField of requiredFields) {
        const backendKey = Object.keys(mapping).find(key => mapping[key] === requiredField);
        if (!backendKey || !tempCredentials[backendKey] || String(tempCredentials[backendKey]).trim() === '') {
          missingFields.push(requiredField);
        }
      }

      if (missingFields.length > 0) {
        return res.json({
          success: true,
          data: {
            name: `${apiName} API`,
            isConfigured: false,
            isAvailable: false,
            lastChecked: new Date(),
            error: `Missing credentials: ${missingFields.join(', ')}`,
            message: `Faltan credenciales requeridas: ${missingFields.join(', ')}`,
            missingFields
          }
        });
      }

      // ✅ Si todas las credenciales están presentes, retornar éxito
      return res.json({
        success: true,
        data: {
          name: `${apiName} API`,
          isConfigured: true,
          isAvailable: true,
          lastChecked: new Date(),
          message: 'Credenciales válidas. Guarda las credenciales para activar la API.'
        }
      });
    }

    // Si no hay credenciales temporales, usar el método normal (buscar en DB)
    // Force re-check by clearing cache (limpiar para ambos nombres si es necesario)
    await apiAvailability.clearAPICache(userId, normalizedApiName);
    if (apiName !== normalizedApiName) {
      await apiAvailability.clearAPICache(userId, apiName); // Limpiar también el nombre original
    }

    // Check API status (con environment) - usar normalizedApiName
    let status;
    switch (normalizedApiName) {
      case 'ebay':
        status = await apiAvailability.checkEbayAPI(userId, environment);
        break;
      case 'amazon':
        status = await apiAvailability.checkAmazonAPI(userId, environment);
        break;
      case 'mercadolibre':
        status = await apiAvailability.checkMercadoLibreAPI(userId, environment);
        break;
      case 'groq':
        status = await apiAvailability.checkGroqAPI(userId);
        break;
      case 'scraperapi':
        status = await apiAvailability.checkScraperAPI(userId);
        break;
      case 'serpapi':
        // ✅ FIX: Normalizar siempre a 'serpapi' para el check (ya está normalizado arriba)
        status = await apiAvailability.checkSerpAPI(userId);
        break;
      case 'zenrows':
        status = await apiAvailability.checkZenRowsAPI(userId);
        break;
      case '2captcha':
        status = await apiAvailability.check2CaptchaAPI(userId);
        break;
      case 'paypal':
        status = await apiAvailability.checkPayPalAPI(userId);
        break;
      case 'stripe':
        // ✅ FIX: Stripe API check not implemented yet
        status = {
          apiName: 'stripe',
          name: 'Stripe API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'Stripe API check not implemented',
          message: 'Stripe API check not implemented yet'
        } as any;
        break;
      case 'email':
        status = await apiAvailability.checkEmailAPI(userId);
        break;
      case 'twilio':
        status = await apiAvailability.checkTwilioAPI(userId);
        break;
      case 'slack':
        status = await apiAvailability.checkSlackAPI(userId);
        break;
      case 'openai':
        status = await apiAvailability.checkOpenAIAPI(userId);
        break;
      case 'aliexpress':
        status = await apiAvailability.checkAliExpressAPI(userId);
        break;
      default:
        throw new AppError('Invalid API name', 400);
    }

    // ✅ AUDITORÍA: Registrar test de conexión (usar normalizedApiName)
    const { APICredentialsAuditService } = await import('../../services/api-credentials-audit.service');
    await APICredentialsAuditService.logTestAttempt({
      userId,
      apiName: normalizedApiName,
      environment,
      success: status.isAvailable || false,
      message: status.message,
      error: status.error,
      latency: status.latency,
      metadata: {
        isConfigured: status.isConfigured,
        status: status.status,
        originalApiName: apiName !== normalizedApiName ? apiName : undefined
      }
    }).catch(err => {
      logger.warn('[API Credentials Audit] Failed to log test attempt', { error: err });
    });

    // ✅ FIX: Mapear 'serpapi' a 'googletrends' en la respuesta si el request original fue para 'googletrends'
    const responseStatus = { ...status };
    if (apiName === 'googletrends' && responseStatus.apiName === 'serpapi') {
      responseStatus.apiName = 'googletrends';
      responseStatus.name = responseStatus.name?.replace('SerpAPI', 'Google Trends API (SerpAPI)') || 'Google Trends API (SerpAPI)';
    }

    res.json({ 
      success: true,
      data: responseStatus 
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/api-credentials/maintenance/clean-corrupted - Limpiar credenciales corruptas (solo ADMIN)
router.post('/maintenance/clean-corrupted', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const autoDeactivate = req.body?.autoDeactivate !== false; // Por defecto true
    
    logger.info('Iniciando limpieza de credenciales corruptas', {
      dryRun,
      autoDeactivate,
      userId: req.user!.userId,
    });
    
    const result = await CredentialsManager.detectAndCleanCorruptedCredentials({
      autoDeactivate,
      dryRun,
    });
    
    res.json({
      success: true,
      message: dryRun 
        ? `Se encontraron ${result.corrupted} credenciales corruptas (modo dry-run, no se realizaron cambios)`
        : `${result.cleaned} credenciales corruptas desactivadas de ${result.total} totales`,
      data: result,
    });
  } catch (error: any) {
    logger.error('Error en limpieza de credenciales corruptas', {
      error: error?.message || String(error),
      userId: req.user!.userId,
    });
    next(error);
  }
});

export default router;
