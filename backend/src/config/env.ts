import { z } from 'zod';
import dotenv from 'dotenv';

const portFromShell = process.env.PORT;
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
if (portFromShell) process.env.PORT = portFromShell;

function getDatabaseUrl(): string {
  // Intentar múltiples nombres de variables comunes en Railway
  // Railway puede usar diferentes nombres según la configuración
  const possibleNames = [
    'DATABASE_URL',           // Prioridad 1: Variable estándar
    'DATABASE_PUBLIC_URL',    // Prioridad 2: Railway a veces usa este nombre
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_PRISMA_URL',
    'PGDATABASE',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL_POOLING',
  ];

  let dbUrl = '';
  let foundName = '';

  for (const name of possibleNames) {
    if (process.env[name]) {
      dbUrl = process.env[name];
      foundName = name;
      break;
    }
  }

  // Si no encontramos ninguna, buscar variables que contengan "DATABASE" o "POSTGRES"
  if (!dbUrl) {
    const dbRelatedVars = Object.keys(process.env).filter(
      k => (k.includes('DATABASE') || k.includes('POSTGRES')) && 
           process.env[k]?.startsWith('postgres')
    );
    
    if (dbRelatedVars.length > 0) {
      console.warn(`⚠️  DATABASE_URL no encontrada, pero se encontraron variables relacionadas: ${dbRelatedVars.join(', ')}`);
      // Intentar usar la primera que parezca válida
      for (const varName of dbRelatedVars) {
        const value = process.env[varName];
        if (value && (value.startsWith('postgresql://') || value.startsWith('postgres://'))) {
          dbUrl = value;
          foundName = varName;
          console.warn(`   → Usando ${varName} como DATABASE_URL`);
          break;
        }
      }
    }
  }

  if (dbUrl) {
    // Verificar si es una referencia de Railway sin resolver
    if (dbUrl.startsWith('{{') && dbUrl.endsWith('}}')) {
      console.error('❌ ERROR: Variable Reference no resuelta por Railway');
      console.error(`   Variable: ${foundName || 'desconocida'}`);
      console.error('   Railway debería resolver automáticamente las referencias {{Service.Variable}}');
      console.error('   Solución: Copia el valor real de la variable en lugar de usar la referencia');
      console.error('');
      return ''; // Retornar vacío para que el código muestre el error apropiado
    }
    
    try {
      // Verificar si la URL está incompleta o mal formada
      if (dbUrl.includes('://:@') || dbUrl.endsWith('://') || dbUrl === 'postgresql://' || dbUrl === 'postgres://') {
        console.error('❌ ERROR: DATABASE_URL está incompleta o mal formada');
        console.error(`   Variable: ${foundName || 'desconocida'}`);
        console.error('   La URL debe tener el formato completo:');
        console.error('   postgresql://usuario:contraseña@host:puerto/base_de_datos');
        console.error('');
        console.error('🔧 SOLUCIÓN:');
        console.error('   1. Ve a Railway Dashboard → Postgres → Variables');
        console.error('   2. Busca DATABASE_URL (interna) o DATABASE_PUBLIC_URL (pública)');
        console.error('   3. Click en el ojo 👁️ para VER el valor completo');
        console.error('   4. Click en copiar 📋 para copiar TODO el valor');
        console.error('   5. Ve a ivan-reseller-web → Variables → DATABASE_URL');
        console.error('   6. Pega el valor completo (debe empezar con postgresql://)');
        console.error('   💡 Recomendación: Usa DATABASE_URL (interna) si estás en Railway');
        console.error('');
        return '';
      }
      
      // Mostrar información de debugging (sin mostrar la contraseña completa)
      const url = new URL(dbUrl);
      
      // Verificar que tenga los componentes necesarios
      if (!url.hostname || !url.username || !url.pathname) {
        console.error('❌ ERROR: DATABASE_URL está incompleta');
        console.error(`   Hostname: ${url.hostname || 'FALTA'}`);
        console.error(`   Username: ${url.username || 'FALTA'}`);
        console.error(`   Database: ${url.pathname || 'FALTA'}`);
        console.error('   La URL debe tener host, usuario y base de datos');
        return '';
      }
      
      // Parse succeeds: keep validation quiet so credentials and connection metadata never
      // leak into runtime logs or test output.
    } catch (e) {
      console.error('⚠️  No se pudo parsear DATABASE_URL:', e);
      console.error(`   Variable: ${foundName || 'desconocida'}`);
      console.error('');
      console.error('🔧 SOLUCIÓN:');
      console.error('   1. Ve a Railway Dashboard → Postgres → Variables');
      console.error('   2. Busca DATABASE_URL (interna) o DATABASE_PUBLIC_URL (pública)');
      console.error('   3. Click en el ojo 👁️ para VER el valor completo');
      console.error('   4. Click en copiar 📋 para copiar TODO el valor');
      console.error('   5. Ve a ivan-reseller-web → Variables → DATABASE_URL');
      console.error('   6. Pega el valor completo (debe empezar con postgresql://)');
      console.error('   💡 Recomendación: Usa DATABASE_URL (interna) si estás en Railway');
      console.error('');
    }
  } else {
    console.error('❌ ERROR: DATABASE_URL no encontrada');
    const allDbVars = Object.keys(process.env).filter(
      k => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')
    );
    console.error(`   Variables relacionadas encontradas: ${allDbVars.length > 0 ? allDbVars.join(', ') : 'ninguna'}`);
  }

  return dbUrl;
}

