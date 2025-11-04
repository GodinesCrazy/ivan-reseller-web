import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import crypto from 'crypto';

const router = Router();

// Encryption configuration
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt sensitive data
 */
function encrypt(text: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedData: { encrypted: string; iv: string; tag: string }): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'),
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * GET /api/settings/apis
 * Get all API configurations
 */
router.get('/apis', authenticate, async (req, res) => {
  try {
    // Define available APIs
    const apis = [
      {
        id: 1,
        name: 'eBay API',
        status: 'not_configured',
        environment: 'sandbox',
        lastUsed: null,
        requestsToday: 0,
        limit: 5000,
        fields: [
          { key: 'EBAY_APP_ID', label: 'App ID (Client ID)', required: true, type: 'text' },
          { key: 'EBAY_DEV_ID', label: 'Dev ID', required: true, type: 'text' },
          { key: 'EBAY_CERT_ID', label: 'Cert ID (Client Secret)', required: true, type: 'password' },
          { key: 'EBAY_AUTH_TOKEN', label: 'Auth Token', required: false, type: 'password' }
        ]
      },
      {
        id: 2,
        name: 'Amazon SP-API',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 10000,
        fields: [
          { key: 'AMAZON_SELLER_ID', label: 'Seller ID', required: true, type: 'text', placeholder: 'A2XXXXXXXXXX' },
          { key: 'AMAZON_CLIENT_ID', label: 'Client ID', required: true, type: 'text', placeholder: 'amzn1.application-oa2-client.xxxxx' },
          { key: 'AMAZON_CLIENT_SECRET', label: 'Client Secret', required: true, type: 'password' },
          { key: 'AMAZON_REFRESH_TOKEN', label: 'Refresh Token', required: true, type: 'password', placeholder: 'Atzr|xxxxxxxxxx' },
          { key: 'AMAZON_ACCESS_KEY_ID', label: 'AWS Access Key ID', required: true, type: 'text', placeholder: 'AKIAXXXXXXXXXXXXXXXX' },
          { key: 'AMAZON_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', required: true, type: 'password' },
          { key: 'AMAZON_REGION', label: 'AWS Region', required: true, type: 'text', placeholder: 'us-east-1' },
          { key: 'AMAZON_MARKETPLACE_ID', label: 'Marketplace ID', required: true, type: 'text', placeholder: 'ATVPDKIKX0DER (US)' }
        ],
        description: 'Amazon SP-API with complete AWS SigV4 signing. Requires LWA + IAM credentials.'
      },
      {
        id: 3,
        name: 'MercadoLibre API',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 15000,
        fields: [
          { key: 'MERCADOLIBRE_CLIENT_ID', label: 'Client ID', required: true, type: 'text' },
          { key: 'MERCADOLIBRE_CLIENT_SECRET', label: 'Client Secret', required: true, type: 'password' },
          { key: 'MERCADOLIBRE_ACCESS_TOKEN', label: 'Access Token', required: false, type: 'password' },
          { key: 'MERCADOLIBRE_REFRESH_TOKEN', label: 'Refresh Token', required: false, type: 'password' }
        ]
      },
      {
        id: 4,
        name: 'GROQ AI API',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 1000,
        fields: [
          { key: 'GROQ_API_KEY', label: 'API Key', required: true, type: 'password' }
        ]
      },
      {
        id: 5,
        name: 'ScraperAPI',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 5000,
        fields: [
          { key: 'SCRAPERAPI_KEY', label: 'API Key', required: true, type: 'password' }
        ]
      },
      {
        id: 6,
        name: 'ZenRows API',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 1000,
        fields: [
          { key: 'ZENROWS_API_KEY', label: 'API Key', required: true, type: 'password' }
        ]
      },
      {
        id: 7,
        name: '2Captcha',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 10000,
        fields: [
          { key: 'CAPTCHA_2CAPTCHA_KEY', label: 'API Key', required: true, type: 'password' }
        ]
      },
      {
        id: 8,
        name: 'PayPal Payouts API',
        status: 'not_configured',
        environment: 'sandbox',
        lastUsed: null,
        requestsToday: 0,
        limit: 10000,
        fields: [
          { key: 'PAYPAL_CLIENT_ID', label: 'Client ID', required: true, type: 'text', placeholder: 'AYxxxxxxxxxxxxx' },
          { key: 'PAYPAL_CLIENT_SECRET', label: 'Client Secret', required: true, type: 'password', placeholder: 'EGxxxxxxxxxxxxx' },
          { key: 'PAYPAL_ENVIRONMENT', label: 'Environment', required: true, type: 'text', placeholder: 'sandbox or production' }
        ],
        description: 'PayPal Payouts API for automatic commission payments. Cost: $0.25 per payout.'
      },
      {
        id: 9,
        name: 'AliExpress Auto-Purchase',
        status: 'not_configured',
        environment: 'production',
        lastUsed: null,
        requestsToday: 0,
        limit: 100,
        fields: [
          { key: 'ALIEXPRESS_EMAIL', label: 'Email / Username', required: true, type: 'text', placeholder: 'your@email.com' },
          { key: 'ALIEXPRESS_PASSWORD', label: 'Password', required: true, type: 'password' },
          { key: 'ALIEXPRESS_2FA_ENABLED', label: '2FA Enabled (true/false)', required: false, type: 'text', placeholder: 'false' }
        ],
        description: 'AliExpress credentials for automated purchasing. Uses browser automation (Puppeteer).'
      }
    ];

    // Check which APIs are configured in SystemConfig
    const configs = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: apis.flatMap(api => api.fields.map(f => f.key))
        }
      }
    });

    // Update status based on stored configs
    const configMap = new Map(configs.map(c => [c.key, c]));
    
    apis.forEach(api => {
      const hasAllRequired = api.fields
        .filter(f => f.required)
        .every(f => configMap.has(f.key));
      
      if (hasAllRequired) {
        api.status = 'configured';
        
        // Get last used date
        const relevantConfigs = api.fields
          .map(f => configMap.get(f.key))
          .filter(c => c?.updatedAt);
        
        if (relevantConfigs.length > 0) {
          api.lastUsed = relevantConfigs.sort((a, b) => 
            b!.updatedAt.getTime() - a!.updatedAt.getTime()
          )[0]!.updatedAt.toISOString();
        }
      }
    });

    res.json({
      success: true,
      apis
    });
  } catch (error) {
    console.error('Error fetching API configs:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración de APIs'
    });
  }
});

