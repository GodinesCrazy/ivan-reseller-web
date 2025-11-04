import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import { AppError } from '../../middleware/error.middleware';
import { apiAvailability } from '../../services/api-availability.service';

const router = Router();
const prisma = new PrismaClient();
router.use(authenticate);

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Encrypt API credentials
 */
function encryptCredentials(credentials: Record<string, string>): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  
  const tag = cipher.getAuthTag();
  
  // Combine iv + tag + encrypted
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt API credentials
 */
function decryptCredentials(encryptedData: string): Record<string, string> {
  const data = Buffer.from(encryptedData, 'base64');
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  
  const iv = data.slice(0, IV_LENGTH);
  const tag = data.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.slice(IV_LENGTH + TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}

// Schema validation for each API type
const apiSchemas = {
  ebay: z.object({
    EBAY_APP_ID: z.string().min(1),
    EBAY_DEV_ID: z.string().min(1),
    EBAY_CERT_ID: z.string().min(1),
    EBAY_TOKEN: z.string().optional(),
  }),
  amazon: z.object({
    AMAZON_CLIENT_ID: z.string().min(1),
    AMAZON_CLIENT_SECRET: z.string().min(1),
    AMAZON_REFRESH_TOKEN: z.string().min(1),
    AMAZON_REGION: z.string().default('us-east-1'),
  }),
  mercadolibre: z.object({
    MERCADOLIBRE_CLIENT_ID: z.string().min(1),
    MERCADOLIBRE_CLIENT_SECRET: z.string().min(1),
    MERCADOLIBRE_REDIRECT_URI: z.string().url().optional(),
  }),
  groq: z.object({
    GROQ_API_KEY: z.string().min(1),
  }),
  scraperapi: z.object({
    SCRAPERAPI_KEY: z.string().min(1),
  }),
  zenrows: z.object({
    ZENROWS_API_KEY: z.string().min(1),
  }),
  '2captcha': z.object({
    CAPTCHA_API_KEY: z.string().min(1),
  }),
  paypal: z.object({
    PAYPAL_CLIENT_ID: z.string().min(1),
    PAYPAL_CLIENT_SECRET: z.string().min(1),
    PAYPAL_MODE: z.enum(['sandbox', 'production']).default('sandbox'),
  }),
  aliexpress: z.object({
    ALIEXPRESS_APP_KEY: z.string().min(1),
    ALIEXPRESS_APP_SECRET: z.string().min(1),
  }),
};

// GET /api/api-credentials - Listar APIs del usuario
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    const credentials = await prisma.apiCredential.findMany({
      where: { userId },
      select: {
        id: true,
        apiName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // No incluir credentials por seguridad
      },
      orderBy: { apiName: 'asc' },
    });

    res.json({ 
      success: true,
      data: credentials 
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

    const credential = await prisma.apiCredential.findUnique({
      where: {
        userId_apiName: { userId, apiName },
      },
    });

    if (!credential) {
      return res.status(404).json({ 
        success: false,
        error: 'API credential not found' 
      });
    }

    // Decrypt credentials
    const decrypted = decryptCredentials(credential.credentials);

    res.json({ 
      success: true,
      data: {
        id: credential.id,
        apiName: credential.apiName,
        credentials: decrypted,
        isActive: credential.isActive,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
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
    const { apiName, credentials, isActive = true } = req.body;

    // Validate apiName
    const validApiNames = Object.keys(apiSchemas);
    if (!validApiNames.includes(apiName)) {
      throw new AppError(
        `Invalid API name. Must be one of: ${validApiNames.join(', ')}`,
        400
      );
    }

    // Validate credentials schema
    const schema = apiSchemas[apiName as keyof typeof apiSchemas];
    const validatedCredentials = schema.parse(credentials);

    // Encrypt credentials
    const encrypted = encryptCredentials(validatedCredentials);

    // Upsert (create or update)
    const credential = await prisma.apiCredential.upsert({
      where: {
        userId_apiName: { userId, apiName },
      },
      create: {
        userId,
        apiName,
        credentials: encrypted,
        isActive,
      },
      update: {
        credentials: encrypted,
        isActive,
      },
    });

    // Clear cache for this API
    await apiAvailability.clearAPICache(userId, apiName);

    // Log activity
    await prisma.activity.create({
      data: {
        userId,
        action: 'API_CREDENTIAL_UPDATED',
        description: `API credentials updated: ${apiName}`,
        metadata: JSON.stringify({ apiName, isActive }),
      },
    });

    res.json({ 
      success: true,
      message: `${apiName} credentials saved successfully`,
      data: {
        id: credential.id,
        apiName: credential.apiName,
        isActive: credential.isActive,
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

    const credential = await prisma.apiCredential.findUnique({
      where: {
        userId_apiName: { userId, apiName },
      },
    });

    if (!credential) {
      throw new AppError('API credential not found', 404);
    }

    const updated = await prisma.apiCredential.update({
      where: {
        userId_apiName: { userId, apiName },
      },
      data: {
        isActive: !credential.isActive,
      },
    });

    // Clear cache
    await apiAvailability.clearAPICache(userId, apiName);

    // Log activity
    await prisma.activity.create({
      data: {
        userId,
        action: 'API_CREDENTIAL_TOGGLED',
        description: `API ${apiName} ${updated.isActive ? 'activated' : 'deactivated'}`,
        metadata: JSON.stringify({ apiName, isActive: updated.isActive }),
      },
    });

    res.json({ 
      success: true,
      message: `${apiName} ${updated.isActive ? 'activated' : 'deactivated'}`,
      data: {
        apiName: updated.apiName,
        isActive: updated.isActive,
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

    const credential = await prisma.apiCredential.findUnique({
      where: {
        userId_apiName: { userId, apiName },
      },
    });

    if (!credential) {
      throw new AppError('API credential not found', 404);
    }

    await prisma.apiCredential.delete({
      where: {
        userId_apiName: { userId, apiName },
      },
    });

    // Clear cache
    await apiAvailability.clearAPICache(userId, apiName);

    // Log activity
    await prisma.activity.create({
      data: {
        userId,
        action: 'API_CREDENTIAL_DELETED',
        description: `API credentials deleted: ${apiName}`,
        metadata: JSON.stringify({ apiName }),
      },
    });

    res.json({ 
      success: true,
      message: `${apiName} credentials deleted successfully` 
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