const databaseUrl = getDatabaseUrl();

// ✅ FIX 502: Hacer DATABASE_URL opcional para permitir arranque en modo degradado
// El servidor debe poder arrancar incluso sin DB para que /api/health responda
const databaseUrlSchema = z.string()
  .refine(
    (url) => {
      // Si está vacía, es válida (modo degradado)
      if (!url || url.trim().length === 0) return true;
      // Si tiene contenido, debe ser URL válida y empezar con postgresql:// o postgres://
      try {
        new URL(url);
        return url.startsWith('postgresql://') || url.startsWith('postgres://');
      } catch {
        return false;
      }
    },
    { 
      message: 'DATABASE_URL debe estar vacía o ser una URL válida que empiece con postgresql:// o postgres://',
    }
  )
  .optional()
  .default(''); // Default vacío para permitir arranque sin DB

// Función para obtener y validar REDIS_URL
function getRedisUrl(): string {
  const possibleNames = [
    'REDIS_URL',
    'REDISCLOUD_URL',
    'REDIS_TLS_URL',
  ];

  let redisUrl = '';
  let foundName = '';

  for (const name of possibleNames) {
    if (process.env[name]) {
      redisUrl = process.env[name];
      foundName = name;
      break;
    }
  }

  if (redisUrl) {
    try {
      // Verificar formato básico
      if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
        console.warn('⚠️  REDIS_URL no tiene formato estándar (debe empezar con redis:// o rediss://)');
      }
    } catch (e) {
      console.warn('⚠️  No se pudo parsear REDIS_URL:', e);
    }
  } else {
    console.warn('⚠️  REDIS_URL no encontrada - usando valor por defecto (redis://localhost:6379)');
    console.warn('   El sistema funcionará pero sin cache distribuido');
  }

  return redisUrl || 'redis://localhost:6379';
}

const redisUrl = getRedisUrl();

