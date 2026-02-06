import { z } from 'zod';
import dotenv from 'dotenv';

const portFromShell = process.env.PORT;
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
if (portFromShell) process.env.PORT = portFromShell;

// Debug: Mostrar información sobre DATABASE_URL antes de validar
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
      console.log(`⚠️  DATABASE_URL no encontrada, pero se encontraron variables relacionadas: ${dbRelatedVars.join(', ')}`);
      // Intentar usar la primera que parezca válida
      for (const varName of dbRelatedVars) {
        const value = process.env[varName];
        if (value && (value.startsWith('postgresql://') || value.startsWith('postgres://'))) {
          dbUrl = value;
          foundName = varName;
          console.log(`   → Usando ${varName} como DATABASE_URL`);
          break;
        }
      }
    }
  }

  if (dbUrl) {
    // Verificar si es una referencia de Railway sin resolver
    if (dbUrl.startsWith('{{') && dbUrl.endsWith('}}')) {
      console.error('❌ ERROR: Variable Reference no resuelta por Railway');
      console.error(`   Valor recibido: ${dbUrl}`);
      console.error('   Railway debería resolver automáticamente las referencias {{Service.Variable}}');
      console.error('   Solución: Copia el valor real de la variable en lugar de usar la referencia');
      console.error('');
      return ''; // Retornar vacío para que el código muestre el error apropiado
    }
    
    try {
      // Verificar si la URL está incompleta o mal formada
      if (dbUrl.includes('://:@') || dbUrl.endsWith('://') || dbUrl === 'postgresql://' || dbUrl === 'postgres://') {
        console.error('❌ ERROR: DATABASE_URL está incompleta o mal formada');
        console.error(`   Valor recibido: ${dbUrl}`);
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
      
      const maskedPassword = url.password ? 
        (url.password.substring(0, 4) + '***' + url.password.substring(url.password.length - 4)) : 
        '***';
      const maskedUrl = `${url.protocol}//${url.username}:${maskedPassword}@${url.host}${url.pathname}`;
      
      // Detectar tipo de URL (interna vs pública)
      const isInternalUrl = url.hostname.includes('railway.internal');
      const isPublicUrl = url.hostname.includes('proxy.rlwy.net') || url.hostname.includes('railway.app');
      
      console.log('🔍 DATABASE_URL encontrada:');
      console.log(`   Variable: ${foundName}`);
      console.log(`   ${maskedUrl}`);
      console.log(`   Host: ${url.hostname}`);
      console.log(`   Port: ${url.port || '5432'}`);
      console.log(`   Database: ${url.pathname.replace('/', '')}`);
      console.log(`   User: ${url.username}`);
      
      if (isInternalUrl) {
        console.log('   ✅ Tipo: URL INTERNA (correcta para servicios dentro de Railway)');
        console.log('   💡 Esta es la URL recomendada para servicios en Railway');
      } else if (isPublicUrl) {
        console.log('   ⚠️  Tipo: URL PÚBLICA (para conexiones externas)');
        console.log('   💡 Si estás en Railway, considera usar DATABASE_URL con postgres.railway.internal');
        console.log('   💡 La URL pública funciona pero puede ser más lenta');
      } else {
        console.log('   ℹ️  Tipo: URL personalizada o local');
      }
    } catch (e) {
      console.error('⚠️  No se pudo parsear DATABASE_URL:', e);
      console.error(`   Valor recibido: ${dbUrl}`);
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

      // Detectar tipo de URL (interna vs pública)
      const isInternalUrl = redisUrl.includes('railway.internal');
      const isPublicUrl = redisUrl.includes('proxy.rlwy.net') || redisUrl.includes('railway.app');

      console.log('🔍 REDIS_URL encontrada:');
      console.log(`   Variable: ${foundName}`);
      console.log(`   ${redisUrl.replace(/:[^:@]+@/, ':****@')}`); // Ocultar contraseña
      
      if (isInternalUrl) {
        console.log('   ✅ Tipo: URL INTERNA (correcta para servicios dentro de Railway)');
        console.log('   💡 Esta es la URL recomendada para servicios en Railway');
      } else if (isPublicUrl) {
        console.log('   ⚠️  Tipo: URL PÚBLICA (para conexiones externas)');
        console.log('   💡 Si estás en Railway, considera usar REDIS_URL con redis.railway.internal');
      } else {
        console.log('   ℹ️  Tipo: URL local o personalizada');
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
  FRONTEND_URL: z.string().url().optional(),
  WEB_BASE_URL: z.string().url().optional(), // Base URL for OAuth callbacks (defaults to www.ivanreseller.com in production)
  DATABASE_URL: databaseUrlSchema,
  REDIS_URL: redisUrlSchema,
  JWT_SECRET: z.string().default(''), // Phase 6: optional at parse - server validates without exit
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Optional external APIs
  EBAY_APP_ID: z.string().optional(),
  EBAY_DEV_ID: z.string().optional(),
  EBAY_CERT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_SECRET: z.string().optional(),
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
  WEBHOOK_SECRET_EBAY: z.string().optional(),
  WEBHOOK_SECRET_MERCADOLIBRE: z.string().optional(),
  WEBHOOK_SECRET_AMAZON: z.string().optional(),
  WEBHOOK_ALLOW_INVALID_SIGNATURE: z.enum(['true', 'false']).default('false').transform(val => val === 'true'), // Solo dev
  
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
  
  // ✅ AliExpress Affiliate API - REQUERIDO para generación de links afiliados y OAuth
  ALIEXPRESS_APP_KEY: z.string().optional(),
  ALIEXPRESS_APP_SECRET: z.string().optional(),
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
  // Default: true en producción, false en desarrollo
  DISABLE_BROWSER_AUTOMATION: z.enum(['true', 'false']).optional().transform((val, ctx) => {
    // Si está explícitamente seteado, usar ese valor
    if (val !== undefined) return val === 'true';
    // Si no está seteado, default true en producción, false en desarrollo
    const nodeEnv = process.env.NODE_ENV || 'development';
    return nodeEnv === 'production';
  }),
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
        fallbackEnv.JWT_SECRET = 'placeholder-min-32-chars-for-degraded-mode-xxxx';
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