/**
 * POST /api/settings/apis/:apiId
 * Save API configuration
 */
router.post('/apis/:apiId', authenticate, async (req, res) => {
  try {
    const { apiId } = req.params;
    const { name, credentials } = req.body;

    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Save each credential
    const savedConfigs = [];
    
    for (const [key, value] of Object.entries(credentials)) {
      if (value && typeof value === 'string' && value.trim() !== '') {
        // Encrypt sensitive data
        const encrypted = encrypt(value);
        
        // Save to database
        const config = await prisma.systemConfig.upsert({
          where: { key },
          create: {
            key,
            value: JSON.stringify(encrypted),
            description: `${name} - ${key}`,
            isEncrypted: true
          },
          update: {
            value: JSON.stringify(encrypted),
            isEncrypted: true,
            updatedAt: new Date()
          }
        });
        
        savedConfigs.push(config);
      }
    }

    res.json({
      success: true,
      message: 'API configurada exitosamente',
      saved: savedConfigs.length
    });
  } catch (error) {
    console.error('Error saving API config:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar configuración de API'
    });
  }
});

/**
 * GET /api/settings/apis/:apiId
 * Get specific API configuration (decrypted)
 */
router.get('/apis/:apiId', authenticate, async (req, res) => {
  try {
    const { apiId } = req.params;

    // This would return the decrypted values for editing
    // For security, we only return masked values
    res.json({
      success: true,
      message: 'Por seguridad, las credenciales no se pueden visualizar completas'
    });
  } catch (error) {
    console.error('Error fetching API config:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración de API'
    });
  }
});

/**
 * DELETE /api/settings/apis/:apiId
 * Delete API configuration
 */
router.delete('/apis/:apiId', authenticate, async (req, res) => {
  try {
    const { apiId } = req.params;
    const { keys } = req.body;

    if (!Array.isArray(keys)) {
      return res.status(400).json({
        success: false,
        message: 'Keys debe ser un array'
      });
    }

    // Delete configs
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: keys
        }
      }
    });

    res.json({
      success: true,
      message: 'Configuración eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error deleting API config:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar configuración de API'
    });
  }
});

export default router;
