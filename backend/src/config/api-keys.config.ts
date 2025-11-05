/**
 * Configuración centralizada de nombres de API keys
 * 
 * Este archivo define todos los nombres de variables de entorno y credenciales
 * de manera consistente en toda la aplicación.
 * 
 * IMPORTANTE: Usar estas constantes en lugar de strings hardcodeados
 */

export const API_KEY_NAMES = {
  EBAY: {
    // Sandbox Environment
    SANDBOX: {
      APP_ID: 'EBAY_SANDBOX_APP_ID',
      DEV_ID: 'EBAY_SANDBOX_DEV_ID',
      CERT_ID: 'EBAY_SANDBOX_CERT_ID',
      AUTH_TOKEN: 'EBAY_SANDBOX_AUTH_TOKEN',
      REFRESH_TOKEN: 'EBAY_SANDBOX_REFRESH_TOKEN',
    },
    // Production Environment
    PRODUCTION: {
      APP_ID: 'EBAY_PRODUCTION_APP_ID',
      DEV_ID: 'EBAY_PRODUCTION_DEV_ID',
      CERT_ID: 'EBAY_PRODUCTION_CERT_ID',
      AUTH_TOKEN: 'EBAY_PRODUCTION_AUTH_TOKEN',
      REFRESH_TOKEN: 'EBAY_PRODUCTION_REFRESH_TOKEN',
    },
    // Legacy keys (para migración gradual)
    LEGACY: {
      APP_ID: 'EBAY_APP_ID',
      DEV_ID: 'EBAY_DEV_ID',
      CERT_ID: 'EBAY_CERT_ID',
      AUTH_TOKEN: 'EBAY_AUTH_TOKEN',
      USER_TOKEN: 'EBAY_USER_TOKEN', // demo-server.ts
      OAUTH_TOKEN: 'EBAY_OAUTH_TOKEN', // ebay.service.ts
    }
  },

  AMAZON: {
    // Sandbox Environment
    SANDBOX: {
      SELLER_ID: 'AMAZON_SANDBOX_SELLER_ID',
      CLIENT_ID: 'AMAZON_SANDBOX_CLIENT_ID',
      CLIENT_SECRET: 'AMAZON_SANDBOX_CLIENT_SECRET',
      REFRESH_TOKEN: 'AMAZON_SANDBOX_REFRESH_TOKEN',
      ACCESS_KEY_ID: 'AMAZON_SANDBOX_ACCESS_KEY_ID',
      SECRET_ACCESS_KEY: 'AMAZON_SANDBOX_SECRET_ACCESS_KEY',
      REGION: 'AMAZON_SANDBOX_REGION',
      MARKETPLACE_ID: 'AMAZON_SANDBOX_MARKETPLACE_ID',
    },
    // Production Environment
    PRODUCTION: {
      SELLER_ID: 'AMAZON_PRODUCTION_SELLER_ID',
      CLIENT_ID: 'AMAZON_PRODUCTION_CLIENT_ID',
      CLIENT_SECRET: 'AMAZON_PRODUCTION_CLIENT_SECRET',
      REFRESH_TOKEN: 'AMAZON_PRODUCTION_REFRESH_TOKEN',
      ACCESS_KEY_ID: 'AMAZON_PRODUCTION_ACCESS_KEY_ID',
      SECRET_ACCESS_KEY: 'AMAZON_PRODUCTION_SECRET_ACCESS_KEY',
      REGION: 'AMAZON_PRODUCTION_REGION',
      MARKETPLACE_ID: 'AMAZON_PRODUCTION_MARKETPLACE_ID',
    },
    // Legacy keys
    LEGACY: {
      ACCESS_KEY: 'AMAZON_ACCESS_KEY', // demo-server.ts
      SECRET_KEY: 'AMAZON_SECRET_KEY', // demo-server.ts
      ASSOCIATE_TAG: 'AMAZON_ASSOCIATE_TAG', // demo-server.ts
      AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID', // amazon.service.ts
      AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY', // amazon.service.ts
    }
  },

  MERCADOLIBRE: {
    // Sandbox Environment (test user)
    SANDBOX: {
      CLIENT_ID: 'MERCADOLIBRE_SANDBOX_CLIENT_ID',
      CLIENT_SECRET: 'MERCADOLIBRE_SANDBOX_CLIENT_SECRET',
      ACCESS_TOKEN: 'MERCADOLIBRE_SANDBOX_ACCESS_TOKEN',
      REFRESH_TOKEN: 'MERCADOLIBRE_SANDBOX_REFRESH_TOKEN',
      USER_ID: 'MERCADOLIBRE_SANDBOX_USER_ID',
    },
    // Production Environment
    PRODUCTION: {
      CLIENT_ID: 'MERCADOLIBRE_PRODUCTION_CLIENT_ID',
      CLIENT_SECRET: 'MERCADOLIBRE_PRODUCTION_CLIENT_SECRET',
      ACCESS_TOKEN: 'MERCADOLIBRE_PRODUCTION_ACCESS_TOKEN',
      REFRESH_TOKEN: 'MERCADOLIBRE_PRODUCTION_REFRESH_TOKEN',
      USER_ID: 'MERCADOLIBRE_PRODUCTION_USER_ID',
    },
    // Legacy keys
    LEGACY: {
      CLIENT_ID: 'MERCADOLIBRE_CLIENT_ID',
      CLIENT_SECRET: 'MERCADOLIBRE_CLIENT_SECRET',
      ACCESS_TOKEN: 'MERCADOLIBRE_ACCESS_TOKEN',
      REFRESH_TOKEN: 'MERCADOLIBRE_REFRESH_TOKEN',
    }
  },

  GROQ: {
    API_KEY: 'GROQ_API_KEY',
    MODEL: 'GROQ_MODEL', // llama-3.3-70b-versatile
    MAX_TOKENS: 'GROQ_MAX_TOKENS',
  },

  OPENAI: {
    API_KEY: 'OPENAI_API_KEY',
    ORGANIZATION: 'OPENAI_ORGANIZATION',
    MODEL: 'OPENAI_MODEL',
  },

  SCRAPERAPI: {
    API_KEY: 'SCRAPERAPI_KEY',
    PREMIUM: 'SCRAPERAPI_PREMIUM', // boolean
  },

  ZENROWS: {
    API_KEY: 'ZENROWS_API_KEY',
    PREMIUM: 'ZENROWS_PREMIUM',
  },

  CAPTCHA_2CAPTCHA: {
    API_KEY: 'CAPTCHA_2CAPTCHA_KEY',
  },

  PAYPAL: {
    // Sandbox Environment
    SANDBOX: {
      CLIENT_ID: 'PAYPAL_SANDBOX_CLIENT_ID',
      CLIENT_SECRET: 'PAYPAL_SANDBOX_CLIENT_SECRET',
      ENVIRONMENT: 'PAYPAL_SANDBOX_ENVIRONMENT', // 'sandbox'
    },
    // Production Environment
    PRODUCTION: {
      CLIENT_ID: 'PAYPAL_PRODUCTION_CLIENT_ID',
      CLIENT_SECRET: 'PAYPAL_PRODUCTION_CLIENT_SECRET',
      ENVIRONMENT: 'PAYPAL_PRODUCTION_ENVIRONMENT', // 'live'
    },
    // Legacy keys
    LEGACY: {
      CLIENT_ID: 'PAYPAL_CLIENT_ID',
      CLIENT_SECRET: 'PAYPAL_CLIENT_SECRET',
      ENVIRONMENT: 'PAYPAL_ENVIRONMENT',
    }
  },

  ALIEXPRESS: {
    // No tiene API oficial, usa Puppeteer
    EMAIL: 'ALIEXPRESS_EMAIL',
    PASSWORD: 'ALIEXPRESS_PASSWORD',
    TWO_FA_ENABLED: 'ALIEXPRESS_2FA_ENABLED',
    TWO_FA_SECRET: 'ALIEXPRESS_2FA_SECRET', // Para TOTP
  },

  EMAIL: {
    HOST: 'EMAIL_HOST',
    PORT: 'EMAIL_PORT',
    USER: 'EMAIL_USER',
    PASSWORD: 'EMAIL_PASSWORD',
    FROM: 'EMAIL_FROM',
    FROM_NAME: 'EMAIL_FROM_NAME',
    SECURE: 'EMAIL_SECURE', // boolean (TLS)
  },

  TWILIO: {
    ACCOUNT_SID: 'TWILIO_ACCOUNT_SID',
    AUTH_TOKEN: 'TWILIO_AUTH_TOKEN',
    PHONE_NUMBER: 'TWILIO_PHONE_NUMBER',
    WHATSAPP_NUMBER: 'TWILIO_WHATSAPP_NUMBER', // whatsapp:+14155238886
  },

  SLACK: {
    WEBHOOK_URL: 'SLACK_WEBHOOK_URL',
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL: 'SLACK_CHANNEL',
  },

  STRIPE: {
    // Sandbox Environment
    SANDBOX: {
      PUBLIC_KEY: 'STRIPE_SANDBOX_PUBLIC_KEY',
      SECRET_KEY: 'STRIPE_SANDBOX_SECRET_KEY',
      WEBHOOK_SECRET: 'STRIPE_SANDBOX_WEBHOOK_SECRET',
    },
    // Production Environment
    PRODUCTION: {
      PUBLIC_KEY: 'STRIPE_PRODUCTION_PUBLIC_KEY',
      SECRET_KEY: 'STRIPE_PRODUCTION_SECRET_KEY',
      WEBHOOK_SECRET: 'STRIPE_PRODUCTION_WEBHOOK_SECRET',
    },
    // Legacy keys
    LEGACY: {
      PUBLIC_KEY: 'STRIPE_PUBLIC_KEY',
      SECRET_KEY: 'STRIPE_SECRET_KEY',
    }
  },

} as const;

