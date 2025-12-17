/**
 * ✅ FASE 3: Webhook Signature Validation Middleware
 * Valida firmas HMAC de webhooks para eBay, MercadoLibre y Amazon
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { env } from '../config/env';

export type MarketplaceWebhook = 'ebay' | 'mercadolibre' | 'amazon';

interface SignatureValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * ✅ FASE 3: Validar firma HMAC para eBay
 * eBay usa header X-EBAY-SIGNATURE con HMAC-SHA256
 */
function validateEbaySignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): SignatureValidationResult {
  if (!secret) {
    return { valid: false, error: 'WEBHOOK_SECRET_EBAY not configured' };
  }

  if (!signature) {
    return { valid: false, error: 'X-EBAY-SIGNATURE header missing' };
  }

  try {
    // eBay usa formato: sha256={hash}
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    const expectedSignature = `sha256=${expectedHash}`;
    
    // Comparación segura (timing-safe)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
  } catch (error: any) {
    logger.warn('[WebhookSignature] Error validating eBay signature', {
      error: error.message,
    });
    return { valid: false, error: error.message };
  }
}

/**
 * ✅ FASE 3: Validar firma HMAC para MercadoLibre
 * MercadoLibre usa header x-signature con SHA256
 */
function validateMercadoLibreSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): SignatureValidationResult {
  if (!secret) {
    return { valid: false, error: 'WEBHOOK_SECRET_MERCADOLIBRE not configured' };
  }

  if (!signature) {
    return { valid: false, error: 'x-signature header missing' };
  }

  try {
    // MercadoLibre usa formato: sha256={hash}
    // También puede incluir el user_id: sha256={hash},{user_id}
    const hashPart = signature.split(',')[0].replace('sha256=', '');
    
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Comparación segura (timing-safe)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hashPart),
      Buffer.from(expectedHash)
    );

    return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
  } catch (error: any) {
    logger.warn('[WebhookSignature] Error validating MercadoLibre signature', {
      error: error.message,
    });
    return { valid: false, error: error.message };
  }
}

/**
 * ✅ FASE 3: Validar firma HMAC para Amazon
 * Amazon usa header x-amzn-signature con HMAC-SHA256
 */
function validateAmazonSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): SignatureValidationResult {
  if (!secret) {
    return { valid: false, error: 'WEBHOOK_SECRET_AMAZON not configured' };
  }

  if (!signature) {
    return { valid: false, error: 'x-amzn-signature header missing' };
  }

  try {
    // Amazon puede usar diferentes formatos, pero generalmente es HMAC-SHA256
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Amazon puede usar formato base64 o hex
    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedHash)
      );
    } catch {
      // Intentar con base64
      const expectedBase64 = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedBase64)
      );
    }

    return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
  } catch (error: any) {
    logger.warn('[WebhookSignature] Error validating Amazon signature', {
      error: error.message,
    });
    return { valid: false, error: error.message };
  }
}

/**
 * ✅ FASE 3: Middleware factory para validar firmas de webhooks
 */
export function createWebhookSignatureValidator(marketplace: MarketplaceWebhook) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // ✅ FASE 3: Feature flag para habilitar/deshabilitar validación
    const verifySignature = process.env[`WEBHOOK_VERIFY_SIGNATURE_${marketplace.toUpperCase()}`] !== 'false';
    const globalVerify = process.env.WEBHOOK_VERIFY_SIGNATURE !== 'false';
    
    // Si está deshabilitado globalmente o para este marketplace, saltar validación
    if (!verifySignature || !globalVerify) {
      const isProduction = env.NODE_ENV === 'production';
      if (isProduction && !verifySignature) {
        logger.warn('[WebhookSignature] Signature verification disabled in production', {
          marketplace,
          warning: 'This is a security risk!',
        });
      } else {
        logger.debug('[WebhookSignature] Signature verification disabled', {
          marketplace,
        });
      }
      return next();
    }

    // Obtener payload (body raw para firma)
    const payload = req.body ? (typeof req.body === 'string' 
      ? req.body 
      : JSON.stringify(req.body)) : '';
    
    // Obtener secret desde env
    const secretEnvVar = `WEBHOOK_SECRET_${marketplace.toUpperCase()}`;
    const secret = process.env[secretEnvVar];

    // Validar según marketplace
    let validation: SignatureValidationResult;
    const signatureHeader = req.headers[getSignatureHeaderName(marketplace).toLowerCase()] as string;

    switch (marketplace) {
      case 'ebay':
        validation = validateEbaySignature(payload, signatureHeader || '', secret || '');
        break;
      case 'mercadolibre':
        validation = validateMercadoLibreSignature(payload, signatureHeader || '', secret || '');
        break;
      case 'amazon':
        validation = validateAmazonSignature(payload, signatureHeader || '', secret || '');
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown marketplace: ${marketplace}`,
        });
    }

    if (!validation.valid) {
      const isProduction = env.NODE_ENV === 'production';
      
      // ✅ FASE 3: En producción, rechazar webhooks sin firma válida
      // En desarrollo, solo warning si el flag lo permite
      if (isProduction) {
        logger.error('[WebhookSignature] Invalid webhook signature rejected', {
          marketplace,
          error: validation.error,
          requestId: req.headers['x-correlation-id'],
          ip: req.ip,
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
      } else {
        // Desarrollo: warning pero permitir si WEBHOOK_ALLOW_INVALID_SIGNATURE=true
        const allowInvalid = process.env.WEBHOOK_ALLOW_INVALID_SIGNATURE === 'true';
        
        logger.warn('[WebhookSignature] Invalid webhook signature (dev mode)', {
          marketplace,
          error: validation.error,
          allowed: allowInvalid,
        });

        if (!allowInvalid) {
          return res.status(401).json({
            success: false,
            error: 'Invalid signature',
          });
        }
      }
    } else {
      logger.debug('[WebhookSignature] Signature validated successfully', {
        marketplace,
      });
    }

    next();
  };
}

/**
 * ✅ FASE 3: Obtener nombre del header de firma según marketplace
 */
function getSignatureHeaderName(marketplace: MarketplaceWebhook): string {
  switch (marketplace) {
    case 'ebay':
      return 'X-EBAY-SIGNATURE';
    case 'mercadolibre':
      return 'x-signature';
    case 'amazon':
      return 'x-amzn-signature';
    default:
      return 'x-signature';
  }
}

