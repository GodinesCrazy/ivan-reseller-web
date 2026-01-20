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
    let allStatuses: any[];
    try {
      const rawStatuses = await apiAvailability.getAllAPIStatus(userId);
      
      // ✅ FIX: Validar que es un array válido
      if (!Array.isArray(rawStatuses)) {
        logger.warn('[Setup Status] getAllAPIStatus returned non-array', {
          userId,
          type: typeof rawStatuses,
          value: rawStatuses
        });
        allStatuses = [];
      } else {
        allStatuses = rawStatuses;
      }
    } catch (error: any) {
      logger.error('[Setup Status] Error getting API statuses', {
        userId,
        error: error?.message || String(error),
        stack: error?.stack
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

    // ✅ FIX: Filtrar entradas inválidas y loggear warnings
    const validStatuses = allStatuses.filter((s, index) => {
      if (!s) {
        logger.warn('[Setup Status] Found undefined/null status entry', {
          userId,
          index,
          totalStatuses: allStatuses.length
        });
        return false;
      }
      if (!s.apiName || typeof s.apiName !== 'string') {
        logger.warn('[Setup Status] Found status entry without valid apiName', {
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

    // Contar APIs configuradas (solo válidas)
    const configuredAPIs = validStatuses.filter(s => s.isConfigured === true);
    const totalAPIs = validStatuses.length;

    // Definir APIs mínimas requeridas para considerar el setup "completo"
    // Para un SaaS funcional, necesitamos al menos:
    // - Una API de marketplace (eBay, Amazon, o MercadoLibre)
    // - Una API de búsqueda/scraping (AliExpress Affiliate o ScraperAPI)
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
      configuredAPIs: configuredAPIs
        .filter(s => s && s.apiName) // ✅ FIX: Filtrar entradas inválidas antes de mapear
        .map(s => ({
          apiName: s.apiName || 'unknown',
          name: s.name || s.apiName || 'Unknown API',
          isAvailable: s.isAvailable === true
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

