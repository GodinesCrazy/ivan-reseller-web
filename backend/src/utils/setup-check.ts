import { APIAvailabilityService } from '../services/api-availability.service';
import { logger } from '../config/logger';

const apiAvailability = new APIAvailabilityService();

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
    const allStatuses = await apiAvailability.getAllAPIStatus(userId);
    
    // ✅ FIX: Validar que allStatuses es un array válido
    if (!Array.isArray(allStatuses)) {
      logger.warn('[Setup Check] getAllAPIStatus returned non-array', {
        userId,
        type: typeof allStatuses,
        value: allStatuses
      });
      return {
        setupRequired: false,
        hasMarketplace: false,
        hasSearchAPI: false,
        reason: 'invalid_status_format'
      };
    }
    
    // ✅ FIX: Filtrar entradas inválidas y loggear warnings
    const validStatuses = allStatuses.filter((s, index) => {
      if (!s) {
        logger.warn('[Setup Check] Found undefined/null status entry', {
          userId,
          index,
          totalStatuses: allStatuses.length
        });
        return false;
      }
      if (!s.apiName || typeof s.apiName !== 'string') {
        logger.warn('[Setup Check] Found status entry without valid apiName', {
          userId,
          index,
          status: s,
          apiNameType: typeof s.apiName,
          apiNameValue: s.apiName
        });
        return false;
      }
      return true;
    });
    
    // ✅ FIX: Validar con guards antes de acceder a propiedades
    const hasMarketplace = validStatuses.some(s => {
      if (!s || !s.apiName) return false;
      const apiNameLower = s.apiName.toLowerCase();
      return ['ebay', 'amazon', 'mercadolibre'].includes(apiNameLower) && s.isConfigured === true;
    });
    
    const hasSearchAPI = validStatuses.some(s => {
      if (!s || !s.apiName) return false;
      const apiNameLower = s.apiName.toLowerCase();
      return ['aliexpress-affiliate', 'scraperapi', 'zenrows'].includes(apiNameLower) && s.isConfigured === true;
    });
    
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

