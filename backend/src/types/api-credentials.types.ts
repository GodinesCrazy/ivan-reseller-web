/**
 * Tipos de credenciales para todas las APIs
 * 
 * Interfaces TypeScript documentadas que definen exactamente qué campos
 * espera cada servicio para sus credenciales.
 */

/**
 * Credenciales de eBay
 * 
 * @see https://developer.ebay.com/api-docs/static/oauth-credentials.html
 */
export interface EbayCredentials {
  /** eBay Application ID (Client ID) - Obtenido del Developer Portal */
  appId: string;
  
  /** eBay Developer ID - Identifica tu cuenta de desarrollador */
  devId: string;
  
  /** eBay Certificate ID (Client Secret) - Para autenticación */
  certId: string;
  
  /** OAuth 2.0 User Token (opcional, se genera automáticamente) */
  authToken?: string;
  
  /** OAuth 2.0 Refresh Token - Para renovar el access token */
  refreshToken?: string;
  
  /** Si está usando ambiente sandbox (true) o producción (false) */
  sandbox: boolean;
}

/**
 * Credenciales de Amazon SP-API
 * 
 * @see https://developer-docs.amazon.com/sp-api/docs/self-authorization
 */
export interface AmazonCredentials {
  /** Amazon Seller ID (e.g., A2XXXXXXXXXX) */
  sellerId: string;
  
  /** LWA (Login with Amazon) Client ID */
  clientId: string;
  
  /** LWA Client Secret */
  clientSecret: string;
  
  /** LWA Refresh Token - Obtenido después del OAuth flow */
  refreshToken: string;
  
  /** LWA Access Token (opcional, se genera automáticamente) */
  accessToken?: string;
  
  /** AWS Access Key ID - Para firmar requests con AWS SigV4 */
  awsAccessKeyId: string;
  
  /** AWS Secret Access Key - Para firmar requests con AWS SigV4 */
  awsSecretAccessKey: string;
  
  /** AWS Session Token (opcional, para credenciales temporales) */
  awsSessionToken?: string;
  
  /** AWS Region (e.g., us-east-1, eu-west-1) */
  region: string;
  
  /** Amazon Marketplace ID (e.g., ATVPDKIKX0DER for US) */
  marketplaceId: string;
  
  /** Si está usando ambiente sandbox (true) o producción (false) */
  sandbox: boolean;
}

/**
 * Credenciales de MercadoLibre
 * 
 * @see https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion
 */
export interface MercadoLibreCredentials {
  /** App ID (Client ID) */
  clientId: string;
  
  /** Secret Key */
  clientSecret: string;
  
  /** Access Token - Obtenido después del OAuth flow */
  accessToken: string;
  
  /** Refresh Token - Para renovar el access token */
  refreshToken: string;
  
  /** User ID del vendedor */
  userId?: string;
  
  /** Si está usando test user (true) o usuario real (false) */
  sandbox: boolean;
}

/**
 * Credenciales de GROQ AI
 * 
 * @see https://console.groq.com/keys
 */
export interface GroqCredentials {
  /** GROQ API Key */
  apiKey: string;
  
  /** Modelo a usar (e.g., llama-3.3-70b-versatile) */
  model?: string;
  
  /** Máximo de tokens en la respuesta */
  maxTokens?: number;
}

/**
 * Credenciales de OpenAI
 * 
 * @see https://platform.openai.com/api-keys
 */
export interface OpenAICredentials {
  /** OpenAI API Key */
  apiKey: string;
  
  /** Organization ID (opcional) */
  organization?: string;
  
  /** Modelo a usar (e.g., gpt-4, gpt-3.5-turbo) */
  model?: string;
}

/**
 * Credenciales de ScraperAPI
 * 
 * @see https://www.scraperapi.com/
 */
export interface ScraperAPICredentials {
  /** ScraperAPI Key */
  apiKey: string;
  
  /** Si tiene plan premium (más requests, JS rendering, etc.) */
  premium?: boolean;
}

/**
 * Credenciales de ZenRows
 * 
 * @see https://www.zenrows.com/
 */
