/**
 * Intelligent API Validation Utilities
 * 
 * Validaciones inteligentes específicas por proveedor de API
 * Detecta problemas comunes y proporciona recomendaciones
 */

import { logger } from '../config/logger';

export interface IntelligentValidationResult {
  valid: boolean;
  message?: string;
  recommendations?: string[];
  warnings?: string[];
}

/**
 * Validar credenciales de eBay de forma inteligente
 */
function validateEbayCredentials(credentials: any, environment: string): IntelligentValidationResult {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Validar formato de App ID
  if (credentials.appId) {
    const appId = String(credentials.appId).trim();
    
    // Verificar que el App ID corresponda al entorno
    if (environment === 'sandbox') {
      if (!appId.includes('SBX-') && !appId.toLowerCase().includes('sandbox')) {
        warnings.push('El App ID no parece ser de Sandbox. Verifica que sea correcto para el ambiente de pruebas.');
      }
    } else if (environment === 'production') {
      if (!appId.includes('PRD-') && !appId.includes('PROD-') && !appId.toLowerCase().includes('prod')) {
        warnings.push('El App ID no parece ser de Producción. Verifica que sea correcto para el ambiente real.');
      }
      if (appId.includes('SBX-') || appId.toLowerCase().includes('sandbox')) {
        return {
          valid: false,
          message: 'App ID de Sandbox detectado en ambiente de Producción',
          recommendations: [
            'Cambia el entorno a "Sandbox" si quieres usar credenciales de pruebas',
            'O usa el App ID correcto de Producción en tu aplicación de eBay'
          ]
        };
      }
    }

    // Validar longitud mínima
    if (appId.length < 15) {
      warnings.push('El App ID parece ser muy corto. Verifica que sea correcto.');
    }
  }

  // Validar Cert ID
  if (credentials.certId) {
    const certId = String(credentials.certId).trim();
    
    // Verificar que el Cert ID corresponda al entorno
    if (environment === 'sandbox') {
      if (!certId.includes('SBX-')) {
        warnings.push('El Cert ID no parece ser de Sandbox. Verifica que sea correcto.');
      }
    } else if (environment === 'production') {
      if (!certId.includes('PRD-')) {
        warnings.push('El Cert ID no parece ser de Producción. Verifica que sea correcto.');
      }
      if (certId.includes('SBX-')) {
        return {
          valid: false,
          message: 'Cert ID de Sandbox detectado en ambiente de Producción',
          recommendations: [
            'Usa el Cert ID correcto de Producción',
            'O cambia el entorno a "Sandbox"'
          ]
        };
      }
    }
  }

  // Validar Dev ID (debe ser UUID)
  if (credentials.devId) {
    const devId = String(credentials.devId).trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidPattern.test(devId)) {
      warnings.push('El Dev ID no tiene formato UUID válido. Verifica que sea correcto.');
    }
  }

  // Validar Redirect URI
  if (credentials.redirectUri) {
    const redirectUri = String(credentials.redirectUri).trim();
    
    // ✅ Aceptar TANTO RuName como URL completa - eBay soporta ambos
    // Si "Your auth accepted URL" en eBay Developer es la URL, usar la URL es válido
    const isUrl = redirectUri.startsWith('http://') || redirectUri.startsWith('https://');
    if (isUrl) {
      if (redirectUri.length < 20) {
        warnings.push('La URL de Redirect parece incompleta. Verifica que sea exactamente la de eBay Developer → Auth accepted URL.');
      }
    } else {
      // RuName: validar longitud mínima
      if (redirectUri.length < 10) {
        warnings.push('El RuName parece muy corto. Verifica que sea correcto (ej: Ivan_Marty-IvanMart-IVANRe-cgcqu).');
      }
    }
  }

  if (warnings.length > 0 || recommendations.length > 0) {
    return {
      valid: true,
      message: warnings.length > 0 ? warnings.join(' ') : undefined,
      warnings,
      recommendations
    };
  }

  return { valid: true };
}

