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
const RAW_ENCRYPTION_SECRET = (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim())
  || (process.env.JWT_SECRET && process.env.JWT_SECRET.trim())
  || 'ivan-reseller-default-secret';

if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) {
  console.warn('⚠️  Using fallback encryption secret. Set ENCRYPTION_KEY for stronger security.');
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
  const data = Buffer.from(encryptedData, 'base64');
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
}

/**
 * Servicio de gestión de credenciales
 */
export class CredentialsManager {
  private static normalizeCredential(
    apiName: ApiName,
    credential: Record<string, any>,
    environment: ApiEnvironment
  ): void {
    if (!credential || typeof credential !== 'object') {
      return;
    }

    const creds = credential as any;

    if (creds.apiKey && typeof creds.apiKey === 'string') {
      creds.apiKey = creds.apiKey.trim();
    }

    if (apiName === 'ebay') {
      if (creds.authToken && !creds.token) {
        creds.token = creds.authToken;
      }
      if (typeof creds.sandbox === 'undefined') {
        creds.sandbox = environment === 'sandbox';
      }
    }
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
      const decrypted = decryptCredentials(personalCredential.credentials);
      this.normalizeCredential(apiName, decrypted, finalEnvironment);
      return {
        id: personalCredential.id,
        credentials: decrypted as ApiCredentialsMap[T],
        scope: 'user',
        ownerUserId: personalCredential.userId,
        sharedByUserId: personalCredential.sharedById ?? null,
        isActive: personalCredential.isActive,
      };
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

    const decrypted = decryptCredentials(sharedCredential.credentials);
    this.normalizeCredential(apiName, decrypted, finalEnvironment);

    return {
      id: sharedCredential.id,
      credentials: decrypted as ApiCredentialsMap[T],
      scope: 'global',
      ownerUserId: sharedCredential.userId,
      sharedByUserId: sharedCredential.sharedById ?? sharedCredential.userId ?? null,
      isActive: sharedCredential.isActive,
    };
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