export interface ZenRowsCredentials {
  /** ZenRows API Key */
  apiKey: string;
  
  /** Si tiene plan premium */
  premium?: boolean;
}

/**
 * Credenciales de 2Captcha
 * 
 * @see https://2captcha.com/
 */
export interface TwoCaptchaCredentials {
  /** 2Captcha API Key */
  apiKey: string;
}

/**
 * Credenciales de PayPal Payouts API
 * 
 * @see https://developer.paypal.com/api/rest/
 */
export interface PayPalCredentials {
  /** PayPal Client ID */
  clientId: string;
  
  /** PayPal Client Secret */
  clientSecret: string;
  
  /** Ambiente: 'sandbox' o 'live' */
  environment: 'sandbox' | 'live';
}

/**
 * Credenciales de AliExpress Affiliate API (AliExpress Portals API)
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * Permite extraer datos de productos, precios, imágenes sin autenticación OAuth
 */
export interface AliExpressAffiliateCredentials {
  /** App Key - Obtenido de la consola de desarrolladores de AliExpress Open Platform */
  appKey: string;
  
  /** App Secret - Para calcular la firma de las peticiones */
  appSecret: string;
  
  /** Tracking ID - ID de afiliado (opcional, para generar enlaces de afiliado) */
  trackingId?: string;
  
  /** Si está usando ambiente sandbox (true) o producción (false) */
  sandbox: boolean;
}

/**
 * Credenciales de AliExpress Dropshipping API
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * Permite obtener detalles de productos y crear órdenes automatizadas
 */
export interface AliExpressDropshippingCredentials {
  /** App Key - Obtenido de la consola de desarrolladores de AliExpress Open Platform */
  appKey: string;
  
  /** App Secret - Para calcular la firma de las peticiones */
  appSecret: string;
  
  /** Access Token - Token OAuth obtenido después del flujo de autorización */
  accessToken: string;
  
  /** Refresh Token - Para renovar el access token cuando expire */
  refreshToken?: string;
  
  /** Si está usando ambiente sandbox (true) o producción (false) */
  sandbox: boolean;
}

/**
 * Credenciales de AliExpress (Puppeteer-based)
 * 
 * Fallback: No tiene API oficial, usa automatización con Puppeteer
 * Se mantiene para retrocompatibilidad
 */
export interface AliExpressCredentials {
  /** Email de la cuenta de AliExpress */
  email: string;
  
  /** Contraseña de la cuenta */
  password: string;
  
  /** Si tiene 2FA habilitado */
  twoFactorEnabled: boolean;
  
  /** Secret para generar códigos TOTP (si tiene 2FA) */
  twoFactorSecret?: string;
  
  /** Cookies guardadas para mantener sesión */
  cookies?: Array<{
    name?: string;
    key?: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    expiry?: number;
  }>;
}

/**
 * Credenciales de Email SMTP (Nodemailer)
 * 
 * @see https://nodemailer.com/
 */
export interface EmailCredentials {
  /** Host del servidor SMTP (e.g., smtp.gmail.com) */
  host: string;
  
  /** Puerto del servidor SMTP (e.g., 587 para TLS, 465 para SSL) */
  port: number;
  
  /** Usuario/email para autenticación */
  user: string;
  
  /** Contraseña o App Password */
  password: string;
  
  /** Email del remitente */
  from: string;
  
  /** Nombre del remitente */
  fromName?: string;
  
  /** Si usa TLS (true) o no (false) */
  secure: boolean;
}

/**
 * Credenciales de Twilio (SMS/WhatsApp)
 * 
 * @see https://www.twilio.com/docs/usage/api
 */
export interface TwilioCredentials {
  /** Twilio Account SID */
  accountSid: string;
  
  /** Twilio Auth Token */
  authToken: string;
  
  /** Número de teléfono de Twilio (para SMS) */
  phoneNumber: string;
  
  /** Número de WhatsApp de Twilio (opcional, formato: whatsapp:+14155238886) */
  whatsappNumber?: string;
}

