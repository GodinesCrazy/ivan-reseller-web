import { z } from 'zod';

// Esquema base para credenciales de eBay
export const ebayCredentialsSchema = z.object({
  // ✅ CORREGIDO: eBay emite App IDs en varios formatos válidos
  // Ejemplos: IvanMart-IVANRese-SBX-xxx, IvanMart-IVANRese-PRD-xxx, YourAppI-YourApp-PRD-xxx
  // El formato puede variar según cuándo se creó la app y el tipo de cuenta
  appId: z.string()
    .min(10, 'App ID debe tener al menos 10 caracteres')
    .max(255, 'App ID no puede exceder 255 caracteres')
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/, 'App ID debe contener solo letras, números y guiones, y comenzar/terminar con alfanumérico'),
  devId: z.string()
    .min(1, 'Dev ID es requerido')
    .max(255, 'Dev ID no puede exceder 255 caracteres'),
  certId: z.string()
    .min(1, 'Cert ID es requerido')
    .max(255, 'Cert ID no puede exceder 255 caracteres'),
  // ✅ CORREGIDO: Redirect URI (RuName) no es necesariamente una URL, puede ser solo un string
  redirectUri: z.string()
    .min(1, 'Redirect URI (RuName) es requerido para OAuth')
    .max(255, 'Redirect URI no puede exceder 255 caracteres')
    .refine(
      (uri) => !/[<>"{}|\\^`\[\]]/.test(uri),
      { message: 'Redirect URI contiene caracteres inválidos' }
    ),
  token: z.string().optional(),
  refreshToken: z.string().optional(),
  sandbox: z.boolean().optional().default(false),
});

// Esquema para credenciales de Amazon
export const amazonCredentialsSchema = z.object({
  sellerId: z.string().min(1, 'Seller ID es requerido'),
  clientId: z.string().min(1, 'Client ID es requerido'),
  clientSecret: z.string().min(1, 'Client Secret es requerido'),
  refreshToken: z.string().min(1, 'Refresh Token es requerido'),
  awsAccessKeyId: z.string().min(1, 'AWS Access Key ID es requerido'),
  awsSecretAccessKey: z.string().min(1, 'AWS Secret Access Key es requerido'),
  marketplaceId: z.string().min(1, 'Marketplace ID es requerido'),
  region: z.string().min(1, 'Region es requerido'),
  sandbox: z.boolean().optional().default(false),
});

// Esquema para credenciales de MercadoLibre
export const mercadolibreCredentialsSchema = z.object({
  clientId: z.string().min(1, 'Client ID es requerido'),
  clientSecret: z.string().min(1, 'Client Secret es requerido'),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  userId: z.string().optional(),
  siteId: z.string().optional(),
  sandbox: z.boolean().optional().default(false),
});

// Esquema genérico para otras APIs
export const genericCredentialsSchema = z.record(z.any()).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Al menos un campo es requerido' }
);

// Función helper para obtener el esquema según el API
export function getCredentialsSchema(apiName: string) {
  switch (apiName.toLowerCase()) {
    case 'ebay':
      return ebayCredentialsSchema;
    case 'amazon':
      return amazonCredentialsSchema;
    case 'mercadolibre':
    case 'ml':
      return mercadolibreCredentialsSchema;
    default:
      return genericCredentialsSchema;
  }
}

// Esquema para validar campos requeridos dinámicamente
export function createDynamicSchema(requiredFields: string[]) {
  const schemaObject: Record<string, z.ZodString> = {};
  requiredFields.forEach((field) => {
    schemaObject[field] = z.string().min(1, `${field} es requerido`);
  });
  return z.object(schemaObject);
}

