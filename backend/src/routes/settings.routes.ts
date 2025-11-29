import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { CredentialsManager } from '../services/credentials-manager.service';
import { API_IDS, API_NAMES, API_CATEGORIES, supportsEnvironments, getApiEndpoint } from '../config/api-keys.config';
import type { ApiName } from '../types/api-credentials.types';

const router = Router();

/**
 * GET /api/settings/apis
 * Get all available APIs with their configuration status and field definitions
 * 
 * Este endpoint proporciona la lista completa de APIs disponibles con:
 * - Definición de campos requeridos
 * - Estado de configuración (por ambiente si aplica)
 * - Endpoints y capacidades
 */
router.get('/apis', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;

    // Obtener APIs configuradas del usuario
    const configured = await CredentialsManager.listConfiguredApis(userId);
    const configuredMap = new Map<string, Awaited<typeof configured>[number]>();

    configured.forEach((record) => {
      const key = `${record.apiName}-${record.environment}`;
      const existing = configuredMap.get(key);
      if (!existing) {
        configuredMap.set(key, record);
        return;
      }

      const recordIsPersonal = record.scope === 'user' && record.ownerUserId === userId;
      const existingIsPersonal = existing.scope === 'user' && existing.ownerUserId === userId;

      if (!existingIsPersonal && recordIsPersonal) {
        configuredMap.set(key, record);
        return;
      }

      if (!existingIsPersonal && !recordIsPersonal) {
        const existingUpdated = existing.updatedAt?.getTime?.() ?? new Date(existing.updatedAt).getTime();
        const recordUpdated = record.updatedAt?.getTime?.() ?? new Date(record.updatedAt).getTime();
        if (recordUpdated > existingUpdated) {
          configuredMap.set(key, record);
        }
      }
    });

    // Helper para crear definición de ambiente
    const createEnvironmentDef = (
      apiName: string,
      environment: 'sandbox' | 'production',
      fields: any[]
    ) => {
      const entry = configuredMap.get(`${apiName}-${environment}`);
      return {
        status: entry ? 'configured' : 'not_configured',
        isActive: entry?.isActive || false,
        endpoint: getApiEndpoint(apiName.toUpperCase(), environment),
        lastUpdated: entry?.updatedAt ? new Date(entry.updatedAt as any).toISOString() : null,
        scope: entry?.scope || 'user',
        ownerUserId: entry?.ownerUserId ?? null,
        sharedByUserId: entry?.sharedByUserId ?? null,
        fields
      };
    };

    // Definir todas las APIs disponibles
    const apis = [
      // 1. eBay API
      {
        id: API_IDS.EBAY,
        name: 'eBay API',
        apiName: API_NAMES.EBAY,
        category: API_CATEGORIES.MARKETPLACE,
        supportsEnvironments: true,
        environments: {
          sandbox: createEnvironmentDef('ebay', 'sandbox', [
            { key: 'appId', label: 'App ID (Client ID)', required: true, type: 'text' },
            { key: 'devId', label: 'Dev ID', required: true, type: 'text' },
            { key: 'certId', label: 'Cert ID (Client Secret)', required: true, type: 'password' },
            { key: 'redirectUri', label: 'Redirect URI (RuName)', required: true, type: 'text', placeholder: 'IvMart_IVANReseller-...' },
            { key: 'authToken', label: 'Auth Token', required: false, type: 'password' },
            { key: 'refreshToken', label: 'Refresh Token', required: false, type: 'password' },
            { key: 'sandbox', label: 'Sandbox Mode', required: true, type: 'boolean', value: true, disabled: true }
          ]),
          production: createEnvironmentDef('ebay', 'production', [
            { key: 'appId', label: 'App ID (Client ID)', required: true, type: 'text' },
            { key: 'devId', label: 'Dev ID', required: true, type: 'text' },
            { key: 'certId', label: 'Cert ID (Client Secret)', required: true, type: 'password' },
            { key: 'redirectUri', label: 'Redirect URI (RuName)', required: true, type: 'text', placeholder: 'IvMart_IVANReseller-...' },
            { key: 'authToken', label: 'Auth Token', required: false, type: 'password' },
            { key: 'refreshToken', label: 'Refresh Token', required: false, type: 'password' },
            { key: 'sandbox', label: 'Sandbox Mode', required: true, type: 'boolean', value: false, disabled: true }
          ])
        },
        description: 'eBay Trading API with OAuth 2.0',
        documentation: 'https://developer.ebay.com/api-docs/static/oauth-credentials.html'
      },

      // 2. Amazon SP-API
      {
        id: API_IDS.AMAZON,
        name: 'Amazon SP-API',
        apiName: API_NAMES.AMAZON,
        category: API_CATEGORIES.MARKETPLACE,
        supportsEnvironments: true,
        environments: {
          sandbox: createEnvironmentDef('amazon', 'sandbox', [
            { key: 'sellerId', label: 'Seller ID', required: true, type: 'text', placeholder: 'A2XXXXXXXXXX' },
            { key: 'clientId', label: 'LWA Client ID', required: true, type: 'text' },
            { key: 'clientSecret', label: 'LWA Client Secret', required: true, type: 'password' },
            { key: 'refreshToken', label: 'LWA Refresh Token', required: true, type: 'password' },
            { key: 'awsAccessKeyId', label: 'AWS Access Key ID', required: true, type: 'text' },
            { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', required: true, type: 'password' },
            { key: 'region', label: 'AWS Region', required: true, type: 'text', value: 'us-east-1' },
            { key: 'marketplaceId', label: 'Marketplace ID', required: true, type: 'text', placeholder: 'ATVPDKIKX0DER (US)' },
            { key: 'sandbox', label: 'Sandbox Mode', required: true, type: 'boolean', value: true, disabled: true }
          ]),
          production: createEnvironmentDef('amazon', 'production', [
            { key: 'sellerId', label: 'Seller ID', required: true, type: 'text', placeholder: 'A2XXXXXXXXXX' },
            { key: 'clientId', label: 'LWA Client ID', required: true, type: 'text' },
            { key: 'clientSecret', label: 'LWA Client Secret', required: true, type: 'password' },
            { key: 'refreshToken', label: 'LWA Refresh Token', required: true, type: 'password' },
            { key: 'awsAccessKeyId', label: 'AWS Access Key ID', required: true, type: 'text' },
            { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', required: true, type: 'password' },
            { key: 'region', label: 'AWS Region', required: true, type: 'text', value: 'us-east-1' },
            { key: 'marketplaceId', label: 'Marketplace ID', required: true, type: 'text', placeholder: 'ATVPDKIKX0DER (US)' },
            { key: 'sandbox', label: 'Sandbox Mode', required: true, type: 'boolean', value: false, disabled: true }
          ])
        },
        description: 'Amazon SP-API with AWS SigV4 signing. Requires LWA + IAM credentials.',
        documentation: 'https://developer-docs.amazon.com/sp-api/'
      },

      // 3. MercadoLibre API
      {
        id: API_IDS.MERCADOLIBRE,
        name: 'MercadoLibre API',
        apiName: API_NAMES.MERCADOLIBRE,
        category: API_CATEGORIES.MARKETPLACE,
        supportsEnvironments: true,
        environments: {
          sandbox: createEnvironmentDef('mercadolibre', 'sandbox', [
            { key: 'clientId', label: 'Client ID', required: true, type: 'text' },
            { key: 'clientSecret', label: 'Client Secret', required: true, type: 'password' },
            { key: 'accessToken', label: 'Access Token', required: true, type: 'password' },
            { key: 'refreshToken', label: 'Refresh Token', required: true, type: 'password' },
            { key: 'userId', label: 'User ID', required: false, type: 'text' },
            { key: 'sandbox', label: 'Test User Mode', required: true, type: 'boolean', value: true, disabled: true }
          ]),
          production: createEnvironmentDef('mercadolibre', 'production', [
            { key: 'clientId', label: 'Client ID', required: true, type: 'text' },
            { key: 'clientSecret', label: 'Client Secret', required: true, type: 'password' },
            { key: 'accessToken', label: 'Access Token', required: true, type: 'password' },
            { key: 'refreshToken', label: 'Refresh Token', required: true, type: 'password' },
            { key: 'userId', label: 'User ID', required: false, type: 'text' },
            { key: 'sandbox', label: 'Test User Mode', required: true, type: 'boolean', value: false, disabled: true }
          ])
        },
        description: 'MercadoLibre API with OAuth 2.0',
        documentation: 'https://developers.mercadolibre.com.ar/'
      },

      // 4. PayPal Payouts
      {
        id: API_IDS.PAYPAL,
        name: 'PayPal Payouts API',
        apiName: API_NAMES.PAYPAL,
        category: API_CATEGORIES.PAYMENT,
        supportsEnvironments: true,
        environments: {
          sandbox: createEnvironmentDef('paypal', 'sandbox', [
            { key: 'clientId', label: 'Client ID', required: true, type: 'text', placeholder: 'AYxxxxxxxxxxxxx' },
            { key: 'clientSecret', label: 'Client Secret', required: true, type: 'password' },
            { key: 'environment', label: 'Environment', required: true, type: 'text', value: 'sandbox', disabled: true }
          ]),
          production: createEnvironmentDef('paypal', 'production', [
            { key: 'clientId', label: 'Client ID', required: true, type: 'text', placeholder: 'AYxxxxxxxxxxxxx' },
            { key: 'clientSecret', label: 'Client Secret', required: true, type: 'password' },
            { key: 'environment', label: 'Environment', required: true, type: 'text', value: 'live', disabled: true }
          ])
        },
        description: 'PayPal Payouts API for automatic commission payments. Cost: $0.25 per payout.',
        documentation: 'https://developer.paypal.com/api/rest/'
      },

      // 5. Stripe (NUEVO)
      {
        id: API_IDS.STRIPE,
        name: 'Stripe API',
        apiName: API_NAMES.STRIPE,
        category: API_CATEGORIES.PAYMENT,
        supportsEnvironments: true,
        environments: {
          sandbox: createEnvironmentDef('stripe', 'sandbox', [
            { key: 'publicKey', label: 'Publishable Key', required: true, type: 'text', placeholder: 'pk_test_...' },
            { key: 'secretKey', label: 'Secret Key', required: true, type: 'password', placeholder: 'sk_test_...' },
            { key: 'webhookSecret', label: 'Webhook Secret', required: false, type: 'password', placeholder: 'whsec_...' },
            { key: 'sandbox', label: 'Test Mode', required: true, type: 'boolean', value: true, disabled: true }
          ]),
          production: createEnvironmentDef('stripe', 'production', [
            { key: 'publicKey', label: 'Publishable Key', required: true, type: 'text', placeholder: 'pk_live_...' },
            { key: 'secretKey', label: 'Secret Key', required: true, type: 'password', placeholder: 'sk_live_...' },
            { key: 'webhookSecret', label: 'Webhook Secret', required: false, type: 'password', placeholder: 'whsec_...' },
            { key: 'sandbox', label: 'Test Mode', required: true, type: 'boolean', value: false, disabled: true }
          ])
        },
        description: 'Stripe payment processing API',
        documentation: 'https://stripe.com/docs/api'
      },

      // 6-14: APIs sin ambientes (solo production)
      {
        id: API_IDS.GROQ,
        name: 'GROQ AI API',
        apiName: API_NAMES.GROQ,
        category: API_CATEGORIES.AI,
        supportsEnvironments: false,
        status: configuredMap.has(`groq-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`groq-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`groq-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'apiKey', label: 'API Key', required: true, type: 'password' },
          { key: 'model', label: 'Model', required: false, type: 'text', placeholder: 'llama-3.3-70b-versatile' },
          { key: 'maxTokens', label: 'Max Tokens', required: false, type: 'number', placeholder: '8000' }
        ],
        description: 'GROQ AI for fast LLM inference',
        documentation: 'https://console.groq.com/docs'
      },

      {
        id: API_IDS.OPENAI,
        name: 'OpenAI API',
        apiName: API_NAMES.OPENAI,
        category: API_CATEGORIES.AI,
        supportsEnvironments: false,
        status: configuredMap.has(`openai-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`openai-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`openai-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'apiKey', label: 'API Key', required: true, type: 'password' },
          { key: 'organization', label: 'Organization ID', required: false, type: 'text' },
          { key: 'model', label: 'Model', required: false, type: 'text', placeholder: 'gpt-4' }
        ],
        description: 'OpenAI GPT models',
        documentation: 'https://platform.openai.com/docs/api-reference'
      },

      {
        id: API_IDS.SCRAPERAPI,
        name: 'ScraperAPI',
        apiName: API_NAMES.SCRAPERAPI,
        category: API_CATEGORIES.SCRAPING,
        supportsEnvironments: false,
        status: configuredMap.has(`scraperapi-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`scraperapi-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`scraperapi-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'apiKey', label: 'API Key', required: true, type: 'password' },
          { key: 'premium', label: 'Premium Plan', required: false, type: 'boolean' }
        ],
        description: 'Web scraping API with proxy rotation',
        documentation: 'https://www.scraperapi.com/documentation/'
      },

      {
        id: API_IDS.ZENROWS,
        name: 'ZenRows API',
        apiName: API_NAMES.ZENROWS,
        category: API_CATEGORIES.SCRAPING,
        supportsEnvironments: false,
        status: configuredMap.has(`zenrows-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`zenrows-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`zenrows-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'apiKey', label: 'API Key', required: true, type: 'password' },
          { key: 'premium', label: 'Premium Plan', required: false, type: 'boolean' }
        ],
        description: 'Advanced web scraping with JS rendering',
        documentation: 'https://www.zenrows.com/documentation'
      },

      {
        id: API_IDS.CAPTCHA_2CAPTCHA,
        name: '2Captcha',
        apiName: API_NAMES.CAPTCHA_2CAPTCHA,
        category: API_CATEGORIES.CAPTCHA,
        supportsEnvironments: false,
        status: configuredMap.has(`2captcha-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`2captcha-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`2captcha-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'apiKey', label: 'API Key', required: true, type: 'password' }
        ],
        description: 'Automated CAPTCHA solving service',
        documentation: 'https://2captcha.com/2captcha-api'
      },

      {
        id: API_IDS.ALIEXPRESS,
        name: 'AliExpress Auto-Purchase',
        apiName: API_NAMES.ALIEXPRESS,
        category: API_CATEGORIES.AUTOMATION,
        supportsEnvironments: false,
        status: configuredMap.has(`aliexpress-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`aliexpress-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`aliexpress-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'email', label: 'Email / Username', required: true, type: 'email' },
          { key: 'password', label: 'Password', required: true, type: 'password' },
          { key: 'twoFactorEnabled', label: '2FA Enabled', required: false, type: 'boolean' },
          { key: 'twoFactorSecret', label: '2FA Secret (TOTP)', required: false, type: 'password' }
        ],
        description: 'AliExpress credentials for automated purchasing. Uses browser automation (Puppeteer).',
        documentation: null
      },

      {
        id: API_IDS.ALIEXPRESS_AFFILIATE,
        name: 'AliExpress Affiliate API',
        apiName: API_NAMES.ALIEXPRESS_AFFILIATE,
        category: API_CATEGORIES.SCRAPING,
        supportsEnvironments: false,
        status: configuredMap.has(`aliexpress-affiliate-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`aliexpress-affiliate-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`aliexpress-affiliate-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'appKey', label: 'App Key', required: true, type: 'text', placeholder: '12345678' },
          { key: 'appSecret', label: 'App Secret', required: true, type: 'password' },
          { key: 'trackingId', label: 'Tracking ID (Optional)', required: false, type: 'text', placeholder: 'Your Tracking ID' },
          { key: 'sandbox', label: 'Sandbox', required: true, type: 'boolean', value: false }
        ],
        description: 'Official AliExpress API for extracting product data, prices, and images. Faster and more reliable than scraping. Recommended for opportunity search.',
        documentation: 'https://developer.alibaba.com/help/en/portal'
      },

      {
        id: API_IDS.ALIEXPRESS_DROPSHIPPING,
        name: 'AliExpress Dropshipping API',
        apiName: API_NAMES.ALIEXPRESS_DROPSHIPPING,
        category: API_CATEGORIES.AUTOMATION,
        supportsEnvironments: false,
        status: configuredMap.has(`aliexpress-dropshipping-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`aliexpress-dropshipping-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`aliexpress-dropshipping-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'appKey', label: 'App Key', required: true, type: 'text', placeholder: '12345678' },
          { key: 'appSecret', label: 'App Secret', required: true, type: 'password' },
          { key: 'accessToken', label: 'Access Token', required: true, type: 'password' },
          { key: 'refreshToken', label: 'Refresh Token (Optional)', required: false, type: 'password' },
          { key: 'sandbox', label: 'Sandbox', required: true, type: 'boolean', value: false }
        ],
        description: 'Official AliExpress API for creating automated orders. Faster and more reliable than browser automation. Recommended for automated purchases.',
        documentation: 'https://developer.alibaba.com/help/en/portal'
      },

      // NUEVAS APIs de Notificaciones
      {
        id: API_IDS.EMAIL,
        name: 'Email SMTP',
        apiName: API_NAMES.EMAIL,
        category: API_CATEGORIES.NOTIFICATION,
        supportsEnvironments: false,
        status: configuredMap.has(`email-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`email-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`email-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'host', label: 'SMTP Host', required: true, type: 'text', placeholder: 'smtp.gmail.com' },
          { key: 'port', label: 'SMTP Port', required: true, type: 'number', placeholder: '587' },
          { key: 'user', label: 'Username / Email', required: true, type: 'text' },
          { key: 'password', label: 'Password / App Password', required: true, type: 'password' },
          { key: 'from', label: 'From Email', required: true, type: 'email' },
          { key: 'fromName', label: 'From Name', required: false, type: 'text' },
          { key: 'secure', label: 'Use TLS', required: false, type: 'boolean', value: true }
        ],
        description: 'SMTP email sending via Nodemailer',
        documentation: 'https://nodemailer.com/'
      },

      {
        id: API_IDS.TWILIO,
        name: 'Twilio API',
        apiName: API_NAMES.TWILIO,
        category: API_CATEGORIES.NOTIFICATION,
        supportsEnvironments: false,
        status: configuredMap.has(`twilio-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`twilio-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`twilio-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'accountSid', label: 'Account SID', required: true, type: 'text' },
          { key: 'authToken', label: 'Auth Token', required: true, type: 'password' },
          { key: 'phoneNumber', label: 'Phone Number', required: true, type: 'text', placeholder: '+1234567890' },
          { key: 'whatsappNumber', label: 'WhatsApp Number', required: false, type: 'text', placeholder: 'whatsapp:+14155238886' }
        ],
        description: 'SMS and WhatsApp messaging via Twilio',
        documentation: 'https://www.twilio.com/docs/usage/api'
      },

      {
        id: API_IDS.SLACK,
        name: 'Slack API',
        apiName: API_NAMES.SLACK,
        category: API_CATEGORIES.NOTIFICATION,
        supportsEnvironments: false,
        status: configuredMap.has(`slack-production`) ? 'configured' : 'not_configured',
        isActive: configuredMap.get(`slack-production`)?.isActive || false,
        lastUpdated: configuredMap.get(`slack-production`)?.updatedAt?.toISOString() || null,
        fields: [
          { key: 'webhookUrl', label: 'Webhook URL', required: false, type: 'text', placeholder: 'https://hooks.slack.com/services/...' },
          { key: 'botToken', label: 'Bot Token', required: false, type: 'password', placeholder: 'xoxb-...' },
          { key: 'channel', label: 'Default Channel', required: false, type: 'text', placeholder: '#notifications' }
        ],
        description: 'Slack team notifications. Requires either Webhook URL or Bot Token.',
        documentation: 'https://api.slack.com/'
      }
    ];

    // Calcular estadísticas
    const summary = {
      total: apis.length,
      withEnvironments: apis.filter(a => a.supportsEnvironments).length,
      configured: configured.length,
      active: configured.filter(c => c.isActive).length,
      byCategory: {
        marketplace: apis.filter(a => a.category === API_CATEGORIES.MARKETPLACE).length,
        ai: apis.filter(a => a.category === API_CATEGORIES.AI).length,
        scraping: apis.filter(a => a.category === API_CATEGORIES.SCRAPING).length,
        payment: apis.filter(a => a.category === API_CATEGORIES.PAYMENT).length,
        notification: apis.filter(a => a.category === API_CATEGORIES.NOTIFICATION).length,
        captcha: apis.filter(a => a.category === API_CATEGORIES.CAPTCHA).length,
        automation: apis.filter(a => a.category === API_CATEGORIES.AUTOMATION).length,
      }
    };

    res.json({
      success: true,
      data: apis,
      summary
    });
  } catch (error) {
    console.error('Error fetching API configs:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración de APIs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST, GET, DELETE para /api/settings/apis/:apiName
 * 
 * NOTA: Estos endpoints están deprecados.
 * Usar /api/credentials en su lugar (api-credentials.routes.ts)
 */
router.all('/apis/:apiId', authenticate, (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use /api/credentials instead.',
    migration: {
      'GET /api/settings/apis/:apiId': 'GET /api/credentials/:apiName?environment=sandbox|production',
      'POST /api/settings/apis/:apiId': 'POST /api/credentials with { apiName, environment, credentials }',
      'DELETE /api/settings/apis/:apiId': 'DELETE /api/credentials/:apiName?environment=sandbox|production'
    }
  });
});