/**
 * Credenciales de Slack
 * 
 * @see https://api.slack.com/
 */
export interface SlackCredentials {
  /** Webhook URL de Slack (para notificaciones simples) */
  webhookUrl?: string;
  
  /** Bot Token (para API completa) */
  botToken?: string;
  
  /** Canal por defecto para notificaciones */
  channel?: string;
}

/**
 * Credenciales de Stripe
 * 
 * @see https://stripe.com/docs/api
 */
export interface StripeCredentials {
  /** Stripe Publishable Key (para frontend) */
  publicKey: string;
  
  /** Stripe Secret Key (para backend) */
  secretKey: string;
  
  /** Webhook Signing Secret (para verificar webhooks) */
  webhookSecret?: string;
  
  /** Si está usando test keys (true) o live keys (false) */
  sandbox: boolean;
}

/**
 * Tipo unión de todas las credenciales
 */
export type ApiCredentials =
  | EbayCredentials
  | AmazonCredentials
  | MercadoLibreCredentials
  | GroqCredentials
  | OpenAICredentials
  | ScraperAPICredentials
  | ZenRowsCredentials
  | TwoCaptchaCredentials
  | PayPalCredentials
  | AliExpressCredentials
  | AliExpressAffiliateCredentials
  | AliExpressDropshippingCredentials
  | EmailCredentials
  | TwilioCredentials
  | SlackCredentials
  | StripeCredentials;

/**
 * Mapeo de nombre de API a tipo de credenciales
 */
export type ApiCredentialsMap = {
  ebay: EbayCredentials;
  amazon: AmazonCredentials;
  mercadolibre: MercadoLibreCredentials;
  groq: GroqCredentials;
  openai: OpenAICredentials;
  scraperapi: ScraperAPICredentials;
  zenrows: ZenRowsCredentials;
  '2captcha': TwoCaptchaCredentials;
  paypal: PayPalCredentials;
  aliexpress: AliExpressCredentials; // Puppeteer-based (legacy)
  'aliexpress-affiliate': AliExpressAffiliateCredentials; // Affiliate API oficial
  'aliexpress-dropshipping': AliExpressDropshippingCredentials; // Dropshipping API oficial
  email: EmailCredentials;
  twilio: TwilioCredentials;
  slack: SlackCredentials;
  stripe: StripeCredentials;
};

/**
 * Nombres de APIs válidos
 */
export type ApiName = keyof ApiCredentialsMap;

/**
 * Ambiente de ejecución
 */
export type ApiEnvironment = 'sandbox' | 'production';

/**
 * Estado de configuración de una API
 */
export type ApiStatus = 'configured' | 'not_configured' | 'error';

/**
 * Capacidades de una API
 */
export interface ApiCapabilities {
  /** Puede listar productos */
  canListProducts?: boolean;
  
  /** Puede obtener detalles de productos */
  canGetProductDetails?: boolean;
  
  /** Puede actualizar inventario */
  canUpdateInventory?: boolean;
  
  /** Puede procesar órdenes */
  canProcessOrders?: boolean;
  
  /** Puede enviar notificaciones */
  canSendNotifications?: boolean;
  
  /** Puede realizar scraping */
  canScrape?: boolean;
  
  /** Puede resolver captchas */
  canSolveCaptcha?: boolean;
  
  /** Puede realizar pagos */
  canProcessPayments?: boolean;
  
  /** Puede generar contenido con IA */
  canGenerateContent?: boolean;
}

/**
 * Información de una API
 */
export interface ApiInfo {
  /** ID numérico de la API */
  id: number;
  
  /** Nombre de la API */
  name: string;
  
  /** Nombre interno (para base de datos) */
  apiName: ApiName;
  
  /** Categoría */
  category: string;
  
  /** Si soporta ambientes sandbox/production */
  supportsEnvironments: boolean;
  
  /** Estado de configuración */
  status: ApiStatus;
  
  /** Capacidades */
  capabilities?: ApiCapabilities;
  
  /** Ambiente activo (si soporta ambientes) */
  activeEnvironment?: ApiEnvironment;
}