// Validación de REDIS_URL
const redisUrlSchema = z.string()
  .refine(
    (url) => !url || url.startsWith('redis://') || url.startsWith('rediss://'),
    { 
      message: 'REDIS_URL debe empezar con redis:// o rediss://',
    }
  )
  .default('redis://localhost:6379');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  // ✅ FIX: SAFE_BOOT default false - solo activar explícitamente si hay problemas
  // SAFE_BOOT solo desactiva workers pesados, NO Express
  // Express SIEMPRE debe iniciar para que la app funcione
  SAFE_BOOT: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  API_URL: z.string().url().default('http://localhost:4000'),
  BACKEND_URL: z.string().url().optional(), // Canonical backend public URL (used for OAuth callbacks)
  FRONTEND_URL: z.string().url().optional(),
  WEB_BASE_URL: z.string().url().optional(), // Frontend web URL (used for post-OAuth UI redirects)
  DATABASE_URL: databaseUrlSchema,
  REDIS_URL: redisUrlSchema,
  JWT_SECRET: z.string().default(''), // Phase 6: optional at parse - server validates without exit
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Optional external APIs
  EBAY_APP_ID: z.string().optional(),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_REDIRECT_URI: z.string().optional(),
  EBAY_DEV_ID: z.string().optional(),
  EBAY_CERT_ID: z.string().optional(),
  /** eBay US listing: min business-day range when no supplier ETA exists in productData (conservative for CN→US dropship) */
  EBAY_US_DELIVERY_FALLBACK_MIN_DAYS: z
    .string()
    .optional()
    .transform((val) => {
      if (val == null || val === '') return 15;
      const n = parseInt(val, 10);
      return Number.isFinite(n) && n > 0 ? n : 15;
    }),
  /** eBay US listing: max business-day range when no supplier ETA exists in productData */
  EBAY_US_DELIVERY_FALLBACK_MAX_DAYS: z
    .string()
    .optional()
    .transform((val) => {
      if (val == null || val === '') return 42;
      const n = parseInt(val, 10);
      return Number.isFinite(n) && n > 0 ? n : 42;
    }),
  /** Extra min days added to supplier transit estimate (payment → supplier ships) */
  EBAY_US_DELIVERY_PROCESSING_MIN_DAYS: z
    .string()
    .optional()
    .transform((val) => {
      if (val == null || val === '') return 3;
      const n = parseInt(val, 10);
      return Number.isFinite(n) && n >= 0 ? n : 3;
    }),
  /** Extra max days added to supplier transit estimate */
  EBAY_US_DELIVERY_PROCESSING_MAX_DAYS: z
    .string()
    .optional()
    .transform((val) => {
      if (val == null || val === '') return 8;
      const n = parseInt(val, 10);
      return Number.isFinite(n) && n >= 0 ? n : 8;
    }),
  /**
   * Extra business days added to both ends of the published ETA range (automated multi-supplier dropship:
   * order routing, varied ship-from cities in China).
   */
  EBAY_US_AUTOMATED_DROPSHIP_PAD_MIN_DAYS: z
    .string()
    .optional()
    .transform((val) => {
      if (val == null || val === '') return 2;
      const n = parseInt(val, 10);
      return Number.isFinite(n) && n >= 0 ? n : 2;
    }),
  EBAY_US_AUTOMATED_DROPSHIP_PAD_MAX_DAYS: z
    .string()
    .optional()
    .transform((val) => {
      if (val == null || val === '') return 5;
      const n = parseInt(val, 10);
      return Number.isFinite(n) && n >= 0 ? n : 5;
    }),
  /** When true, do not append the China-US estimated delivery block to eBay descriptions */
  EBAY_US_SKIP_DELIVERY_NOTICE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /**
   * If set, createOffer always uses this eBay inventory merchantLocationKey (must exist or be creatable).
   * Overrides EBAY_INVENTORY_SHIP_FROM when non-empty.
   */
  EBAY_MERCHANT_LOCATION_KEY: z
    .string()
    .optional()
    .transform((val) => {
      const s = String(val || '').trim();
      return s.length > 0 ? s.slice(0, 36) : undefined;
    }),
  /**
   * Ship-from preference when resolving inventory location for new eBay US offers:
   * CN (default, dropship from China), US, LEGACY (prefer CL then first — old behavior).
   */
  EBAY_INVENTORY_SHIP_FROM: z
    .string()
    .optional()
    .transform((val) => {
      const u = String(val || 'CN').trim().toUpperCase();
      if (u === 'US' || u === 'LEGACY') return u as 'US' | 'LEGACY';
      return 'CN';
    }),
  /** When true and ship-from is CN, POST a China WAREHOUSE location if none exists */
  EBAY_AUTO_CREATE_CN_INVENTORY_LOCATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  /** merchantLocationKey used when auto-creating China warehouse (max 36) */
  EBAY_CN_MERCHANT_LOCATION_KEY: z
    .string()
    .optional()
    .transform((val) => {
      const s = String(val || 'china_dropship').trim().slice(0, 36);
      return s || 'china_dropship';
    }),
  EBAY_CN_LOCATION_NAME: z
    .string()
    .optional()
    .transform((val) => (String(val || '').trim() || 'China dropship warehouse').slice(0, 100)),
  EBAY_CN_LOCATION_CITY: z
    .string()
    .optional()
    .transform((val) => String(val || '').trim() || 'Shenzhen'),
  EBAY_CN_LOCATION_STATE: z
    .string()
    .optional()
    .transform((val) => String(val || '').trim() || 'Guangdong'),
  EBAY_CN_LOCATION_POSTAL_CODE: z
    .string()
    .optional()
    .transform((val) => String(val || '').trim() || '518000'),
  /**
   * Note on the China inventory location (eBay locationAdditionalInformation).
   * Default copy explains multi-supplier dropship; override with EBAY_CN_LOCATION_ADDITIONAL_INFO or disable with EBAY_CN_SKIP_LOCATION_ADDITIONAL_INFO=true.
   */
  EBAY_CN_LOCATION_ADDITIONAL_INFO: z
    .string()
    .optional()
    .transform((val) => {
      const fallback =
        'Orders are fulfilled by partner warehouses in China; ship-from region may vary by supplier.';
      const raw = String(val ?? '').trim();
      return (raw.length > 0 ? raw : fallback).slice(0, 256);
    }),
  /** When true, do not send locationAdditionalInformation on the China inventory location */
  EBAY_CN_SKIP_LOCATION_ADDITIONAL_INFO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  SCRAPER_API_KEY: z.string().optional(),
  ZENROWS_API_KEY: z.string().optional(),
  MERCADOLIBRE_CLIENT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_SECRET: z.string().optional(),
  /** Fallback cuando no hay credenciales ML en DB (Railway / single-tenant) */
  MERCADOLIBRE_ACCESS_TOKEN: z.string().optional(),
  MERCADOLIBRE_REFRESH_TOKEN: z.string().optional(),
  MERCADOLIBRE_SITE_ID: z.string().default('MLC'),
  MERCADOLIBRE_REDIRECT_URI: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  /**
   * Single-store Shopify target for Dev Dashboard app auth.
   * Accepts store handle, full myshopify domain, or https://{shop}.myshopify.com URL.
   */
  SHOPIFY_SHOP: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().regex(/^\d{4}-\d{2}$/).default('2026-04'),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  PAYPAL_ENV: z.enum(['sandbox', 'live']).optional(), // Alias for PAYPAL_ENVIRONMENT (live = production)
  GROQ_API_KEY: z.string().optional(),
  SCRAPERAPI_KEY: z.string().optional(),
  
  // ✅ FASE 1: API Health Check Feature Flags
  API_HEALTHCHECK_ENABLED: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  API_HEALTHCHECK_MODE: z.enum(['sync', 'async']).default('async'),
  API_HEALTHCHECK_INTERVAL_MS: z.string().optional().transform(val => val ? parseInt(val, 10) : 15 * 60 * 1000), // 15 min default
  
  // ✅ FASE 2: Scraper Bridge Configuration
  SCRAPER_BRIDGE_URL: z.string().url().optional(),
  SCRAPER_BRIDGE_ENABLED: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  SCRAPER_FALLBACK_TO_STEALTH: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  
  // ✅ FASE 3: Webhook Signature Validation
  WEBHOOK_VERIFY_SIGNATURE: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  WEBHOOK_VERIFY_SIGNATURE_EBAY: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  WEBHOOK_VERIFY_SIGNATURE_AMAZON: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  WEBHOOK_VERIFY_SIGNATURE_SHOPIFY: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  WEBHOOK_SECRET_EBAY: z.string().optional(),
  WEBHOOK_SECRET_MERCADOLIBRE: z.string().optional(),
  WEBHOOK_SECRET_AMAZON: z.string().optional(),
  WEBHOOK_SECRET_SHOPIFY: z.string().optional(),
  WEBHOOK_ALLOW_INVALID_SIGNATURE: z.enum(['true', 'false']).default('false').transform(val => val === 'true'), // Solo dev
  
  // Allow purchase when PayPal balance is low but user has linked card (PayPal will use card as backup)
  ALLOW_PURCHASE_WHEN_LOW_BALANCE: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  PURCHASE_LOW_BALANCE_MAX_ORDER_USD: z.string().optional().transform(val => val ? parseFloat(val) : 500),
  
  // ✅ FASE 4: Auto-Purchase Guardrails
  AUTO_PURCHASE_ENABLED: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  AUTO_PURCHASE_MODE: z.enum(['sandbox', 'production']).default('sandbox'),
  AUTO_PURCHASE_DRY_RUN: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  AUTO_PURCHASE_DAILY_LIMIT: z.string().optional().transform(val => val ? parseFloat(val) : 1000), // $1000 por defecto
  AUTO_PURCHASE_MONTHLY_LIMIT: z.string().optional().transform(val => val ? parseFloat(val) : 10000), // $10k por defecto
  AUTO_PURCHASE_MAX_PER_ORDER: z.string().optional().transform(val => val ? parseFloat(val) : 500), // $500 por orden
  
  // ✅ FASE 8: Rate Limiting Configurable
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  RATE_LIMIT_DEFAULT: z.string().optional().transform(val => val ? parseInt(val, 10) : 200), // requests por 15 min
  RATE_LIMIT_ADMIN: z.string().optional().transform(val => val ? parseInt(val, 10) : 1000),
  RATE_LIMIT_LOGIN: z.string().optional().transform(val => val ? parseInt(val, 10) : 5), // intentos por 15 min
  RATE_LIMIT_WINDOW_MS: z.string().optional().transform(val => val ? parseInt(val, 10) : 15 * 60 * 1000), // 15 minutos
  
  // ✅ HOTFIX: AliExpress API-First Configuration
  ALIEXPRESS_DATA_SOURCE: z.enum(['api', 'scrape']).default('api').transform(val => val as 'api' | 'scrape'),
  USE_NATIVE_SCRAPER_FIRST: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  ALIEXPRESS_AUTH_MONITOR_ENABLED: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  ALLOW_BROWSER_AUTOMATION: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  
  // ✅ AliExpress Affiliate API (strict vars)
  ALIEXPRESS_AFFILIATE_APP_KEY: z.string().optional(),
  ALIEXPRESS_AFFILIATE_APP_SECRET: z.string().optional(),
  // Legacy fallback (avoid in production; prefer ALIEXPRESS_AFFILIATE_APP_*)
  ALIEXPRESS_APP_KEY: z.string().optional(),
  ALIEXPRESS_APP_SECRET: z.string().optional(),

  // ✅ AliExpress Dropshipping API (strict vars)
  ALIEXPRESS_DROPSHIPPING_APP_KEY: z.string().optional(),
  ALIEXPRESS_DROPSHIPPING_APP_SECRET: z.string().optional(),
  ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN: z.string().optional(),
  ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN: z.string().optional(),
  ALIEXPRESS_DROPSHIPPING_REDIRECT_URI: z.string().url().optional(),
  /** Product ID for post-OAuth / health read-only probe (dropshipping TOP). Default used if unset. */
  ALIEXPRESS_DROPSHIPPING_VERIFY_PRODUCT_ID: z.string().optional(),

  // Legacy OAuth settings used by /api/aliexpress module
  ALIEXPRESS_REDIRECT_URI: z.string().url().default('https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback'),
  ALIEXPRESS_TRACKING_ID: z.string().default('ivanreseller'),
  ALIEXPRESS_OAUTH_BASE: z.string().url().default('https://api-sg.aliexpress.com/oauth'),
  ALIEXPRESS_API_BASE: z.string().url().default('https://api-sg.aliexpress.com/sync'),
  ALIEXPRESS_CALLBACK_URL: z.string().url().optional(),
  ALIEXPRESS_OAUTH_REDIRECT_URL: z.string().url().optional(),
  ALIEXPRESS_API_BASE_URL: z.string().url().optional(),
  ALIEXPRESS_ENV: z.enum(['production', 'test']).default('production'),
  ALIEXPRESS_TOKEN_URL: z.string().url().default('https://api-sg.aliexpress.com/rest/auth/token/security/create'),
  
  // ✅ DEBUG: Debug key for protected debug endpoints
  DEBUG_KEY: z.string().optional(),
  
  // ✅ FIX SIGSEGV: Safe Dashboard Mode - desactiva scraping en endpoints del dashboard
  SAFE_DASHBOARD_MODE: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  
  // ✅ FIX SIGSEGV: Safe Auth Status Mode - desactiva checks activos de marketplaces en /api/auth-status
  SAFE_AUTH_STATUS_MODE: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  
  // ✅ FIX SIGSEGV: Disable Browser Automation - flag absoluto para deshabilitar Puppeteer/Chromium en producción
  // Si está en true, NUNCA se inicializará Chromium/Puppeteer, incluso si se importa el servicio
  // Default: true en producción, false en desarrollo. Si ALLOW_BROWSER_AUTOMATION=true, default false (activar compras reales).
  DISABLE_BROWSER_AUTOMATION: z.enum(['true', 'false']).optional().transform((val) => {
    if (val !== undefined) return val === 'true';
    if (process.env.ALLOW_BROWSER_AUTOMATION === 'true') return false;
    const nodeEnv = process.env.NODE_ENV || 'development';
    return nodeEnv === 'production';
  }),

  // Fase 1 shipping: default cost when product has no shippingCost (margin/totalCost calculations)
  DEFAULT_SHIPPING_COST_USD: z.string().default('5.99').transform((val) => {
    const n = parseFloat(val);
    return Number.isFinite(n) && n >= 0 ? n : 5.99;
  }),

  /** Phase 51: safety lock — block all new marketplace publications until audit/validation is complete (Railway: set true during incidents). */
  BLOCK_NEW_PUBLICATIONS: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /** When true, exposes /api/cj-ebay/* and enables CJ→eBay USA vertical (isolated module). */
  ENABLE_CJ_EBAY_MODULE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /** When true, exposes /api/cj-shopify-usa/* and enables CJ→Shopify USA vertical (isolated module). */
  ENABLE_CJ_SHOPIFY_USA_MODULE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /** When true, exposes /api/cj-ml-chile/* and enables CJ→ML Chile vertical (isolated module). */
  ENABLE_CJ_ML_CHILE_MODULE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /** When true, exposes /api/cj-ebay-uk/* and enables CJ→eBay UK vertical (isolated module). */
  ENABLE_CJ_EBAY_UK_MODULE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /**
   * CJ→eBay UK — warehouse-aware probing for GB warehouses.
   * When true, probes `startCountryCode=GB` on freightCalculate to confirm UK stock.
   */
  CJ_EBAY_UK_WAREHOUSE_AWARE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /** Max CJ search results to probe for UK warehouse when CJ_EBAY_UK_WAREHOUSE_AWARE=true. */
  CJ_EBAY_UK_WAREHOUSE_PROBE_LIMIT: z.string().default('3').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 3;
  }),
  /**
   * FASE 3G+ — Warehouse-aware fulfillment: when true, the CJ-eBay module probes US freight
   * (`startCountryCode=US`) before falling back to CN. This is the only reliable signal for
   * US warehouse availability (CJ catalog does not expose warehouse fields in listV2 / product/query).
   * Additive improvement — default false until verified with real CJ account on live products.
   * Set to true only after confirming CJ has US warehouse stock for products you actively list.
   */
  CJ_EBAY_WAREHOUSE_AWARE: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /**
   * Max CJ search results (operable items) that receive a US warehouse freight probe when
   * CJ_EBAY_WAREHOUSE_AWARE=true. Limits CJ QPS in search. Default 3.
   */
  CJ_EBAY_WAREHOUSE_PROBE_LIMIT: z.string().default('3').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 3;
  }),

  /**
   * CJ Dropshipping Open API 2.0 — canonical env key (preferred). Alias legacy: CJ_DROPSHIPPING_API_KEY.
   * Loaded by CredentialsManager for apiName `cj-dropshipping`; never send to frontend.
   */
  CJ_API_KEY: z.string().optional(),
  /** Legacy alias for CJ Open API key; use CJ_API_KEY when possible. */
  CJ_DROPSHIPPING_API_KEY: z.string().optional(),

  /**
   * Opportunity finder: use CJ Open API catalog as an extra or fallback supply source.
   * `off` — no CJ calls from opportunity pipeline.
   * `merge` — after AliExpress Affiliate results, append CJ hits (same query) up to maxItems.
   * `fallback` — if Affiliate returns 0 rows, try CJ before eBay/scraper/cache/AI fallback.
   */
  OPPORTUNITY_CJ_SUPPLY_MODE: z.enum(['off', 'merge', 'fallback']).default('off'),
  /**
   * Default supplier preference when `user_settings.opportunitySupplierPreference` is null.
   * Per-user value overrides (aliexpress | cj | auto).
   */
  OPPORTUNITY_SUPPLIER_PREFERENCE: z.enum(['aliexpress', 'cj', 'auto']).default('auto'),

  /**
   * Phase C: selective CJ `freightCalculate` for opportunity rows (not full discovery list).
   * When false, only listing price + default commerce shipping apply.
   */
  OPPORTUNITY_CJ_DEEP_QUOTE_ENABLED: z.enum(['true', 'false']).default('true').transform((val) => val === 'true'),
  /** Max CJ products per opportunity search that receive a deep freight quote (sequential, spaced). */
  OPPORTUNITY_CJ_DEEP_QUOTE_MAX: z.string().default('3').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 20 ? n : 3;
  }),
  /** Minimum delay between deep freight API calls (ms) to reduce QPS bursts. */
  OPPORTUNITY_CJ_DEEP_QUOTE_MIN_SPACING_MS: z.string().default('400').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10_000 ? n : 400;
  }),
  /** TTL for in-process CJ freight quote cache (ms). */
  OPPORTUNITY_CJ_FREIGHT_CACHE_TTL_MS: z.string().default('1800000').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 60_000 && n <= 86_400_000 ? n : 1_800_000;
  }),
  /** Optional US ZIP forwarded to CJ freightCalculate `zip` (no PII beyond postal). */
  OPPORTUNITY_CJ_DEEP_QUOTE_DEST_ZIP: z.string().optional().transform((v) => (v && v.trim() ? v.trim().slice(0, 12) : undefined)),

  /** Max automatic retries when CJ returns HTTP 429 (QPS), per logical request. */
  CJ_429_MAX_RETRIES: z.string().default('3').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 3;
  }),
  /** Initial backoff (ms) for 429 retries; doubles each attempt (1s, 2s, 4s…). */
  CJ_429_BASE_BACKOFF_MS: z.string().default('2000').transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 500 && n <= 60_000 ? n : 2000;
  }),

  /** Phase 53: skip AliExpress pre-publish validation (emergency / tests only). */
  PRE_PUBLISH_VALIDATION_DISABLED: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
  /** Minimum net profit after supplier + shipping + fees (same currency unit as listing sale price). */
  PRE_PUBLISH_MIN_NET_PROFIT: z.string().default('0.01').transform((v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0.01;
  }),
  /** Optional minimum margin netProfit/salePrice (0–1). 0 = only PRE_PUBLISH_MIN_NET_PROFIT applies. */
  PRE_PUBLISH_MIN_MARGIN_RATIO: z.string().default('0.10').transform((v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0;
  }),
  /** If AliExpress getProductInfo has no shipping methods with cost, use product effective default shipping. */
  PRE_PUBLISH_SHIPPING_FALLBACK: z.enum(['true', 'false']).default('true').transform((val) => val === 'true'),
  /** When true, block publish if validation used shipping fallback (classification RISKY). Real E2E strict mode. */
  PRE_PUBLISH_REJECT_RISKY: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),

  /** P89: when true, web/API publish to Mercado Libre is blocked if WEBHOOK_SECRET_MERCADOLIBRE is unset (post-sale honesty). */
  ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),

  /**
   * Phase 1: ML webhook must enqueue to Redis/BullMQ after DB persist.
   * Unset = auto: required when NODE_ENV=production and SAFE_BOOT=false. Set false for local dev without Redis.
   */
  ML_WEBHOOK_REQUIRE_ASYNC_QUEUE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),

  /**
   * Phase 1: Mercado Libre publish via approve cannot fall back to synchronous publish when queue is missing.
   * Unset = auto: required when NODE_ENV=production and SAFE_BOOT=false.
   */
  ML_PUBLISH_REQUIRE_REDIS_QUEUE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

