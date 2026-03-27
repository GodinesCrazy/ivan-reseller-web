import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface SetupStatus {
  setupRequired: boolean;
  hasMarketplace: boolean;
  hasSearchAPI: boolean;
  reason?: string;
}

/**
 * Verifica si el setup está completo para un usuario
 * Setup completo = tiene al menos un marketplace Y una API de búsqueda configurados
 */
export async function checkSetupStatus(userId: number): Promise<SetupStatus> {
  try {
    const [marketplaceCount, searchApiCount] = await Promise.all([
      prisma.apiCredential.count({
        where: {
          userId,
          isActive: true,
          apiName: { in: ['ebay', 'amazon', 'mercadolibre'] },
        },
      }),
      prisma.apiCredential.count({
        where: {
          userId,
          isActive: true,
          apiName: { in: ['aliexpress-affiliate', 'scraperapi', 'zenrows'] },
        },
      }),
    ]);

    const hasMarketplace = marketplaceCount > 0;
    const hasSearchAPI = searchApiCount > 0;
    const setupRequired = !hasMarketplace || !hasSearchAPI;
    
    return {
      setupRequired,
      hasMarketplace,
      hasSearchAPI,
      reason: setupRequired 
        ? (!hasMarketplace ? 'missing_marketplace' : 'missing_search_api')
        : undefined
    };
  } catch (error: any) {
    logger.error('[Setup Check] Error checking setup status', {
      userId,
      error: error?.message || String(error),
      stack: error?.stack
    });
    // Si falla, asumir que setup está completo (mejor mostrar dashboard con errores)
    return {
      setupRequired: false,
      hasMarketplace: false,
      hasSearchAPI: false,
      reason: 'error_checking_status'
    };
  }
}

/**
 * Middleware helper: devuelve respuesta de setup_required si es necesario
 * Retorna true si debe detenerse (setup requerido), false si puede continuar
 * ✅ FIX: Nunca debe crashear - siempre retorna boolean
 */
export async function handleSetupCheck(
  userId: number | undefined,
  res: any
): Promise<boolean> {
  if (!userId) {
    return false; // No detener, dejar que el middleware de auth maneje
  }
  
  try {
    const setupStatus = await checkSetupStatus(userId);
    
    if (setupStatus.setupRequired) {
      try {
        res.status(200).json({
          success: false,
          setupRequired: true,
          error: 'setup_required',
          message: 'Configura al menos un marketplace y una API de búsqueda para comenzar',
          missingRequirements: {
            marketplace: !setupStatus.hasMarketplace,
            searchAPI: !setupStatus.hasSearchAPI
          }
        });
        return true; // Detener ejecución
      } catch (responseError: any) {
        // Si ya se envió respuesta, loggear pero no crashear
        logger.warn('[Setup Check] Error sending setup_required response', {
          userId,
          error: responseError?.message || String(responseError)
        });
        return true; // Asumir que se detuvo
      }
    }
    
    return false; // Continuar normalmente
  } catch (error: any) {
    // ✅ FIX: Si checkSetupStatus falla, loggear pero NO crashear el endpoint
    logger.error('[Setup Check] Error in handleSetupCheck', {
      userId,
      error: error?.message || String(error),
      stack: error?.stack
    });
    // Retornar false para continuar - el endpoint debe funcionar aunque el setup check falle
    return false;
  }
}

