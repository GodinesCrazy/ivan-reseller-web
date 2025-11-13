import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { PrismaClient, CredentialScope } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware';
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
    const personalCount = apis.filter(
      (api) => api.scope === 'user' && api.owner?.id === userId
    ).length;
    const sharedCount = apis.filter((api) => api.scope === 'global').length;

    res.json({
      success: true,
      data: apis,
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

// GET /api/api-credentials/status - Estado de todas las APIs con capabilities
router.get('/status', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    const [statuses, capabilities] = await Promise.all([
      apiAvailability.getAllAPIStatus(userId),
      apiAvailability.getCapabilities(userId),
    ]);

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
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/api-credentials/:apiName - Obtener credenciales de una API específica
router.get('/:apiName', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role?.toUpperCase() || 'USER';
    const targetUserId = resolveTargetUserId(req, req.query.targetUserId);
    const { apiName } = req.params;
    const environment = (req.query.environment as ApiEnvironment) || 'production';
    const includeGlobal = req.query.includeGlobal !== 'false';

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
    }

    const supportsEnv = supportsEnvironments(apiName);

    const entry = await CredentialsManager.getCredentialEntry(
      targetUserId,
      apiName as ApiName,
      supportsEnv ? environment : 'production',
      { includeGlobal }
    );

    if (!entry) {
      return res.json({
        success: true,
        data: {
          apiName,
          environment,
          credentials: null,
          isActive: false,
          supportsEnvironments: supportsEnv,
        }
      });
    }

    const shouldMaskCredentials = entry.scope === 'global' && role !== 'ADMIN';
    const credentials = shouldMaskCredentials ? {} : entry.credentials;
 
    res.json({ 
      success: true,
      data: {
        apiName,
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
    const scope = normalizeScope(scopeRaw, actorRole, apiName);
    const ownerUserId = scope === 'global' ? actorId : targetUserId;
    const sharedByUserId =
      scope === 'global'
        ? actorId
        : actorRole === 'ADMIN' && ownerUserId !== actorId
        ? actorId
        : null;

    // Validar apiName
    if (!apiName || typeof apiName !== 'string') {
      throw new AppError('API name is required', 400);
    }

    // Validar environment
    const env = environment as ApiEnvironment;
    if (env !== 'sandbox' && env !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
    }

    // Validar credentials
    if (!credentials || typeof credentials !== 'object') {
      throw new AppError('Credentials object is required', 400);
    }

    // Log para debugging (sin datos sensibles)
    console.log(`[API Credentials] Saving ${apiName} for owner ${ownerUserId} (target ${targetUserId}):`, {
      apiName,
      environment: env,
      hasCredentials: !!credentials,
      credentialKeys: Object.keys(credentials || {}),
      twoFactorEnabled: credentials?.twoFactorEnabled,
      twoFactorEnabledType: typeof credentials?.twoFactorEnabled
    });

    // Validar credenciales usando CredentialsManager
    const validation = CredentialsManager.validateCredentials(
      apiName as ApiName,
      credentials
    );

    if (!validation.valid) {
      console.error(`[API Credentials] Validation failed for ${apiName}:`, validation.errors);
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials format',
        details: validation.errors,
        received: {
          keys: Object.keys(credentials || {}),
          twoFactorEnabled: credentials?.twoFactorEnabled,
          twoFactorEnabledType: typeof credentials?.twoFactorEnabled
        }
      });
    }

    // Guardar credenciales usando CredentialsManager
    await CredentialsManager.saveCredentials(
      ownerUserId,
      apiName as ApiName,
      credentials,
      env,
      {
        scope,
        sharedByUserId,
      }
    );

    // Actualizar isActive si es necesario
    if (isActive !== undefined) {
      await CredentialsManager.toggleCredentials(
        ownerUserId,
        apiName as ApiName,
        env,
        scope,
        isActive
      );
    }

    // Clear cache for this API - siempre invalidar cache después de guardar
    if (scope === 'global' && actorRole === 'ADMIN') {
      // Si es credencial global, invalidar cache para todos los usuarios
      const users = await prisma.user.findMany({ select: { id: true } });
      await Promise.all(
        users.map(user => apiAvailability.clearAPICache(user.id, apiName))
      );
      logger.info(`Cache invalidated for all users (global ${apiName} credentials)`);
    } else {
      // Si es credencial personal, invalidar cache solo para el usuario objetivo
      await apiAvailability.clearAPICache(targetUserId, apiName);
      logger.info(`Cache invalidated for user ${targetUserId} (${apiName} credentials)`);
    }

    // Log activity
    await prisma.activity.create({
      data: {
        userId: actorId,
        action: 'API_CREDENTIAL_UPDATED',
        description: `API credentials updated: ${apiName} (${env}) [${scope}]`,
        metadata: JSON.stringify({
          apiName,
          environment: env,
          isActive,
          scope,
          targetUserId,
        }),
      },
    });

    res.json({ 
      success: true,
      message: `${apiName} credentials saved successfully for ${env} environment`,
      data: {
        apiName,
        environment: env,
        isActive,
        supportsEnvironments: supportsEnvironments(apiName),
        scope,
      }
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid credentials format', 
        details: error.errors 
      });
    }
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

    // Validar environment
    const env = environment as ApiEnvironment;
    if (env !== 'sandbox' && env !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
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

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
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
    const { apiName } = req.params;
    const { environment = 'production', credentials: tempCredentials } = req.body;

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
    }

    // ✅ Si se proporcionan credenciales temporales del formulario, validarlas primero
    if (tempCredentials && typeof tempCredentials === 'object') {
      // Validar formato de credenciales
      const validation = CredentialsManager.validateCredentials(
        apiName as ApiName,
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
        'aliexpress': ['ALIEXPRESS_EMAIL', 'ALIEXPRESS_PASSWORD'],
      };

      const requiredFields = requiredFieldsMap[apiName] || [];
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
        'paypal': { 'clientId': 'PAYPAL_CLIENT_ID', 'clientSecret': 'PAYPAL_CLIENT_SECRET' },
        'aliexpress': { 'email': 'ALIEXPRESS_EMAIL', 'password': 'ALIEXPRESS_PASSWORD' },
      };

      const mapping = fieldMapping[apiName] || {};
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
    // Force re-check by clearing cache
    await apiAvailability.clearAPICache(userId, apiName);

    // Check API status (con environment)
    let status;
    switch (apiName) {
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
      case 'zenrows':
        status = await apiAvailability.checkZenRowsAPI(userId);
        break;
      case '2captcha':
        status = await apiAvailability.check2CaptchaAPI(userId);
        break;
      case 'paypal':
        status = await apiAvailability.checkPayPalAPI(userId);
        break;
      case 'aliexpress':
        status = await apiAvailability.checkAliExpressAPI(userId);
        break;
      default:
        throw new AppError('Invalid API name', 400);
    }

    res.json({ 
      success: true,
      data: status 
    });
  } catch (error) {
    next(error);
  }
});

export default router;