// Asegurar que DATABASE_URL esté en process.env
// Esto es crítico para que Prisma funcione correctamente
if (!process.env.DATABASE_URL && databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  console.log('✅ DATABASE_URL configurada desde variable alternativa');
}

// Asegurar que REDIS_URL esté en process.env
if (!process.env.REDIS_URL && redisUrl && redisUrl !== 'redis://localhost:6379') {
  process.env.REDIS_URL = redisUrl;
  console.log('✅ REDIS_URL configurada desde variable alternativa');
}

/**
 * ✅ PRODUCTION READY: Validar ENCRYPTION_KEY explícitamente
 * Esta validación es crítica para la seguridad de credenciales
 */
// ✅ FASE 3: Cambiar process.exit() a throw Error (no bloquear en módulos importables)
function validateEncryptionKey(): void {
  let encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  
  // Si no hay ENCRYPTION_KEY pero hay JWT_SECRET válido, usarlo como fallback
  if (!encryptionKey || encryptionKey.length < 32) {
    if (jwtSecret && jwtSecret.length >= 32) {
      encryptionKey = jwtSecret;
      process.env.ENCRYPTION_KEY = jwtSecret;
      console.log('✅ ENCRYPTION_KEY configurada desde JWT_SECRET');
    } else {
      const errorMsg = 'ERROR CRÍTICO DE SEGURIDAD: ENCRYPTION_KEY no válida\n' +
        '   ENCRYPTION_KEY o JWT_SECRET debe estar configurado y tener al menos 32 caracteres\n' +
        '   Sin una clave válida, las credenciales no pueden encriptarse correctamente';
      console.error('❌', errorMsg);
      console.error('');
      console.error('🔧 SOLUCIÓN:');
      console.error('   1. Genera una clave segura:');
      console.error('      node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      console.error('   2. Agrega ENCRYPTION_KEY en tus variables de entorno');
      console.error('   3. Reinicia la aplicación');
      console.error('');
      // ✅ FASE 3: Throw en lugar de process.exit() para que el entrypoint maneje
      throw new Error(errorMsg);
    }
  }
  
  if (encryptionKey.length < 32) {
    const errorMsg = `ENCRYPTION_KEY debe tener al menos 32 caracteres (longitud actual: ${encryptionKey.length})`;
    console.error('❌ ERROR:', errorMsg);
    // ✅ FASE 3: Throw en lugar de process.exit()
    throw new Error(errorMsg);
  }
  
  console.log('✅ ENCRYPTION_KEY validada (longitud: ' + encryptionKey.length + ' caracteres)');
}

// ✅ FASE 3: Solo validar ENCRYPTION_KEY en runtime, no al importar módulo (evita bloquear tests)
// La validación se hace explícitamente en server.ts (entrypoint)
if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_ENCRYPTION_KEY_VALIDATION) {
  try {
    validateEncryptionKey();
  } catch (error: any) {
    // En módulo importable, solo loggear - el entrypoint manejará el error
    console.error('⚠️  Warning: ENCRYPTION_KEY validation failed:', error.message);
  }
}