/**
 * GET /api/settings
 * Obtener settings del usuario actual
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userSettingsService = (await import('../services/user-settings.service')).default;
    const settings = await userSettingsService.getUserSettings(userId);

    res.json({
      success: true,
      data: {
        language: settings.language,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        currencyFormat: settings.currencyFormat,
        theme: settings.theme
      }
    });
  } catch (error: any) {
    const { logger } = await import('../config/logger');
    logger.error('Error getting user settings', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración',
      error: error?.message || 'Unknown error'
    });
  }
});

/**
 * POST /api/settings
 * Actualizar settings del usuario actual
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userSettingsService = (await import('../services/user-settings.service')).default;
    const { language, timezone, dateFormat, currencyFormat, theme } = req.body;

    // Validar que al menos un campo esté presente
    if (!language && !timezone && !dateFormat && !currencyFormat && !theme) {
      return res.status(400).json({
        success: false,
        message: 'Al menos un campo debe estar presente para actualizar'
      });
    }

    const settings = await userSettingsService.updateUserSettings(userId, {
      language,
      timezone,
      dateFormat,
      currencyFormat,
      theme
    });

    res.json({
      success: true,
      message: 'Configuración actualizada correctamente',
      data: {
        language: settings.language,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        currencyFormat: settings.currencyFormat,
        theme: settings.theme
      }
    });
  } catch (error: any) {
    const { logger } = await import('../config/logger');
    logger.error('Error updating user settings', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: error?.message || 'Error al actualizar configuración',
      error: error?.message || 'Unknown error'
    });
  }
});

/**
 * ✅ LÍMITE DE PRODUCTOS PENDIENTES
 * GET /api/settings/pending-products-limit
 * Obtener límite configurado y estado actual
 */
