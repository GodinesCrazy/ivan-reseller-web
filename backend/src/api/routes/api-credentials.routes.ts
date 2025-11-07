import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware';
import { apiAvailability } from '../../services/api-availability.service';
import { CredentialsManager, decryptCredentials } from '../../services/credentials-manager.service';
import { supportsEnvironments } from '../../config/api-keys.config';
import type { ApiName, ApiEnvironment } from '../../types/api-credentials.types';

const router = Router();
const prisma = new PrismaClient();
router.use(authenticate);

// GET /api/api-credentials - Listar APIs configuradas del usuario
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // Usar CredentialsManager para listar APIs configuradas
    const apis = await CredentialsManager.listConfiguredApis(userId);

    res.json({ 
      success: true,
      data: apis,
      summary: {
        total: apis.length,
        active: apis.filter(a => a.isActive).length,
        inactive: apis.filter(a => !a.isActive).length,
      }
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
    const { apiName } = req.params;
    const environment = (req.query.environment as ApiEnvironment) || 'production';

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
    }

    const supportsEnv = supportsEnvironments(apiName);

    const record = await prisma.apiCredential.findFirst({
      where: {
        userId,
        apiName: apiName as ApiName,
        environment: supportsEnv ? environment : 'production',
      },
    });

    if (!record) {
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

    const credentials = decryptCredentials(record.credentials);
 
    res.json({ 
      success: true,
      data: {
        apiName,
        environment,
        credentials,
        isActive: record.isActive,
        supportsEnvironments: supportsEnv,
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/api-credentials - Crear o actualizar credenciales de API
router.post('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const { apiName, credentials, environment = 'production', isActive = true } = req.body;

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
    console.log(`[API Credentials] Saving ${apiName} for user ${userId}:`, {
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
      userId,
      apiName as ApiName,
      credentials,
      env
    );

    // Actualizar isActive si es necesario
    if (isActive !== undefined) {
      await CredentialsManager.toggleCredentials(
        userId,
        apiName as ApiName,
        env,
        isActive
      );
    }

    // Clear cache for this API
    await apiAvailability.clearAPICache(userId, apiName);

    // Log activity
    await prisma.activity.create({
      data: {
        userId,
        action: 'API_CREDENTIAL_UPDATED',
        description: `API credentials updated: ${apiName} (${env})`,
        metadata: JSON.stringify({ apiName, environment: env, isActive }),
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
    const userId = req.user!.userId;
    const { apiName } = req.params;
    const { environment = 'production' } = req.body;

    // Validar environment
    const env = environment as ApiEnvironment;
    if (env !== 'sandbox' && env !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
    }

    // Verificar que existan credenciales
    const hasCredentials = await CredentialsManager.hasCredentials(
      userId,
      apiName as ApiName,
      env
    );

    if (!hasCredentials) {
      throw new AppError(`${apiName} credentials not found for ${env} environment`, 404);
    }

    // Obtener estado actual
    const apis = await CredentialsManager.listConfiguredApis(userId);
    const current = apis.find(a => a.apiName === apiName && a.environment === env);
    const newState = !current?.isActive;

    // Toggle estado
    await CredentialsManager.toggleCredentials(
      userId,
      apiName as ApiName,
      env,
      newState
    );

    // Clear cache
    await apiAvailability.clearAPICache(userId, apiName);

    // Log activity
    await prisma.activity.create({
      data: {
        userId,
        action: 'API_CREDENTIAL_TOGGLED',
        description: `API ${apiName} (${env}) ${newState ? 'activated' : 'deactivated'}`,
        metadata: JSON.stringify({ apiName, environment: env, isActive: newState }),
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
    const userId = req.user!.userId;
    const { apiName } = req.params;
    const environment = (req.query.environment as ApiEnvironment) || 'production';

    // Validar environment
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
    }

    // Verificar que existan credenciales
    const hasCredentials = await CredentialsManager.hasCredentials(
      userId,
      apiName as ApiName,
      environment
    );

    if (!hasCredentials) {
      throw new AppError(
        `${apiName} credentials not found for ${environment} environment`,
        404
      );
    }

    // Eliminar usando CredentialsManager
    await CredentialsManager.deleteCredentials(
      userId,
      apiName as ApiName,
      environment
    );

    // Clear cache
    await apiAvailability.clearAPICache(userId, apiName);

    // Log activity
    await prisma.activity.create({
      data: {
        userId,
        action: 'API_CREDENTIAL_DELETED',
        description: `API credentials deleted: ${apiName} (${environment})`,
        metadata: JSON.stringify({ apiName, environment }),
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

    // Force re-check by clearing cache
    await apiAvailability.clearAPICache(userId, apiName);

    // Check API status
    let status;
    switch (apiName) {
      case 'ebay':
        status = await apiAvailability.checkEbayAPI(userId);
        break;
      case 'amazon':
        status = await apiAvailability.checkAmazonAPI(userId);
        break;
      case 'mercadolibre':
        status = await apiAvailability.checkMercadoLibreAPI(userId);
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