// ✅ FIX 502: Validar DATABASE_URL pero NO crashear el servidor
// El servidor debe arrancar para que /api/health responda, incluso sin DB
// La conexión DB se intentará en background después de que el servidor escuche
let databaseUrlValid = false;
if (process.env.DATABASE_URL) {
  const dbUrlValue = process.env.DATABASE_URL.trim();
  if (dbUrlValue.length === 0) {
    console.error('⚠️  WARNING: DATABASE_URL está vacía');
    console.error('   El servidor arrancará en modo degradado (sin base de datos)');
    console.error('   Ve a Railway Dashboard → ivan-reseller-web → Variables');
    console.error('   Verifica que DATABASE_URL tenga un valor válido');
    console.error('   /api/health responderá 200 pero /ready devolverá 503 hasta que DB esté configurada');
  } else if (!dbUrlValue.startsWith('postgresql://') && !dbUrlValue.startsWith('postgres://')) {
    console.error('⚠️  WARNING: DATABASE_URL tiene formato inválido');
    console.error(`   Valor actual: ${dbUrlValue.substring(0, 50)}...`);
    console.error('   Debe empezar con: postgresql:// o postgres://');
    console.error('   Ve a Railway Dashboard → Postgres → Variables → DATABASE_URL');
    console.error('   Copia el valor completo y pégalo en ivan-reseller-web → Variables → DATABASE_URL');
    console.error('   El servidor arrancará en modo degradado');
  } else {
    databaseUrlValid = true;
  }
} else {
  console.error('⚠️  WARNING: DATABASE_URL no está configurada');
  console.error('   El servidor arrancará en modo degradado (sin base de datos)');
  console.error('   Ve a Railway Dashboard → ivan-reseller-web → Variables');
  console.error('   Agrega DATABASE_URL con el valor de Postgres → Variables → DATABASE_URL');
  console.error('   /api/health responderá 200 pero /ready devolverá 503 hasta que DB esté configurada');
}

