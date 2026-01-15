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
    
    const hasMarketplace = allStatuses.some(s => 
      ['ebay', 'amazon', 'mercadolibre'].includes(s.apiName.toLowerCase()) && s.isConfigured
    );
    
    const hasSearchAPI = allStatuses.some(s => 
      ['aliexpress-affiliate', 'scraperapi', 'zenrows'].includes(s.apiName.toLowerCase()) && s.isConfigured
    );
    
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
      error: error?.message || String(error)
    });
    // Si falla, asumir que setup está completo (mejor mostrar dashboard con errores)
    return {
      setupRequired: false,
      hasMarketplace: false,
      hasSearchAPI: false
    };
  }
}

/**
 * Middleware helper: devuelve respuesta de setup_required si es necesario
 * Retorna true si debe detenerse (setup requerido), false si puede continuar
 */
export async function handleSetupCheck(
  userId: number | undefined,
  res: any
): Promise<boolean> {
  if (!userId) {
    return false; // No detener, dejar que el middleware de auth maneje
  }
  
  const setupStatus = await checkSetupStatus(userId);
  
  if (setupStatus.setupRequired) {
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
  }
  
  return false; // Continuar normalmente
}