/**
 * Validar credenciales de PayPal de forma inteligente
 */
function validatePayPalCredentials(credentials: any, environment: string): IntelligentValidationResult {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Validar Client ID
  if (credentials.clientId) {
    const clientId = String(credentials.clientId).trim();
    
    // PayPal Client IDs típicamente tienen longitud específica
    if (clientId.length < 20 || clientId.length > 150) {
      warnings.push('El Client ID de PayPal tiene una longitud inusual. Verifica que sea correcto.');
    }
  }

  // Validar Client Secret
  if (credentials.clientSecret) {
    const clientSecret = String(credentials.clientSecret).trim();
    
    if (clientSecret.length < 20 || clientSecret.length > 250) {
      warnings.push('El Client Secret de PayPal tiene una longitud inusual. Verifica que sea correcto.');
    }
  }

  // Validar que environment coincida
  if (credentials.environment) {
    const credEnv = String(credentials.environment).toLowerCase();
    if (environment === 'sandbox' && credEnv === 'live') {
      warnings.push('Environment configurado como "live" pero estás en ambiente Sandbox. Considera usar "sandbox".');
    }
    if (environment === 'production' && credEnv === 'sandbox') {
      warnings.push('Environment configurado como "sandbox" pero estás en ambiente Production. Considera usar "live".');
    }
  }

  if (warnings.length > 0) {
    return {
      valid: true,
      message: warnings.join(' '),
      warnings,
      recommendations
    };
  }

  return { valid: true };
}

/**
 * Validar credenciales de Amazon de forma inteligente
 */
function validateAmazonCredentials(credentials: any, environment: string): IntelligentValidationResult {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Validar Client ID (debe comenzar con amzn1.application-oa2-client)
  if (credentials.clientId) {
    const clientId = String(credentials.clientId).trim();
    
    if (!clientId.startsWith('amzn1.application-oa2-client')) {
      warnings.push('El Client ID de Amazon debe comenzar con "amzn1.application-oa2-client". Verifica que sea correcto.');
    }
  }

  // Validar Refresh Token (debe comenzar con Atzr|)
  if (credentials.refreshToken) {
    const refreshToken = String(credentials.refreshToken).trim();
    
    if (!refreshToken.startsWith('Atzr|')) {
      warnings.push('El Refresh Token de Amazon debe comenzar con "Atzr|". Verifica que sea correcto.');
    }
  }

  // Validar AWS Access Key ID
  if (credentials.awsAccessKeyId) {
    const accessKey = String(credentials.awsAccessKeyId).trim();
    
    // AWS Access Key IDs típicamente tienen 20 caracteres y comienzan con AKIA
    if (accessKey.length !== 20 || !accessKey.startsWith('AKIA')) {
      warnings.push('El AWS Access Key ID debe tener 20 caracteres y comenzar con "AKIA". Verifica que sea correcto.');
    }
  }

  if (warnings.length > 0) {
    return {
      valid: true,
      message: warnings.join(' '),
      warnings,
      recommendations
    };
  }

  return { valid: true };
}

/**
 * Validar credenciales de forma inteligente según el proveedor
 */
export async function validateCredentialsIntelligently(
  apiName: string,
  credentials: Record<string, any>,
  environment: string
): Promise<IntelligentValidationResult> {
  try {
    const normalizedApiName = apiName.toLowerCase();

    switch (normalizedApiName) {
      case 'ebay':
        return validateEbayCredentials(credentials, environment);

      case 'paypal':
        return validatePayPalCredentials(credentials, environment);

      case 'amazon':
        return validateAmazonCredentials(credentials, environment);

      case 'mercadolibre':
      case 'ml':
        // MercadoLibre tiene validaciones más simples
        return { valid: true };

      default:
        // Para otras APIs, no hay validación específica
        return { valid: true };
    }
  } catch (error: any) {
    logger.error('[Intelligent Validation] Error validating credentials', {
      apiName,
      error: error.message
    });
    // En caso de error, retornar válido para no bloquear el guardado
    return { valid: true };
  }
}

