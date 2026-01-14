import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { APIAvailabilityService } from '../../services/api-availability.service';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

const apiAvailability = new APIAvailabilityService();

/**
 * GET /api/setup-status
 * 
 * Detecta si el sistema requiere configuración inicial de APIs.
 * Devuelve un estado claro que el frontend puede usar para mostrar
 * la pantalla de setup en lugar de intentar cargar datos.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        setupRequired: false
      });
    }

    // Obtener estado de todas las APIs
    let allStatuses;
    try {
      allStatuses = await apiAvailability.getAllAPIStatus(userId);
    } catch (error: any) {
      logger.error('[Setup Status] Error getting API statuses', {
        userId,
        error: error?.message || String(error)
      });
      // Si falla obtener estados, asumir que setup está completo
      // (mejor mostrar dashboard con errores que bloquear completamente)
      return res.json({
        success: true,
        setupRequired: false,
        reason: 'error_checking_apis',
        message: 'No se pudo verificar el estado de las APIs'
      });
    }

    // Contar APIs configuradas
    const configuredAPIs = allStatuses.filter(s => s.isConfigured);
    const totalAPIs = allStatuses.length;

    // Definir APIs mínimas requeridas para considerar el setup "completo"
    // Para un SaaS funcional, necesitamos al menos:
    // - Una API de marketplace (eBay, Amazon, o MercadoLibre)
    // - Una API de búsqueda/scraping (AliExpress Affiliate o ScraperAPI)
    const hasMarketplace = allStatuses.some(s => 
      ['ebay', 'amazon', 'mercadolibre'].includes(s.apiName.toLowerCase()) && s.isConfigured
    );
    const hasSearchAPI = allStatuses.some(s => 
      ['aliexpress-affiliate', 'scraperapi', 'zenrows'].includes(s.apiName.toLowerCase()) && s.isConfigured
    );

    // Setup requerido si no hay marketplace O no hay API de búsqueda
    const setupRequired = !hasMarketplace || !hasSearchAPI;

    return res.json({
      success: true,
      setupRequired,
      configuredCount: configuredAPIs.length,
      totalCount: totalAPIs,
      hasMarketplace,
      hasSearchAPI,
      missingRequirements: {
        marketplace: !hasMarketplace,
        searchAPI: !hasSearchAPI
      },
      configuredAPIs: configuredAPIs.map(s => ({
        apiName: s.apiName,
        name: s.name,
        isAvailable: s.isAvailable
      })),
      message: setupRequired
        ? 'Configura al menos un marketplace y una API de búsqueda para comenzar'
        : 'Setup completo'
    });
  } catch (error: any) {
    logger.error('[Setup Status] Unexpected error', {
      userId: req.user?.userId,
      error: error?.message || String(error),
      stack: error?.stack
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      setupRequired: false
    });
  }
});

export default router;

