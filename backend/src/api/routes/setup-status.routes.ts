import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { APIAvailabilityService } from '../../services/api-availability.service';
import {
  getWebhookStatus,
  summarizeConnectorReadinessFromStatuses,
} from '../../services/webhook-readiness.service';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

const apiAvailability = new APIAvailabilityService();

function pickPreferredStatus(existing: any, candidate: any) {
  if (!existing) return candidate;

  const score = (status: any) => {
    let value = 0;
    if (status.environment === 'production') value += 8;
    if (status.isAvailable === true) value += 4;
    if (status.isConfigured === true) value += 2;
    if (status.status === 'healthy') value += 1;
    return value;
  };

  return score(candidate) > score(existing) ? candidate : existing;
}

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
      const webhookStatusError = getWebhookStatus();
      return res.json({
        success: true,
        setupRequired: true,
        webhookStatus: webhookStatusError,
        reason: 'error_checking_apis',
        message: 'No se pudo verificar el estado de las APIs; el sistema queda bloqueado por seguridad'
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

    const dedupedStatuses: any[] = Array.from(
      validStatuses.reduce((map, status) => {
        const key = String(status.apiName).toLowerCase();
        map.set(key, pickPreferredStatus(map.get(key), status));
        return map;
      }, new Map<string, any>()).values()
    );

    const readiness = summarizeConnectorReadinessFromStatuses(dedupedStatuses, getWebhookStatus());
    const operationalStatuses = dedupedStatuses.filter(s => s.isConfigured === true && s.isAvailable === true);
    const configuredAPIs = dedupedStatuses.filter(s => s.isConfigured === true);
    const totalAPIs = dedupedStatuses.length;

    // Definir APIs mínimas requeridas para considerar el setup "completo"
    // Para un SaaS funcional, necesitamos al menos:
    // - Una API de marketplace (eBay, Amazon, o MercadoLibre)
    // - Una API de búsqueda/scraping (AliExpress Affiliate o ScraperAPI)
    const hasMarketplace = dedupedStatuses.some(s => {
      if (!s || !s.apiName) return false;
      const apiNameLower = s.apiName.toLowerCase();
      return ['ebay', 'amazon', 'mercadolibre'].includes(apiNameLower) && s.isConfigured === true && s.isAvailable === true;
    });
    
    const hasSearchAPI = dedupedStatuses.some(s => {
      if (!s || !s.apiName) return false;
      const apiNameLower = s.apiName.toLowerCase();
      return ['aliexpress-affiliate', 'scraperapi', 'zenrows', 'aliexpress-dropshipping'].includes(apiNameLower) && s.isConfigured === true && s.isAvailable === true;
    });

    // Setup requerido si no hay marketplace O no hay API de búsqueda
    const hasAutomationReadyMarketplace = Object.values(readiness.connectors).some(
      (connector) => connector.automationReady
    );
    const setupRequired = !hasMarketplace || !hasSearchAPI || !hasAutomationReadyMarketplace;
    const webhookStatus = readiness.webhookStatus;

    return res.json({
      success: true,
      setupRequired,
      configuredCount: configuredAPIs.length,
      totalCount: totalAPIs,
      hasMarketplace,
      hasSearchAPI,
      webhookStatus,
      connectorReadiness: readiness.connectors,
      automationReadyMarketplaceCount: readiness.automationReadyCount,
      missingRequirements: {
        marketplace: !hasMarketplace,
        searchAPI: !hasSearchAPI,
        webhookAutomation: !hasAutomationReadyMarketplace,
      },
      operationalCount: operationalStatuses.length,
      configuredAPIs: configuredAPIs
        .filter(s => s && s.apiName) // ✅ FIX: Filtrar entradas inválidas antes de mapear
        .map(s => ({
          apiName: s.apiName || 'unknown',
          name: s.name || s.apiName || 'Unknown API',
          isAvailable: s.isAvailable === true,
          environment: s.environment || 'production',
          operational: s.isConfigured === true && s.isAvailable === true
        })),
      message: setupRequired
        ? 'Setup parcial: se requiere al menos un marketplace operativo con webhook listo para automatización'
        : 'Setup operativo y listo para automatización'
    });
  } catch (error: any) {
    logger.error('[Setup Status] Unexpected error', {
      userId: req.user?.userId,
      error: error?.message || String(error),
      stack: error?.stack
    });
    
    // ✅ FIX: Siempre retornar 200 OK con success:true, nunca 500
    // El endpoint debe ser resiliente y retornar defaults seguros
    const webhookStatusFallback = getWebhookStatus();
    return res.status(200).json({
      success: true,
      setupRequired: true,
      configuredCount: 0,
      totalCount: 0,
      hasMarketplace: false,
      hasSearchAPI: false,
      webhookStatus: webhookStatusFallback,
      missingRequirements: {
        marketplace: true,
        searchAPI: true,
        webhookAutomation: true,
      },
      configuredAPIs: [],
      message: 'No se pudo verificar el estado de las APIs; automatización bloqueada por seguridad',
      warnings: ['Error al verificar estado de APIs. Algunas funcionalidades pueden estar limitadas.']
    });
  }
});

export default router;