// ✅ FIX 502: Parsear schema pero NO crashear si DATABASE_URL falta
// Solo PORT y JWT_SECRET son críticos para arranque básico
let env: z.infer<typeof envSchema>;
try {
  env = envSchema.parse(process.env);
  
  // ✅ FIX 502: Si DATABASE_URL está vacía después del parse, usar valor por defecto
  if (!env.DATABASE_URL || env.DATABASE_URL.trim().length === 0) {
    env.DATABASE_URL = '';
    console.log('⚠️  DATABASE_URL no configurada - servidor en modo degradado');
  }
} catch (error: any) {
  if (error.name === 'ZodError') {
    console.error('❌ ERROR DE VALIDACIÓN DE VARIABLES DE ENTORNO:');
    const criticalErrors: string[] = [];
    const nonCriticalErrors: string[] = [];
    
    error.errors.forEach((err: any) => {
      const path = err.path.join('.');
      const isCritical = path === 'PORT' || path === 'JWT_SECRET';
      const errorMsg = `   - ${path}: ${err.message}`;
      
      if (isCritical) {
        criticalErrors.push(errorMsg);
      } else {
        nonCriticalErrors.push(errorMsg);
      }
    });
    
    if (criticalErrors.length > 0) {
      console.error('❌ ERRORES CRÍTICOS (Phase 6: no process.exit - server will start degraded):');
      criticalErrors.forEach(msg => console.error(msg));
      const fallbackEnv = { ...process.env };
      if (!fallbackEnv.JWT_SECRET || String(fallbackEnv.JWT_SECRET).length < 32) {
        try {
          fallbackEnv.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
        } catch {
          fallbackEnv.JWT_SECRET = process.env.JWT_SECRET || '';
        }
      }
      if (!fallbackEnv.DATABASE_URL) fallbackEnv.DATABASE_URL = '';
      env = envSchema.parse(fallbackEnv);
    }
    
    if (nonCriticalErrors.length > 0) {
      console.error('⚠️  ADVERTENCIAS (el servidor arrancará en modo degradado):');
      nonCriticalErrors.forEach(msg => console.error(msg));
      // Intentar parsear con valores por defecto para campos no críticos
      const fallbackEnv = { ...process.env };
      if (!fallbackEnv.DATABASE_URL) fallbackEnv.DATABASE_URL = '';
      try {
        env = envSchema.parse(fallbackEnv);
      } catch (fallbackError: any) {
        // Si aún falla, solo crashear si es PORT o JWT_SECRET
        if (fallbackError.errors?.some((e: any) => e.path.includes('PORT') || e.path.includes('JWT_SECRET'))) {
          throw fallbackError;
        }
        // Para otros errores, usar defaults
        env = envSchema.parse({ ...process.env, DATABASE_URL: '' });
      }
    }
  } else {
    throw error;
  }
}

export { env };
export default env;

/** When true, scraping (Puppeteer, ScraperAPI, ZenRows, bridge) is disabled; Autopilot uses Affiliate API only. */
export const DISABLE_SCRAPING = true;
