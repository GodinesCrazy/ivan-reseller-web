/**
 * Servicio centralizado para manejo de credenciales de APIs
 * 
 * Este servicio proporciona una interfaz unificada para:
 * - Obtener credenciales desde la base de datos
 * - Guardar credenciales con encriptación
 * - Validar credenciales según el tipo de API
 * - Soportar ambientes sandbox/production
 */

import { PrismaClient, type CredentialScope } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';
import type { 
  ApiName, 
  ApiEnvironment, 
  ApiCredentialsMap 
} from '../types/api-credentials.types';
import { API_KEY_NAMES, supportsEnvironments } from '../config/api-keys.config';
import logger from '../config/logger';

const prisma = new PrismaClient();

// 🚀 PERFORMANCE: Caché de credenciales desencriptadas (TTL: 5 minutos)
// Evita desencriptar repetidamente las mismas credenciales
interface CachedCredential {
  credentials: any;
  timestamp: number;
  environment: ApiEnvironment;
}

const credentialsCache = new Map<string, CachedCredential>();
const CREDENTIALS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Get cache key for credentials
 */
function getCredentialsCacheKey(userId: number, apiName: string, environment: ApiEnvironment): string {
  return `creds_${userId}_${apiName}_${environment}`;
}

/**
 * Clear credentials cache for a specific user/API/environment
 */
export function clearCredentialsCache(userId: number, apiName: string, environment: ApiEnvironment): void {
  const key = getCredentialsCacheKey(userId, apiName, environment);
  credentialsCache.delete(key);
}

/**
 * Clear all credentials cache for a user
 */
