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

const prisma = new PrismaClient();

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
    appId: z.string().min(1, 'App ID is required'),
    devId: z.string().min(1, 'Dev ID is required'),
    certId: z.string().min(1, 'Cert ID is required'),
    token: z.string().optional(),
    authToken: z.string().optional(),
    refreshToken: z.string().optional(),
    sandbox: z.boolean(),
  }),
  amazon: z.object({
    sellerId: z.string().min(1, 'Seller ID is required'),
    clientId: z.string().min(1, 'Client ID is required'),
    clientSecret: z.string().min(1, 'Client Secret is required'),
    refreshToken: z.string().min(1, 'Refresh Token is required'),
    accessToken: z.string().optional(),
    awsAccessKeyId: z.string().min(1, 'AWS Access Key ID is required'),
    awsSecretAccessKey: z.string().min(1, 'AWS Secret Access Key is required'),
    awsSessionToken: z.string().optional(),
    region: z.string().default('us-east-1'),
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    sandbox: z.boolean(),
  }),
  mercadolibre: z.object({
    clientId: z.string().min(1, 'Client ID is required'),
    clientSecret: z.string().min(1, 'Client Secret is required'),
    accessToken: z.string().min(1, 'Access Token is required'),
    refreshToken: z.string().min(1, 'Refresh Token is required'),
    userId: z.string().optional(),
    sandbox: z.boolean(),
  }),
  groq: z.object({
    apiKey: z.string().min(1, 'API Key is required'),
    model: z.string().optional(),
    maxTokens: z.number().optional(),
  }),
  openai: z.object({
    apiKey: z.string().min(1, 'API Key is required'),
    organization: z.string().optional(),
    model: z.string().optional(),
  }),
  scraperapi: z.object({
    apiKey: z.string().min(1, 'API Key is required'),
    premium: z.boolean().optional(),
  }),
  zenrows: z.object({
    apiKey: z.string().min(1, 'API Key is required'),
    premium: z.boolean().optional(),
  }),
  '2captcha': z.object({
    apiKey: z.string().min(1, 'API Key is required'),
  }),
  paypal: z.object({
    clientId: z.string().min(1, 'Client ID is required'),
    clientSecret: z.string().min(1, 'Client Secret is required'),
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
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error: any) {
    // Mejorar el mensaje de error para diagnóstico
    const errorType = error?.code === 'ERR_CRYPTO_INVALID_TAG' 
      ? 'INVALID_ENCRYPTION_KEY' 
      : error?.code === 'ERR_OSSL_BAD_DECRYPT'
      ? 'CORRUPTED_DATA'
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
      }
    }

    return creds;
  }

  /**
   * Obtener credenciales de una API para un usuario
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
    } catch (error) {
      console.error(`Error getting credentials for ${apiName}:`, error);
      return null;
    }
  }

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

    // Buscar credenciales específicas del usuario (scope user)
    const personalCredential = await prisma.apiCredential.findFirst({
      where: {
        userId,
        apiName,
        environment: finalEnvironment,
        scope: 'user',
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (personalCredential) {
      try {
        const decrypted = decryptCredentials(personalCredential.credentials);
        const normalized = this.normalizeCredential(apiName, decrypted, finalEnvironment);
        return {
          id: personalCredential.id,
          credentials: normalized as ApiCredentialsMap[T],
          scope: 'user',
          ownerUserId: personalCredential.userId,
          sharedByUserId: personalCredential.sharedById ?? null,
          isActive: personalCredential.isActive,
        };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        const isCorrupted = errorMsg.includes('INVALID_ENCRYPTION_KEY') || 
                           errorMsg.includes('CORRUPTED_DATA') ||
                           errorMsg.includes('Unsupported state');
        
        // Log detallado solo la primera vez o si es un error de corrupción
        if (isCorrupted) {
          console.error(`🔒 [CredentialsManager] Credenciales corruptas detectadas: ${apiName} (${finalEnvironment}) para usuario ${userId}`);
          console.error(`   Error: ${errorMsg}`);
          console.error(`   Credential ID: ${personalCredential.id}`);
          console.error(`   Posibles causas:`);
          console.error(`   1. La clave de encriptación (ENCRYPTION_KEY o JWT_SECRET) cambió`);
          console.error(`   2. Las credenciales fueron encriptadas con una clave diferente`);
          console.error(`   3. Los datos están corruptos en la base de datos`);
          console.error(`   Solución: Elimina y vuelve a guardar las credenciales en API Settings`);
          
          // Desactivar credenciales corruptas automáticamente para evitar logs repetitivos
          try {
            await prisma.apiCredential.update({
              where: { id: personalCredential.id },
              data: { isActive: false },
            });
            console.warn(`   ✅ Credencial desactivada automáticamente (ID: ${personalCredential.id})`);
          } catch (updateError) {
            console.error(`   ⚠️  No se pudo desactivar la credencial corrupta:`, updateError);
          }
        } else {
          // Para otros errores, solo un warning simple
          console.warn(`[CredentialsManager] Unable to decrypt personal credentials for ${apiName} (${finalEnvironment}): ${errorMsg}`);
        }
        
        return null;
      }
    }

    if (options.includeGlobal === false) {
      return null;
    }

    // Buscar credenciales globales
    const sharedCredential = await prisma.apiCredential.findFirst({
      where: {
        scope: 'global',
        apiName,
        environment: finalEnvironment,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!sharedCredential) {
      return null;
    }

    try {
      const decrypted = decryptCredentials(sharedCredential.credentials);
      const normalized = this.normalizeCredential(apiName, decrypted, finalEnvironment);

      return {
        id: sharedCredential.id,
        credentials: normalized as ApiCredentialsMap[T],
        scope: 'global',
        ownerUserId: sharedCredential.userId,
        sharedByUserId: sharedCredential.sharedById ?? sharedCredential.userId ?? null,
        isActive: sharedCredential.isActive,
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const isCorrupted = errorMsg.includes('INVALID_ENCRYPTION_KEY') || 
                         errorMsg.includes('CORRUPTED_DATA') ||
                         errorMsg.includes('Unsupported state');
      
      // Log detallado solo si es un error de corrupción
      if (isCorrupted) {
        console.error(`🔒 [CredentialsManager] Credenciales globales corruptas detectadas: ${apiName} (${finalEnvironment})`);
        console.error(`   Error: ${errorMsg}`);
        console.error(`   Credential ID: ${sharedCredential.id}`);
        console.error(`   Solución: Un administrador debe eliminar y volver a guardar las credenciales globales`);
        
        // Desactivar credenciales corruptas automáticamente
        try {
          await prisma.apiCredential.update({
            where: { id: sharedCredential.id },
            data: { isActive: false },
          });
          console.warn(`   ✅ Credencial global desactivada automáticamente (ID: ${sharedCredential.id})`);
        } catch (updateError) {
          console.error(`   ⚠️  No se pudo desactivar la credencial corrupta:`, updateError);
        }
      } else {
        console.warn(`[CredentialsManager] Unable to decrypt shared credentials for ${apiName} (${finalEnvironment}): ${errorMsg}`);
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