/**
 * Tipos de APIs disponibles
 */
export const API_NAMES = {
  EBAY: 'ebay',
  AMAZON: 'amazon',
  MERCADOLIBRE: 'mercadolibre',
  GROQ: 'groq',
  OPENAI: 'openai',
  SCRAPERAPI: 'scraperapi',
  ZENROWS: 'zenrows',
  CAPTCHA_2CAPTCHA: '2captcha',
  PAYPAL: 'paypal',
  ALIEXPRESS: 'aliexpress',
  EMAIL: 'email',
  TWILIO: 'twilio',
  SLACK: 'slack',
  STRIPE: 'stripe',
} as const;

/**
 * Categorías de APIs
 */
export const API_CATEGORIES = {
  MARKETPLACE: 'marketplace',
  AI: 'ai',
  SCRAPING: 'scraping',
  PAYMENT: 'payment',
  NOTIFICATION: 'notification',
  CAPTCHA: 'captcha',
  AUTOMATION: 'automation',
} as const;

/**
 * Endpoints por ambiente
 */
export const API_ENDPOINTS = {
  EBAY: {
    SANDBOX: 'https://api.sandbox.ebay.com',
    PRODUCTION: 'https://api.ebay.com',
  },
  AMAZON: {
    SANDBOX: 'https://sandbox.sellingpartnerapi-na.amazon.com',
    PRODUCTION: 'https://sellingpartnerapi-na.amazon.com',
  },
  MERCADOLIBRE: {
    SANDBOX: 'https://api.mercadolibre.com', // Usa test users
    PRODUCTION: 'https://api.mercadolibre.com',
  },
  PAYPAL: {
    SANDBOX: 'https://api-m.sandbox.paypal.com',
    PRODUCTION: 'https://api-m.paypal.com',
  },
  STRIPE: {
    SANDBOX: 'https://api.stripe.com',
    PRODUCTION: 'https://api.stripe.com',
  },
} as const;