export function clearAllCredentialsCacheForUser(userId: number): void {
  const keysToDelete: string[] = [];
  for (const key of credentialsCache.keys()) {
    if (key.startsWith(`creds_${userId}_`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => credentialsCache.delete(key));
}

// Configuración de encriptación
const ALGORITHM = 'aes-256-gcm';

// 🔒 SEGURIDAD CRÍTICA: FALLAR si no hay clave de encriptación configurada
// No usar claves por defecto o fallback - esto es un riesgo de seguridad crítico
const RAW_ENCRYPTION_SECRET = (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim())
  || (process.env.JWT_SECRET && process.env.JWT_SECRET.trim());

if (!RAW_ENCRYPTION_SECRET || RAW_ENCRYPTION_SECRET.length < 32) {
  const error = new Error(
    'CRITICAL SECURITY ERROR: ENCRYPTION_KEY or JWT_SECRET environment variable must be set and be at least 32 characters long. ' +
    'Without a proper encryption key, credentials cannot be securely stored. ' +
    'Please set ENCRYPTION_KEY in your environment variables before starting the application.'
  );
  console.error('❌', error.message);
  throw error;
}

const ENCRYPTION_KEY = crypto.createHash('sha256').update(RAW_ENCRYPTION_SECRET).digest('hex');
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Esquemas de validación Zod para cada tipo de API
 */
const apiSchemas = {
  ebay: z.object({
    appId: z.string()
      .min(1, 'App ID is required')
      .max(255, 'App ID must not exceed 255 characters'),
    devId: z.string()
      .min(1, 'Dev ID is required')
      .max(255, 'Dev ID must not exceed 255 characters'),
    certId: z.string()
      .min(1, 'Cert ID is required')
      .max(255, 'Cert ID must not exceed 255 characters'),
    token: z.string().max(1000, 'Token must not exceed 1000 characters').optional(),
    authToken: z.string().max(1000, 'Auth Token must not exceed 1000 characters').optional(),
    refreshToken: z.string().max(1000, 'Refresh Token must not exceed 1000 characters').optional(),
    redirectUri: z.string()
      .min(3, 'Redirect URI must be at least 3 characters')
      .max(255, 'Redirect URI must not exceed 255 characters')
      .refine(
        (uri) => !/[<>"{}|\\^`\[\]]/.test(uri),
        { message: 'Redirect URI contains invalid characters' }
      )
      .optional(),
    sandbox: z.boolean(),
  }),
  amazon: z.object({
    sellerId: z.string()
      .min(1, 'Seller ID is required')
      .max(255, 'Seller ID must not exceed 255 characters'),
    clientId: z.string()
      .min(1, 'Client ID is required')
      .max(255, 'Client ID must not exceed 255 characters'),
    clientSecret: z.string()
      .min(1, 'Client Secret is required')
      .max(500, 'Client Secret must not exceed 500 characters'),
    refreshToken: z.string()
      .min(1, 'Refresh Token is required')
      .max(1000, 'Refresh Token must not exceed 1000 characters'),
    accessToken: z.string().max(1000, 'Access Token must not exceed 1000 characters').optional(),
    awsAccessKeyId: z.string()
      .min(1, 'AWS Access Key ID is required')
      .max(255, 'AWS Access Key ID must not exceed 255 characters'),
    awsSecretAccessKey: z.string()
      .min(1, 'AWS Secret Access Key is required')
      .max(500, 'AWS Secret Access Key must not exceed 500 characters'),
    awsSessionToken: z.string().max(2000, 'AWS Session Token must not exceed 2000 characters').optional(),
    region: z.string().max(50, 'Region must not exceed 50 characters').default('us-east-1'),
    marketplaceId: z.string()
      .min(1, 'Marketplace ID is required')
      .max(255, 'Marketplace ID must not exceed 255 characters'),
    sandbox: z.boolean(),
  }),
  mercadolibre: z.object({
    clientId: z.string()
      .min(1, 'Client ID is required')
      .max(255, 'Client ID must not exceed 255 characters'),
    clientSecret: z.string()
      .min(1, 'Client Secret is required')
      .max(500, 'Client Secret must not exceed 500 characters'),
    accessToken: z.string()
      .min(1, 'Access Token is required')
      .max(1000, 'Access Token must not exceed 1000 characters'),
    refreshToken: z.string()
      .min(1, 'Refresh Token is required')
      .max(1000, 'Refresh Token must not exceed 1000 characters'),
    userId: z.string().max(255, 'User ID must not exceed 255 characters').optional(),
    siteId: z.string().max(10, 'Site ID must not exceed 10 characters').optional(),
    sandbox: z.boolean(),
  }),
  groq: z.object({
    apiKey: z.string()
      .min(1, 'API Key is required')
      .max(500, 'API Key must not exceed 500 characters'),
    model: z.string().max(100, 'Model name must not exceed 100 characters').optional(),
    maxTokens: z.number().int().min(1).max(100000).optional(),
  }),
  openai: z.object({
    apiKey: z.string()
      .min(1, 'API Key is required')
      .max(500, 'API Key must not exceed 500 characters'),
    organization: z.string().max(255, 'Organization must not exceed 255 characters').optional(),
    model: z.string().max(100, 'Model name must not exceed 100 characters').optional(),
  }),
  scraperapi: z.object({
    apiKey: z.string()
      .min(1, 'API Key is required')
      .max(500, 'API Key must not exceed 500 characters'),
    premium: z.boolean().optional(),
  }),
  zenrows: z.object({
    apiKey: z.string()
      .min(1, 'API Key is required')
      .max(500, 'API Key must not exceed 500 characters'),
    premium: z.boolean().optional(),
  }),
  '2captcha': z.object({
    apiKey: z.string()
      .min(1, 'API Key is required')
      .max(500, 'API Key must not exceed 500 characters'),
  }),
  paypal: z.object({
    clientId: z.string()
      .min(1, 'Client ID is required')
      .max(255, 'Client ID must not exceed 255 characters'),
    clientSecret: z.string()
      .min(1, 'Client Secret is required')
      .max(500, 'Client Secret must not exceed 500 characters'),
    environment: z.enum(['sandbox', 'live']),
  }),
  aliexpress: z.object({
    email: z.string().email('Valid email is required'),
    password: z.string().min(1, 'Password is required'),
    twoFactorEnabled: z.boolean().default(false),
    twoFactorSecret: z.string().optional(),
    cookies: z.array(z.any()).optional(),
  }),
  email: z.object({
    host: z.string().min(1, 'SMTP Host is required'),
    port: z.number().int().min(1).max(65535),
    user: z.string().min(1, 'User is required'),
    password: z.string().min(1, 'Password is required'),
    from: z.string().email('Valid email is required'),
    fromName: z.string().optional(),
    secure: z.boolean(),
  }),
  twilio: z.object({
    accountSid: z.string().min(1, 'Account SID is required'),
    authToken: z.string().min(1, 'Auth Token is required'),
    phoneNumber: z.string().min(1, 'Phone Number is required'),
    whatsappNumber: z.string().optional(),
  }),
  slack: z.object({
    webhookUrl: z.string().url().optional(),
    botToken: z.string().optional(),
    channel: z.string().optional(),
  }).refine(data => data.webhookUrl || data.botToken, {
    message: 'Either webhookUrl or botToken is required',
  }),
  stripe: z.object({
    publicKey: z.string().min(1, 'Public Key is required'),
    secretKey: z.string().min(1, 'Secret Key is required'),
    webhookSecret: z.string().optional(),
    sandbox: z.boolean(),
  }),
};

/**
 * Encriptar credenciales
 */
function encryptCredentials(credentials: Record<string, any>): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  
  const tag = cipher.getAuthTag();
  
  // Combinar iv + tag + encrypted
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString('base64');
}

/**
 * Desencriptar credenciales
 */
function decryptCredentials(encryptedData: string): Record<string, any> {
  try {
    const data = Buffer.from(encryptedData, 'base64');
    
    // Validar que el tamaño mínimo sea correcto
    const minSize = IV_LENGTH + TAG_LENGTH + 1;
    if (data.length < minSize) {
      throw new Error(`Encrypted data too short: expected at least ${minSize} bytes, got ${data.length}`);
    }
    
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = data.slice(0, IV_LENGTH);
    const tag = data.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.slice(IV_LENGTH + TAG_LENGTH);
    
    // ✅ FIX SIGSEGV: Validar buffers antes de usar crypto nativo
    if (!iv || iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV: expected ${IV_LENGTH} bytes, got ${iv?.length || 0}`);
    }
    if (!tag || tag.length !== TAG_LENGTH) {
      throw new Error(`Invalid tag: expected ${TAG_LENGTH} bytes, got ${tag?.length || 0}`);
    }
    if (!encrypted || encrypted.length === 0) {
      throw new Error(`Invalid encrypted data: empty or null`);
    }
    
    // ✅ FIX SIGSEGV: Usar try-catch más robusto para prevenir crashes
    let decipher;
    try {
      decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      if (!decipher) {
        throw new Error('Failed to create decipher');
      }
      decipher.setAuthTag(tag);
    } catch (cryptoError: any) {
      // Si falla la creación del decipher, retornar error controlado
      logger.error('Crypto decipher creation failed', { 
        error: cryptoError.message,
        code: cryptoError.code 
      });
      throw new Error(`CRYPTO_INIT_ERROR: ${cryptoError.message || String(cryptoError)}`);
    }
    
    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
    } catch (decryptError: any) {
      // Si falla la desencriptación, retornar error controlado en lugar de crashear
      logger.error('Crypto decryption failed', { 
        error: decryptError.message,
        code: decryptError.code 
      });
      const errorType = decryptError?.code === 'ERR_CRYPTO_INVALID_TAG' 
        ? 'INVALID_ENCRYPTION_KEY' 
        : decryptError?.code === 'ERR_OSSL_BAD_DECRYPT'
        ? 'CORRUPTED_DATA'
        : 'DECRYPTION_FAILED';
      throw new Error(`${errorType}: ${decryptError.message || String(decryptError)}`);
    }
    
    try {
      return JSON.parse(decrypted.toString('utf8'));
    } catch (parseError: any) {
      throw new Error(`JSON_PARSE_ERROR: ${parseError.message || String(parseError)}`);
    }
  } catch (error: any) {
    // ✅ FIX SIGSEGV: Capturar TODOS los errores posibles, incluyendo SIGSEGV
    // Si el error ya tiene un tipo, re-lanzarlo
    if (error.message?.includes('CRYPTO_') || error.message?.includes('INVALID_') || 
        error.message?.includes('CORRUPTED_') || error.message?.includes('JSON_PARSE_')) {
      throw error;
    }
    
    // Mejorar el mensaje de error para diagnóstico
    const errorType = error?.code === 'ERR_CRYPTO_INVALID_TAG' 
      ? 'INVALID_ENCRYPTION_KEY' 
      : error?.code === 'ERR_OSSL_BAD_DECRYPT'
      ? 'CORRUPTED_DATA'
      : error?.code?.includes('CRYPTO') || error?.code?.includes('OSSL')
      ? 'CRYPTO_ERROR'
      : 'UNKNOWN_ERROR';
    
    throw new Error(`${errorType}: ${error?.message || String(error)}`);
  }
}

/**
 * Servicio de gestión de credenciales
 */
export class CredentialsManager {
  /**
   * Normalize credentials for a specific API
   * This is the CENTRALIZED place for credential normalization
   * All other services should use this method instead of duplicating logic
   */
  static normalizeCredential(
    apiName: ApiName,
    credential: Record<string, any>,
    environment: ApiEnvironment
  ): Record<string, any> {
    if (!credential || typeof credential !== 'object') {
      return credential || {};
    }

    // Create a copy to avoid mutating the original
    const creds = { ...credential };

    // General normalization: trim string fields
    if (creds.apiKey && typeof creds.apiKey === 'string') {
      creds.apiKey = creds.apiKey.trim();
    }

    // API-specific normalization
    if (apiName === 'ebay') {
      // Normalize token field: use 'token' as primary, 'authToken' as alias
      if (creds.authToken && !creds.token) {
        creds.token = creds.authToken;
      }
      
      // Normalize sandbox flag based on environment
      if (typeof creds.sandbox === 'undefined') {
        creds.sandbox = environment === 'sandbox';
      }
      
      // Normalize redirectUri: eBay uses 'redirectUri' (not 'ruName' or 'redirect_uri')
      // Support legacy field names for backward compatibility
      if (creds.ruName && !creds.redirectUri) {
        creds.redirectUri = creds.ruName;
      }
      if (creds.redirect_uri && !creds.redirectUri) {
        creds.redirectUri = creds.redirect_uri;
      }
      
      // Trim redirectUri (eBay is strict about exact matching)
      if (creds.redirectUri && typeof creds.redirectUri === 'string') {
        creds.redirectUri = creds.redirectUri.trim();
        
        // 🔒 VALIDACIÓN: Limpiar prefijos comunes que pueden copiarse por error
        // Caso 1: Si tiene prefijo "redirect_uri=" (copiado de una URL)
        if (creds.redirectUri.startsWith('redirect_uri=')) {
          const cleaned = creds.redirectUri.replace(/^redirect_uri=/, '').trim();
          logger.warn('[CredentialsManager] Detected redirect_uri= prefix, removing it', {
            original: creds.redirectUri.substring(0, 50) + '...',
            cleaned: cleaned.substring(0, 50) + '...'
          });
          creds.redirectUri = cleaned;
        }
        
        // 🔒 VALIDACIÓN: Prevenir que se guarde una URL completa de OAuth en lugar del RuName
        // Detectar URLs de eBay (auth.sandbox.ebay.com, auth.ebay.com, signin.sandbox.ebay.com, signin.ebay.com)
        const isEbayUrl = creds.redirectUri.length > 255 || 
          creds.redirectUri.includes('auth.sandbox.ebay.com') || 
          creds.redirectUri.includes('auth.ebay.com') ||
          creds.redirectUri.includes('signin.sandbox.ebay.com') ||
          creds.redirectUri.includes('signin.ebay.com');
        
        if (isEbayUrl) {
          try {
            const originalRedirectUri = creds.redirectUri;
            // Intentar parsear como URL
            const url = new URL(creds.redirectUri);
            
            // Intentar extraer el RuName de diferentes parámetros posibles
            let extractedRuName: string | null = null;
            
            // Caso 1: Parámetro redirect_uri (OAuth estándar)
            extractedRuName = url.searchParams.get('redirect_uri');
            
            // Caso 2: Parámetro runame (eBay SignIn legacy)
            if (!extractedRuName) {
              extractedRuName = url.searchParams.get('runame');
            }
            
            if (extractedRuName) {
              // El parámetro puede estar codificado, decodificarlo
              const decoded = decodeURIComponent(extractedRuName).trim();
              creds.redirectUri = decoded;
              logger.warn('[CredentialsManager] Detected eBay URL instead of RuName, extracted parameter', {
                originalLength: originalRedirectUri.length,
                extractedLength: decoded.length,
                preview: decoded.substring(0, 50) + '...',
                source: url.searchParams.has('redirect_uri') ? 'redirect_uri' : 'runame'
              });
            } else {
              // Si no tiene parámetros conocidos, es probable que sea una URL incorrecta
              logger.error('[CredentialsManager] redirectUri appears to be an eBay URL but missing redirect_uri or runame parameter', {
                urlPreview: originalRedirectUri.substring(0, 100) + '...',
                hasParams: url.searchParams.toString().length > 0
              });
              // No modificar, dejar que la validación de Zod lo rechace
            }
          } catch (urlError) {
            // No es una URL válida, continuar con el valor original
            // La validación de Zod lo rechazará si excede 255 caracteres
            logger.debug('[CredentialsManager] redirectUri is not a valid URL, keeping original value', {
              preview: creds.redirectUri.substring(0, 50) + '...'
            });
          }
        }
      }
    }

    return creds;
  }

  /**
   * 📝 MANTENIBILIDAD: Obtener credenciales de una API para un usuario
   * 
   * @template T - Tipo de API (eBay, Amazon, etc.)
   * @param userId - ID del usuario
   * @param apiName - Nombre de la API
   * @param environment - Ambiente (sandbox/production)
   * @param options - Opciones adicionales (includeGlobal)
   * @returns Credenciales desencriptadas y normalizadas, o null si no existen
   * 
   * @example
   * ```typescript
   * const creds = await CredentialsManager.getCredentials(1, 'ebay', 'sandbox');
   * if (creds) {
   *   console.log(creds.appId);
   * }
   * ```
   */
  static async getCredentials<T extends ApiName>(
    userId: number,
    apiName: T,
    environment: ApiEnvironment = 'production',
    options: {
      includeGlobal?: boolean;
    } = {}
  ): Promise<ApiCredentialsMap[T] | null> {
    try {
      const entry = await this.getCredentialEntry(userId, apiName, environment, options);
      return entry?.credentials ?? null;
    } catch (error: any) {
      logger.error('Error getting credentials', {
        service: 'credentials-manager',
        apiName,
        userId,
        error: error?.message || String(error)
      });
      return null;
    }
  }

  /**
   * 📝 MANTENIBILIDAD: Obtener entrada completa de credenciales (incluye metadata)
   * 
   * @template T - Tipo de API
   * @param userId - ID del usuario
   * @param apiName - Nombre de la API
   * @param environment - Ambiente (sandbox/production)
   * @param options - Opciones (includeGlobal para incluir credenciales globales)
   * @returns Objeto con credenciales, scope, ownerUserId, etc., o null si no existen
   * 
   * @remarks
   * - Prioriza credenciales personales sobre globales
   * - Usa caché de credenciales desencriptadas (TTL: 5 min)
   * - Optimiza consultas (1 query en lugar de 2)
   * 
   * @example
   * ```typescript
   * const entry = await CredentialsManager.getCredentialEntry(1, 'ebay', 'production');
   * if (entry) {
   *   console.log(`Scope: ${entry.scope}, Active: ${entry.isActive}`);
   * }
   * ```
   */
  static async getCredentialEntry<T extends ApiName>(
    userId: number,
    apiName: T,
    environment: ApiEnvironment = 'production',
    options: {
      includeGlobal?: boolean;
    } = {}
  ): Promise<{
    id: number;
    credentials: ApiCredentialsMap[T];
    scope: CredentialScope;
    ownerUserId: number;
    sharedByUserId: number | null;
    isActive: boolean;
  } | null> {
    const finalEnvironment = supportsEnvironments(apiName) ? environment : 'production';

    // 🚀 PERFORMANCE: Optimizar consultas - usar una sola query con OR en lugar de 2 queries
    const whereClause: any = {
      apiName,
      environment: finalEnvironment,
      isActive: true,
    };

    if (options.includeGlobal === false) {
      // Solo buscar credenciales personales
      whereClause.userId = userId;
      whereClause.scope = 'user';
    } else {
      // Buscar credenciales personales O globales en una sola query
      whereClause.OR = [
        { userId, scope: 'user' },
        { scope: 'global' }
      ];
    }

    // 🚀 PERFORMANCE: Una sola query en lugar de N+1
    const credentials = await prisma.apiCredential.findMany({
      where: whereClause,
      orderBy: [
        { scope: 'asc' }, // Priorizar 'user' sobre 'global'
        { updatedAt: 'desc' }
      ],
      take: 1, // Solo necesitamos la primera (prioridad: user > global)
    });

    const credential = credentials[0];
    if (!credential) {
      return null;
    }

    // 🚀 PERFORMANCE: Verificar caché de credenciales desencriptadas
    const cacheKey = getCredentialsCacheKey(credential.userId, apiName, finalEnvironment);
    const cached = credentialsCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CREDENTIALS_CACHE_TTL && cached.environment === finalEnvironment) {
      // Usar credenciales del caché
      return {
        id: credential.id,
        credentials: cached.credentials as ApiCredentialsMap[T],
        scope: credential.scope,
        ownerUserId: credential.userId,
        sharedByUserId: credential.sharedById ?? null,
        isActive: credential.isActive,
      };
    }

    // ✅ FIX SIGSEGV: Desencriptar con protección robusta para prevenir crashes
    try {
      let decrypted: Record<string, any>;
      try {
        // ✅ FIX SIGSEGV: Wrapper de seguridad para prevenir crashes en crypto nativo
        decrypted = decryptCredentials(credential.credentials);
      } catch (decryptError: any) {
        const errorMsg = decryptError?.message || String(decryptError);
        const isCryptoError = errorMsg.includes('CRYPTO_') || 
                             errorMsg.includes('INVALID_ENCRYPTION_KEY') || 
                             errorMsg.includes('CORRUPTED_DATA') ||
                             errorMsg.includes('ERR_CRYPTO') ||
                             errorMsg.includes('ERR_OSSL') ||
                             decryptError?.code?.includes('CRYPTO') ||
                             decryptError?.code?.includes('OSSL');
        
        // ✅ FIX SIGSEGV: Si es error de crypto, retornar null en lugar de lanzar error
        // Esto previene que el error se propague y cause SIGSEGV
        if (isCryptoError) {
          logger.error('✅ FIX SIGSEGV: Error de desencriptación detectado, retornando null', {
            service: 'credentials-manager',
            apiName,
            environment: finalEnvironment,
            userId,
            credentialId: credential.id,
            error: errorMsg,
            errorCode: decryptError?.code,
            possibleCauses: [
              'La clave de encriptación (ENCRYPTION_KEY o JWT_SECRET) cambió',
              'Las credenciales fueron encriptadas con una clave diferente',
              'Los datos están corruptos en la base de datos',
              'Problema con módulo nativo crypto (posible SIGSEGV)'
            ],
            solution: 'Elimina y vuelve a guardar las credenciales en API Settings'
          });
          
          // Desactivar credenciales corruptas automáticamente para evitar logs repetitivos
          try {
            await prisma.apiCredential.update({
              where: { id: credential.id },
              data: { isActive: false },
            });
            logger.info('Credencial corrupta desactivada automáticamente', {
              service: 'credentials-manager',
              credentialId: credential.id,
              apiName,
              userId
            });
          } catch (updateError: any) {
            logger.warn('No se pudo desactivar credencial corrupta', {
              credentialId: credential.id,
              error: updateError.message
            });
          }
          
          // ✅ FIX SIGSEGV: Retornar null en lugar de lanzar error
          // Esto previene que el error se propague y cause SIGSEGV en el caller
          return null;
        }
        
        // Si no es error de crypto, re-lanzar el error
        throw decryptError;
      }
      
      const normalized = this.normalizeCredential(apiName, decrypted, finalEnvironment);
      
      // 🚀 PERFORMANCE: Guardar en caché
      credentialsCache.set(cacheKey, {
        credentials: normalized,
        timestamp: now,
        environment: finalEnvironment,
      });

      return {
        id: credential.id,
        credentials: normalized as ApiCredentialsMap[T],
        scope: credential.scope,
        ownerUserId: credential.userId,
        sharedByUserId: credential.sharedById ?? null,
        isActive: credential.isActive,
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const isCorrupted = errorMsg.includes('INVALID_ENCRYPTION_KEY') || 
                         errorMsg.includes('CORRUPTED_DATA') ||
                         errorMsg.includes('Unsupported state') ||
                         errorMsg.includes('CRYPTO_') ||
                         error?.code?.includes('CRYPTO') ||
                         error?.code?.includes('OSSL');
      
      // 📝 MANTENIBILIDAD: Logging estructurado con contexto consistente
      if (isCorrupted) {
        logger.error('Credenciales corruptas detectadas', {
          service: 'credentials-manager',
          apiName,
          environment: finalEnvironment,
          userId,
          credentialId: credential.id,
          error: errorMsg,
          possibleCauses: [
            'La clave de encriptación (ENCRYPTION_KEY o JWT_SECRET) cambió',
            'Las credenciales fueron encriptadas con una clave diferente',
            'Los datos están corruptos en la base de datos'
          ],
          solution: 'Elimina y vuelve a guardar las credenciales en API Settings'
        });
        
        // Desactivar credenciales corruptas automáticamente para evitar logs repetitivos
        try {
          await prisma.apiCredential.update({
            where: { id: credential.id },
            data: { isActive: false },
          });
          logger.info('Credencial corrupta desactivada automáticamente', {
            service: 'credentials-manager',
            credentialId: credential.id,
            apiName,
            userId
          });
        } catch (updateError: any) {
          logger.error('No se pudo desactivar la credencial corrupta', {
            service: 'credentials-manager',
            credentialId: credential.id,
            error: updateError?.message || String(updateError)
          });
        }
      } else {
        // Para otros errores, solo un warning simple
        logger.warn('Unable to decrypt credentials', {
          service: 'credentials-manager',
          apiName,
          environment: finalEnvironment,
          userId,
          error: errorMsg
        });
      }
      
      return null;
    }
  }

  /**
   * Guardar credenciales de una API para un usuario
   */
  static async saveCredentials<T extends ApiName>(
    ownerUserId: number,
    apiName: T,
    credentials: ApiCredentialsMap[T],
    environment: ApiEnvironment = 'production',
    options: {
      scope?: CredentialScope;
      sharedByUserId?: number | null;
    } = {}
  ): Promise<void> {
    // ✅ Limpiar y validar credenciales antes de validar con Zod
    if (credentials && typeof credentials === 'object') {
      const creds = credentials as any;
      
      // Limpiar API keys (eliminar espacios en blanco)
      if (creds.apiKey && typeof creds.apiKey === 'string') {
        creds.apiKey = creds.apiKey.trim();
      }

      if (apiName === 'ebay') {
        if (creds.authToken && !creds.token) {
          creds.token = creds.authToken;
        }
        if (creds.token && typeof creds.token === 'string') {
          creds.token = creds.token.trim();
        }
        if (creds.authToken && typeof creds.authToken === 'string') {
          creds.authToken = creds.authToken.trim();
        }
        if (creds.sandbox === undefined) {
          creds.sandbox = environment === 'sandbox';
        }
      }
      
      // Para AliExpress, asegurar que twoFactorEnabled sea boolean
      if (apiName === 'aliexpress') {
        if (typeof creds.twoFactorEnabled === 'string') {
          creds.twoFactorEnabled = creds.twoFactorEnabled.toLowerCase() === 'true';
        }
        if (creds.twoFactorEnabled === undefined || creds.twoFactorEnabled === null) {
          creds.twoFactorEnabled = false;
        }
        if (typeof creds.cookies === 'string') {
          try {
            const parsed = JSON.parse(creds.cookies);
            if (Array.isArray(parsed)) {
              creds.cookies = parsed;
            } else {
              delete creds.cookies;
            }
          } catch {
            delete creds.cookies;
          }
        }
      }
    }
    
    // Validar credenciales con Zod
    const schema = apiSchemas[apiName];
    if (schema) {
      try {
        schema.parse(credentials);
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error(`[CredentialsManager] Validation error for ${apiName}:`, error.errors);
          throw error;
        }
        throw error;
      }
    }

    // Determinar ambiente correcto
    const finalEnvironment = supportsEnvironments(apiName) ? environment : 'production';
    const scope: CredentialScope = options.scope ?? 'user';
    const sharedById =
      scope === 'global'
        ? options.sharedByUserId ?? ownerUserId
        : options.sharedByUserId ?? null;

    // Encriptar credenciales
    const encrypted = encryptCredentials(credentials);

    // Guardar en la base de datos
    await prisma.apiCredential.upsert({
      where: {
        userId_apiName_environment_scope: {
          userId: ownerUserId,
          apiName,
          environment: finalEnvironment,
          scope,
        },
      },
      create: {
        userId: ownerUserId,
        apiName,
        environment: finalEnvironment,
        credentials: encrypted,
        isActive: true,
        scope,
        sharedById,
      },
      update: {
        credentials: encrypted,
        updatedAt: new Date(),
        scope,
        sharedById,
      },
    });
  }

  /**
   * Eliminar credenciales de una API para un usuario
   */
  static async deleteCredentials(
    ownerUserId: number,
    apiName: ApiName,
    environment: ApiEnvironment = 'production',
    scope: CredentialScope = 'user'
  ): Promise<void> {
    const finalEnvironment = supportsEnvironments(apiName) ? environment : 'production';

    await prisma.apiCredential.delete({
      where: {
        userId_apiName_environment_scope: {
          userId: ownerUserId,
          apiName,
          environment: finalEnvironment,
          scope,
        },
      },
    });
  }

  /**
   * Verificar si un usuario tiene credenciales configuradas para una API
   */
  static async hasCredentials(
    userId: number,
    apiName: ApiName,
    environment: ApiEnvironment = 'production',
    options: {
      scope?: CredentialScope;
      includeGlobal?: boolean;
    } = {}
  ): Promise<boolean> {
    const entry = await this.getCredentialEntry(userId, apiName, environment, {
      includeGlobal: options.includeGlobal,
    });

    if (!entry) {
      return false;
    }

    if (options.scope && entry.scope !== options.scope) {
      return false;
    }

    return entry.isActive;
  }

  /**
   * Listar todas las APIs configuradas para un usuario
   */
  static async listConfiguredApis(userId: number): Promise<Array<{
    id: number;
    apiName: ApiName;
    environment: ApiEnvironment;
    isActive: boolean;
    updatedAt: Date;
    scope: CredentialScope;
    ownerUserId: number;
    sharedByUserId: number | null;
    owner: {
      id: number;
      username: string;
      role: string;
      fullName?: string | null;
    } | null;
    sharedBy: {
      id: number;
      username: string;
      role: string;
      fullName?: string | null;
    } | null;
  }>> {
    const credentials = await prisma.apiCredential.findMany({
      where: {
        OR: [
          { userId, scope: 'user' },
          { scope: 'global' },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            fullName: true,
          },
        },
        sharedBy: {
          select: {
            id: true,
            username: true,
            role: true,
            fullName: true,
          },
        },
      },
      orderBy: [
        { scope: 'asc' },
        { apiName: 'asc' },
        { environment: 'asc' },
      ],
    });

    return credentials.map((credential) => {
      const owner =
        credential.scope === 'user'
          ? credential.user
          : credential.sharedBy ?? credential.user;

      return {
        id: credential.id,
        apiName: credential.apiName as ApiName,
        environment: credential.environment as ApiEnvironment,
        isActive: credential.isActive,
        updatedAt: credential.updatedAt,
        scope: credential.scope,
        ownerUserId: credential.userId,
        sharedByUserId: credential.sharedById ?? null,
        owner: owner
          ? {
              id: owner.id,
              username: owner.username,
              role: owner.role,
              fullName: owner.fullName,
            }
          : null,
        sharedBy:
          credential.scope === 'user' && credential.sharedBy
            ? {
                id: credential.sharedBy.id,
                username: credential.sharedBy.username,
                role: credential.sharedBy.role,
                fullName: credential.sharedBy.fullName,
              }
            : credential.scope === 'global'
            ? credential.user
              ? {
                  id: credential.user.id,
                  username: credential.user.username,
                  role: credential.user.role,
                  fullName: credential.user.fullName,
                }
              : null
            : null,
      };
    });
  }

  /**
   * Activar/desactivar credenciales
   */
  static async toggleCredentials(
    ownerUserId: number,
    apiName: ApiName,
    environment: ApiEnvironment,
    scope: CredentialScope,
    isActive: boolean
  ): Promise<void> {
    const finalEnvironment = supportsEnvironments(apiName) ? environment : 'production';

    await prisma.apiCredential.update({
      where: {
        userId_apiName_environment_scope: {
          userId: ownerUserId,
          apiName,
          environment: finalEnvironment,
          scope,
        },
      },
      data: { isActive },
    });
  }

  /**
   * Validar credenciales sin guardarlas
   */
  static validateCredentials<T extends ApiName>(
    apiName: T,
    credentials: ApiCredentialsMap[T]
  ): { valid: boolean; errors?: string[] } {
    const schema = apiSchemas[apiName];
    if (!schema) {
      return { valid: true }; // No hay schema, se asume válido
    }

    try {
      schema.parse(credentials);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  /**
   * Detectar y limpiar credenciales corruptas
   * Útil para mantenimiento y diagnóstico
   */
  static async detectAndCleanCorruptedCredentials(
    options: {
      autoDeactivate?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<{
    total: number;
    corrupted: number;
    cleaned: number;
    details: Array<{
      id: number;
      apiName: string;
      environment: string;
      scope: string;
      userId: number;
      error: string;
    }>;
  }> {
    const { autoDeactivate = true, dryRun = false } = options;
    const corrupted: Array<{
      id: number;
      apiName: string;
      environment: string;
      scope: string;
      userId: number;
      error: string;
    }> = [];

    // Obtener todas las credenciales activas
    const allCredentials = await prisma.apiCredential.findMany({
      where: { isActive: true },
      select: {
        id: true,
        apiName: true,
        environment: true,
        scope: true,
        userId: true,
        credentials: true,
      },
    });

    console.log(`🔍 Verificando ${allCredentials.length} credenciales activas...`);

    for (const cred of allCredentials) {
      try {
        decryptCredentials(cred.credentials);
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        const isCorrupted = errorMsg.includes('INVALID_ENCRYPTION_KEY') || 
                           errorMsg.includes('CORRUPTED_DATA') ||
                           errorMsg.includes('Unsupported state');
        
        if (isCorrupted) {
          corrupted.push({
            id: cred.id,
            apiName: cred.apiName,
            environment: cred.environment,
            scope: cred.scope,
            userId: cred.userId,
            error: errorMsg,
          });

          if (!dryRun && autoDeactivate) {
            try {
              await prisma.apiCredential.update({
                where: { id: cred.id },
                data: { isActive: false },
              });
            } catch (updateError) {
              console.error(`Error desactivando credencial ${cred.id}:`, updateError);
            }
          }
        }
      }
    }

    const result = {
      total: allCredentials.length,
      corrupted: corrupted.length,
      cleaned: dryRun ? 0 : corrupted.length,
      details: corrupted,
    };

    if (corrupted.length > 0) {
      console.log(`⚠️  Se encontraron ${corrupted.length} credenciales corruptas de ${allCredentials.length} totales`);
      if (dryRun) {
        console.log(`   (Modo dry-run: no se realizaron cambios)`);
      } else {
        console.log(`   ✅ ${corrupted.length} credenciales desactivadas automáticamente`);
      }
    } else {
      console.log(`✅ Todas las credenciales están válidas`);
    }

    return result;
  }

  /**
   * Obtener credenciales con fallback a variables de entorno (legacy)
   * 
   * @deprecated Usar getCredentials() sin fallback para forzar uso de DB
   */
  static async getCredentialsWithFallback<T extends ApiName>(
    userId: number,
    apiName: T,
    environment: ApiEnvironment = 'production'
  ): Promise<ApiCredentialsMap[T] | null> {
    // Primero intentar desde DB
    const dbCredentials = await this.getCredentials(userId, apiName, environment);
    if (dbCredentials) {
      return dbCredentials;
    }

    // Fallback a process.env (solo para migración gradual)
    console.warn(`[CredentialsManager] Usando fallback a process.env para ${apiName}. Migrar a DB.`);
    
    const envKeys = API_KEY_NAMES[apiName.toUpperCase() as keyof typeof API_KEY_NAMES];
    if (!envKeys) return null;

    // Construir credenciales desde env vars
    // NOTA: Esto es solo para compatibilidad temporal
    // TODO: Remover después de migración completa
    return null; // Deshabilitado por defecto
  }
}

// Exportar funciones de encriptación para uso externo si es necesario
export { encryptCredentials, decryptCredentials };