router.get('/pending-products-limit', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // Solo admins pueden ver/editar el límite
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Solo administradores pueden acceder a esta configuración'
      });
    }

    const { pendingProductsLimitService } = await import('../services/pending-products-limit.service');
    const limit = await pendingProductsLimitService.getMaxPendingProducts();
    const limitInfo = await pendingProductsLimitService.getLimitInfo(undefined, true);

    res.json({
      success: true,
      data: {
        limit,
        ...limitInfo
      }
    });
  } catch (error: any) {
    const { logger } = await import('../config/logger');
    logger.error('Error getting pending products limit', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener límite de productos pendientes',
      error: error?.message || 'Unknown error'
    });
  }
});

/**
 * ✅ LÍMITE DE PRODUCTOS PENDIENTES
 * POST /api/settings/pending-products-limit
 * Configurar límite máximo de productos pendientes (solo admin)
 */
router.post('/pending-products-limit', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // Solo admins pueden configurar el límite
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Solo administradores pueden configurar el límite'
      });
    }

    const { limit } = req.body;

    if (typeof limit !== 'number' || limit < 10 || limit > 5000) {
      return res.status(400).json({
        success: false,
        error: 'El límite debe ser un número entre 10 y 5000'
      });
    }

    const { pendingProductsLimitService } = await import('../services/pending-products-limit.service');
    await pendingProductsLimitService.setMaxPendingProducts(limit);

    const limitInfo = await pendingProductsLimitService.getLimitInfo(undefined, true);

    res.json({
      success: true,
      message: `Límite de productos pendientes actualizado a ${limit}`,
      data: {
        limit,
        ...limitInfo
      }
    });
  } catch (error: any) {
    const { logger } = await import('../config/logger');
    logger.error('Error setting pending products limit', {
      error: error?.message || String(error),
      userId: req.user?.userId,
      limit: req.body?.limit
    });
    res.status(500).json({
      success: false,
      message: error?.message || 'Error al configurar límite de productos pendientes',
      error: error?.message || 'Unknown error'
    });
  }
});

export default router;