/**
 * Mapeo de IDs de APIs (para compatibilidad con settings.routes.ts)
 */
export const API_IDS = {
  EBAY: 1,
  AMAZON: 2,
  MERCADOLIBRE: 3,
  GROQ: 4,
  SCRAPERAPI: 5,
  ZENROWS: 6,
  CAPTCHA_2CAPTCHA: 7,
  PAYPAL: 8,
  ALIEXPRESS: 9,
  EMAIL: 10,
  TWILIO: 11,
  SLACK: 12,
  OPENAI: 13,
  STRIPE: 14,
} as const;

/**
 * Helper para obtener nombres de keys según ambiente
 */
export function getApiKeys(apiName: keyof typeof API_KEY_NAMES, environment: 'sandbox' | 'production' = 'production') {
  const api = API_KEY_NAMES[apiName];
  
  if ('SANDBOX' in api && 'PRODUCTION' in api) {
    return environment === 'sandbox' ? api.SANDBOX : api.PRODUCTION;
  }
  
  return api;
}

/**
 * Helper para validar si una API soporta ambientes
 */
export function supportsEnvironments(apiName: string): boolean {
  const api = API_KEY_NAMES[apiName.toUpperCase() as keyof typeof API_KEY_NAMES];
  if (!api) return false;
  return 'SANDBOX' in api && 'PRODUCTION' in api;
}

/**
 * Helper para obtener endpoint según ambiente
 */
export function getApiEndpoint(apiName: string, environment: 'sandbox' | 'production' = 'production'): string | null {
  const endpoints = API_ENDPOINTS[apiName.toUpperCase() as keyof typeof API_ENDPOINTS];
  if (!endpoints) return null;
  return endpoints[environment.toUpperCase() as 'SANDBOX' | 'PRODUCTION'];
}
