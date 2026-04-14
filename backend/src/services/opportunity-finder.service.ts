import { trace } from '../utils/boot-trace';
trace('loading opportunity-finder.service');

import scraperBridge from './scraper-bridge.service';
import notificationService from './notification.service';
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';
import ManualAuthRequiredError from '../errors/manual-auth-required.error';
import { AppError } from '../middleware/error.middleware';
import competitorAnalyzer from './competitor-analyzer.service';
import costCalculator from './cost-calculator.service';
import opportunityPersistence from './opportunity.service';
import MarketplaceService from './marketplace.service';
import fxService from './fx.service';
import { formatPriceByCurrency } from '../utils/currency.utils';
import { workflowConfigService } from './workflow-config.service';
import { logger } from '../config/logger';
import taxCalculatorService from './tax-calculator.service'; // ✅ MEJORADO: Servicio de impuestos
import { regionToCountryCode } from './destination.service';
import { getGoogleTrendsService, type TrendData } from './google-trends.service'; // ✅ NUEVO: Google Trends para validar demanda real
// ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
import { scrapingHttpClient } from '../config/http-client';
// ✅ PRODUCTION READY: Retry logic para operaciones de scraping
import { retryWithBackoff, isRetryableError } from '../utils/retry';
import {
  DEFAULT_COMPARATOR_MARKETPLACES,
  OPTIONAL_MARKETPLACES,
} from '../config/marketplaces.config';
import type {
  CommercialTruthMeta,
  OpportunityFilters,
  OpportunityItem,
  PipelineDiagnostics,
  PublishingDecision,
  PublishingDecisionResult,
} from './opportunity-finder.types';
import { normalizeOpportunityPagination } from '../utils/opportunity-search-pagination';
import { computeMinimumViablePrice } from './canonical-cost-engine.service';
import { getEffectiveShippingCostForPublish } from '../utils/shipping.utils';
import { filterDiscoveryProductsByPackageTier } from '../utils/opportunity-package-tier.utils';
import {
  aliexpressAffiliateAPIService,
  parseAffiliateDeliveryDaysMax,
  type AffiliateProduct,
} from './aliexpress-affiliate-api.service';
import { mapAffiliateProductToDiscoveryRow } from './opportunity-affiliate-mapping';
import { env } from '../config/env';
import { supplyQuoteService } from './supply-quote.service';
import type { SupplyDiscoveryDiagnostics } from './supply-quote.types';
import { buildOpportunityEconomicSupplyQuote } from './opportunity-economic-quote.mapper';

export type {
  OpportunityFilters,
  OpportunityItem,
  OpportunitySupplyDiagnostics,
  OpportunityEconomicSupplyQuote,
  PipelineDiagnostics,
} from './opportunity-finder.types';

function listingsToCompetitionLevel(n: number): 'low' | 'medium' | 'high' | 'unknown' {
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n < 6) return 'low';
  if (n < 15) return 'medium';
  return 'high';
}

/** FX convert for opportunity pipeline; logs and returns raw amount only if same currency or convert throws. */
function opportunityFxConvert(amount: number, from: string, to: string, context: string): number {
  const f = String(from || 'USD').toUpperCase();
  const t = String(to || 'USD').toUpperCase();
  if (!Number.isFinite(amount)) return amount;
  if (f === t) return amount;
  try {
    return fxService.convert(amount, f, t);
  } catch (e: any) {
    logger.warn('[OPPORTUNITY-FINDER] FX conversion failed', {
      context,
      from: f,
      to: t,
      amount,
      error: e?.message || String(e),
    });
    return amount;
  }
}

/**
 * Automatic publishability decision model.
 * Evaluates an opportunity against hard criteria and returns a structured decision.
 * Decision is 'PUBLICABLE' when hard safety criteria are met:
 *   - feesConsidered populated (canonical pricing computed)
 *   - profitMargin >= minMarginPct
 *   - comparables evidence OR (fallback mode enabled + structural marketplace block)
 *   - product has images and URL
 * Returns a result with canPublish = true ONLY for PUBLICABLE.
 */
function computePublishingDecision(params: {
  opp: OpportunityItem;
  comparablesCount: number;
  dataSource?: string;
  probeCodes: string[];
  minMarginPct: number;
}): PublishingDecisionResult {
  const { opp, comparablesCount, dataSource, probeCodes, minMarginPct } = params;
  const reasons: string[] = [];
  const realMarginPct = opp.profitMargin * 100;
  const minimumViablePriceUsd = opp.feesConsidered?.totalCost ?? 0;
  const ipBlocked = probeCodes.some((c) => c.includes('IP_BLOCKED'));
  const structuralBlock = ipBlocked || probeCodes.some(
    (c) => c.includes('FORBIDDEN') || c.includes('UNAUTHORIZED') || c.includes('NETWORK') || c.includes('TIMEOUT')
  );
  const allowCostBasedPublishWithoutComparables = !['0', 'false', 'no', 'off'].includes(
    String(process.env.ALLOW_COST_BASED_PUBLISH_WITHOUT_COMPARABLES ?? 'true').trim().toLowerCase()
  );
  const base = {
    checkedAt: new Date().toISOString(),
    comparablesCount,
    dataSource,
    realMarginPct,
    minimumViablePriceUsd,
    suggestedPriceUsd: opp.suggestedPriceUsd,
  };

  // Gate 1 — enrichment: product must have images and URL
  const hasImages = Array.isArray(opp.images) && opp.images.length > 0;
  const hasUrl = !!(opp.aliexpressUrl && opp.aliexpressUrl.length > 10);
  const hasTitle = !!(opp.title?.trim());
  if (!hasImages || !hasUrl || !hasTitle) {
    const missing = [!hasImages && 'imágenes', !hasUrl && 'URL', !hasTitle && 'título'].filter(Boolean).join(', ');
    reasons.push(`Datos incompletos del producto: falta ${missing}`);
    return { ...base, decision: 'NEEDS_ENRICHMENT', reasons, canPublish: false };
  }

  // Gate 2 — fees: canonical pricing must have been computed
  const feesOk = opp.feesConsidered && Object.keys(opp.feesConsidered).length > 0;
  if (!feesOk) {
    reasons.push('No se calcularon fees canónicos — falta breakdown de marketplace fee, payment fee e import duties');
    return { ...base, decision: 'NEEDS_ENRICHMENT', reasons, canPublish: false };
  }

  // Gate 3 — margin
  if (realMarginPct < minMarginPct - 0.5) {
    reasons.push(`Margen real ${realMarginPct.toFixed(1)}% < mínimo requerido ${minMarginPct.toFixed(1)}%`);
    reasons.push(`Precio sugerido $${opp.suggestedPriceUsd.toFixed(2)} insuficiente para cubrir fees y objetivo de margen`);
    return { ...base, decision: 'REJECTED_LOW_MARGIN', reasons, canPublish: false };
  }

  // Gate 4 — competitor evidence
  if (comparablesCount === 0) {
    if (structuralBlock) {
      if (allowCostBasedPublishWithoutComparables) {
        reasons.push(
          'Publicación habilitada en modo fallback por costos: no hay comparables por bloqueo estructural de marketplace.'
        );
        if (ipBlocked) {
          reasons.push(
            'ML OAuth activo pero búsquedas bloqueadas por IP (GET /sites/MLC/search → 403 con/sin token).'
          );
        }
        reasons.push(
          `Precio sugerido $${opp.suggestedPriceUsd.toFixed(2)} calculado con motor canónico (costos + fees + margen mínimo).`
        );
        reasons.push(
          'Recomendación: publicar y monitorear señal real de mercado para reajustar precio en la primera iteración.'
        );
        probeCodes.filter(Boolean).forEach((code) => reasons.push(`Probe: ${code}`));
        return { ...base, decision: 'PUBLICABLE', reasons, canPublish: true };
      }
      if (ipBlocked) {
        reasons.push('ML OAuth activo pero búsquedas bloqueadas por IP desde Railway (GET /sites/MLC/search → 403 con y sin token)');
        reasons.push('testConnection() pasa (/users/{id} no bloqueado), pero search endpoint sí lo está');
        reasons.push('Solución: scraper-bridge en IP no bloqueada (SCRAPER_BRIDGE_ENABLED=true + SCRAPER_BRIDGE_URL)');
      } else {
        reasons.push('Sin acceso a datos de mercado — bloqueo estructural de plataforma (ej: ML 403 desde IPs Railway)');
        reasons.push(`Precio $${opp.suggestedPriceUsd.toFixed(2)} es el mínimo rentable canónico, no el precio de mercado real`);
        reasons.push('Para publicar: scraper-bridge en producción o proxy ML en IP no bloqueada');
      }
      probeCodes.filter(Boolean).forEach((code) => reasons.push(`Probe: ${code}`));
      return { ...base, decision: 'NEEDS_MARKET_DATA', reasons, canPublish: false };
    }
    reasons.push('Búsqueda de mercado ejecutada correctamente pero sin resultados para este producto y región');
    reasons.push('Considera ampliar la búsqueda o probar otra región/categoría');
    return { ...base, decision: 'REJECTED_NO_COMPETITOR_EVIDENCE', reasons, canPublish: false };
  }

  // Gate 5 — insufficient comparables (< 3 = weak evidence)
  if (comparablesCount < 3) {
    if (structuralBlock && allowCostBasedPublishWithoutComparables) {
      reasons.push(
        `Solo ${comparablesCount} comparable(s), pero se habilita fallback por bloqueo estructural en proveedores de mercado.`
      );
      reasons.push(
        `Precio sugerido $${opp.suggestedPriceUsd.toFixed(2)} validado por costos + fees + margen mínimo.`
      );
      reasons.push('Recomendación: ejecutar ajuste dinámico de precio tras primeras señales de conversión.');
      probeCodes.filter(Boolean).forEach((code) => reasons.push(`Probe: ${code}`));
      return { ...base, decision: 'PUBLICABLE', reasons, canPublish: true };
    }
    reasons.push(`Solo ${comparablesCount} comparable(s) encontrado(s) — se requieren ≥ 3 para decisión confiable`);
    reasons.push(`Fuente parcial: ${dataSource ?? 'desconocida'}`);
    return { ...base, decision: 'NEEDS_MARKET_DATA', reasons, canPublish: false };
  }

  // All gates passed — PUBLICABLE
  reasons.push(`${comparablesCount} comparables reales obtenidos de ${dataSource ?? 'marketplace'}`);
  reasons.push(`Margen canónico ${realMarginPct.toFixed(1)}% ≥ mínimo ${minMarginPct.toFixed(1)}%`);
  reasons.push(`Precio sugerido: $${opp.suggestedPriceUsd.toFixed(2)} USD (cobertura de fees verificada)`);
  return { ...base, decision: 'PUBLICABLE', reasons, canPublish: true };
}

class OpportunityFinderService {
  private minMargin = Number(process.env.MIN_OPPORTUNITY_MARGIN || '0.10'); // ✅ Reducido de 0.20 a 0.10 para permitir más oportunidades válidas
  private duplicateThreshold = Number(process.env.OPPORTUNITY_DUPLICATE_THRESHOLD || '0.85'); // Similarity threshold (85%)
  // ✅ NUEVO: Filtros de calidad para garantizar oportunidades reales
  private minSearchVolume = Number(process.env.MIN_SEARCH_VOLUME || '100'); // Volumen mínimo de búsqueda
  private minTrendConfidence = Number(process.env.MIN_TREND_CONFIDENCE || '30'); // Confianza mínima de tendencias (%)
  private maxTimeToFirstSale = Number(process.env.MAX_TIME_TO_FIRST_SALE || '60'); // Días máximos hasta primera venta
  private maxBreakEvenTime = Number(process.env.MAX_BREAK_EVEN_TIME || '90'); // Días máximos hasta break-even
  // ✅ Spec product selection: supplier filters (default 0 or 999 = off to preserve current behavior)
  private minSupplierOrders = Number(process.env.MIN_SUPPLIER_ORDERS || '0');
  private minSupplierRating = Number(process.env.MIN_SUPPLIER_RATING || '0');
  private minSupplierReviews = Number(process.env.MIN_SUPPLIER_REVIEWS || '0');
  private maxShippingDays = Number(process.env.MAX_SHIPPING_DAYS || '999');
  private minSupplierScorePct = Number(process.env.MIN_SUPPLIER_SCORE_PCT || '0');
  /** Spec market validation: sales_competition_ratio = estimated_sales / listing_count >= this (default 0 = off) */
  private minSalesCompetitionRatio = Number(process.env.MIN_SALES_COMPETITION_RATIO || '0');

  /**
   * ✅ NUEVO: Detectar y eliminar oportunidades duplicadas o muy similares
   */
  private deduplicateOpportunities(opportunities: OpportunityItem[]): OpportunityItem[] {
    if (opportunities.length <= 1) return opportunities;

    const unique: OpportunityItem[] = [];
    const processed: Set<number> = new Set();

    for (let i = 0; i < opportunities.length; i++) {
      if (processed.has(i)) continue;

      const current = opportunities[i];
      let isDuplicate = false;

      // Comparar con oportunidades ya procesadas
      for (const existing of unique) {
        const similarity = this.calculateSimilarity(current, existing);
        
        if (similarity >= this.duplicateThreshold) {
          isDuplicate = true;
          
          // Mantener la oportunidad con mejor ROI o margen
          if (current.roiPercentage > existing.roiPercentage || 
              current.profitMargin > existing.profitMargin) {
            // Reemplazar la existente con la actual
            const index = unique.indexOf(existing);
            unique[index] = current;
          }
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(current);
      }

      processed.add(i);
    }

    const removed = opportunities.length - unique.length;
    if (removed > 0) {
      logger.info('Oportunidades duplicadas eliminadas', {
        service: 'opportunity-finder',
        original: opportunities.length,
        unique: unique.length,
        removed
      });
    }

    return unique;
  }

  /**
   * Apply spec supplier filters (orders, rating, reviews, shipping days, supplier score).
   * When env thresholds are 0 or 999 (max days), filtering is disabled so current behavior is preserved.
   * When a value is missing on the opportunity, we allow it (no reject).
   */
  private applySupplierFilters(opportunities: OpportunityItem[]): OpportunityItem[] {
    if (this.minSupplierOrders <= 0 && this.minSupplierRating <= 0 && this.minSupplierReviews <= 0 &&
        this.maxShippingDays >= 999 && this.minSupplierScorePct <= 0) {
      return opportunities;
    }
    const filtered = opportunities.filter((opp) => {
      if (this.minSupplierOrders > 0 && opp.supplierOrdersCount != null && opp.supplierOrdersCount < this.minSupplierOrders) {
        logger.debug('[OPPORTUNITY-FINDER] Filtered by supplier orders', { title: opp.title?.substring(0, 40), supplierOrdersCount: opp.supplierOrdersCount, min: this.minSupplierOrders });
        return false;
      }
      if (this.minSupplierRating > 0 && opp.supplierRating != null && opp.supplierRating < this.minSupplierRating) {
        logger.debug('[OPPORTUNITY-FINDER] Filtered by supplier rating', { title: opp.title?.substring(0, 40), supplierRating: opp.supplierRating, min: this.minSupplierRating });
        return false;
      }
      if (this.minSupplierReviews > 0 && opp.supplierReviewsCount != null && opp.supplierReviewsCount < this.minSupplierReviews) {
        logger.debug('[OPPORTUNITY-FINDER] Filtered by supplier reviews', { title: opp.title?.substring(0, 40), supplierReviewsCount: opp.supplierReviewsCount, min: this.minSupplierReviews });
        return false;
      }
      if (this.maxShippingDays < 999 && opp.shippingDaysMax != null && opp.shippingDaysMax > this.maxShippingDays) {
        logger.debug('[OPPORTUNITY-FINDER] Filtered by shipping days', { title: opp.title?.substring(0, 40), shippingDaysMax: opp.shippingDaysMax, max: this.maxShippingDays });
        return false;
      }
      if (this.minSupplierScorePct > 0 && opp.supplierScorePct != null && opp.supplierScorePct < this.minSupplierScorePct) {
        logger.debug('[OPPORTUNITY-FINDER] Filtered by supplier score', { title: opp.title?.substring(0, 40), supplierScorePct: opp.supplierScorePct, min: this.minSupplierScorePct });
        return false;
      }
      return true;
    });
    const supplierRemoved = opportunities.length - filtered.length;
    if (supplierRemoved > 0) {
      logger.info('[OPPORTUNITY-FINDER] Supplier filters applied', {
        original: opportunities.length,
        afterFilters: filtered.length,
        removed: supplierRemoved,
        thresholds: {
          minSupplierOrders: this.minSupplierOrders,
          minSupplierRating: this.minSupplierRating,
          minSupplierReviews: this.minSupplierReviews,
          maxShippingDays: this.maxShippingDays,
          minSupplierScorePct: this.minSupplierScorePct,
        },
      });
    }
    return filtered;
  }

  /**
   * ✅ NUEVO: Calcular similitud entre dos oportunidades (0-1)
   */
  private calculateSimilarity(a: OpportunityItem, b: OpportunityItem): number {
    let similarity = 0;
    let factors = 0;

    // 1. Similitud de título (usando Jaccard similarity de palabras)
    const titleSimilarity = this.textSimilarity(a.title, b.title);
    similarity += titleSimilarity * 0.4; // 40% peso
    factors += 0.4;

    // 2. Similitud de URL (mismo dominio/dominio similar)
    const urlA = a.productUrl || a.aliexpressUrl;
    const urlB = b.productUrl || b.aliexpressUrl;
    const urlSimilarity = this.urlSimilarity(urlA, urlB);
    similarity += urlSimilarity * 0.3; // 30% peso
    factors += 0.3;

    // 3. Similitud de precio (muy similar = probablemente mismo producto)
    const priceA = a.price || a.costUsd;
    const priceB = b.price || b.costUsd;
    const priceSimilarity = this.priceSimilarity(priceA, priceB);
    similarity += priceSimilarity * 0.2; // 20% peso
    factors += 0.2;

    // 4. Similitud de categoría
    if (a.category && b.category) {
      const categorySimilarity = a.category.toLowerCase() === b.category.toLowerCase() ? 1 : 0;
      similarity += categorySimilarity * 0.1; // 10% peso
      factors += 0.1;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Calcular similitud de texto usando Jaccard similarity
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calcular similitud de URL
   */
  private urlSimilarity(url1: string, url2: string): number {
    try {
      const u1 = new URL(url1);
      const u2 = new URL(url2);

      // Mismo dominio = alta similitud
      if (u1.hostname === u2.hostname) {
        // Comparar pathname
        const path1 = u1.pathname.split('/').filter(p => p.length > 0);
        const path2 = u2.pathname.split('/').filter(p => p.length > 0);
        
        if (path1.length > 0 && path2.length > 0) {
          // Si comparten partes del path, alta similitud
          const commonPaths = path1.filter(p => path2.includes(p));
          return commonPaths.length / Math.max(path1.length, path2.length);
        }
        return 0.8; // Mismo dominio pero path diferente
      }

      // Dominios similares (subdominios del mismo dominio base)
      const domain1 = u1.hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
      const domain2 = u2.hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
      if (domain1 === domain2) {
        return 0.6;
      }

      return 0;
    } catch {
      // Si no se pueden parsear URLs, comparar strings directamente
      return url1 === url2 ? 1 : 0;
    }
  }

  /**
   * ✅ NUEVO: Estimar tiempo hasta primera venta basado en volumen de búsqueda, tendencia y competencia
   */
  private estimateTimeToFirstSale(
    searchVolume: number,
    trend: 'rising' | 'stable' | 'declining',
    competitorCount: number
  ): number {
    // Base: días estimados hasta primera venta
    let days = 30; // Por defecto 30 días
    
    // Ajustar según volumen de búsqueda
    if (searchVolume > 5000) {
      days -= 15; // Alta demanda = venta más rápida
    } else if (searchVolume > 1000) {
      days -= 10;
    } else if (searchVolume < 100) {
      days += 20; // Baja demanda = venta más lenta
    }
    
    // Ajustar según tendencia
    if (trend === 'rising') {
      days -= 10; // Tendencia creciente = venta más rápida
    } else if (trend === 'declining') {
      days += 15; // Tendencia declinante = venta más lenta
    }
    
    // Ajustar según competencia
    if (competitorCount < 10) {
      days -= 5; // Poca competencia = venta más rápida
    } else if (competitorCount > 50) {
      days += 10; // Mucha competencia = venta más lenta
    }
    
    // Mínimo 3 días, máximo 90 días
    return Math.max(3, Math.min(90, days));
  }

  /**
   * ✅ NUEVO: Calcular tiempo hasta recuperar inversión (break-even)
   */
  private calculateBreakEvenTime(
    profitPerUnit: number,
    searchVolume: number,
    trend: 'rising' | 'stable' | 'declining'
  ): number {
    if (profitPerUnit <= 0) return 999; // Nunca recupera
    
    // Estimación de tasa de conversión basada en volumen de búsqueda
    // Alta demanda = mayor tasa de conversión
    let conversionRate = 0.01; // 1% por defecto
    
    if (searchVolume > 5000) {
      conversionRate = 0.03; // 3% para alta demanda
    } else if (searchVolume > 1000) {
      conversionRate = 0.02; // 2% para demanda media-alta
    } else if (searchVolume < 100) {
      conversionRate = 0.005; // 0.5% para baja demanda
    }
    
    // Ajustar por tendencia
    if (trend === 'rising') {
      conversionRate *= 1.5; // +50% si está en crecimiento
    } else if (trend === 'declining') {
      conversionRate *= 0.7; // -30% si está declinando
    }
    
    // Calcular ventas estimadas por día
    // Asumir que volumen de búsqueda mensual se distribuye en 30 días
    const estimatedDailySales = (searchVolume / 30) * conversionRate; // Búsquedas por día * conversión
    
    // Si no hay búsquedas estimadas, usar mínimo razonable
    const dailySalesAdjusted = Math.max(0.01, estimatedDailySales); // Mínimo 0.01 ventas/día
    
    // Calcular ganancia diaria
    const dailyProfit = dailySalesAdjusted * profitPerUnit;
    
    // Asumir inversión inicial = costo de 5 unidades (para empezar)
    // Para simplificar: si profitPerUnit es X, entonces costUnit = X * algún factor
    // Usamos una estimación conservadora: inversión = 5 * (ganancia unitaria * 10)
    // Esto asume que el costo es ~10x la ganancia (margen ~10%)
    const estimatedCostPerUnit = profitPerUnit / 0.1; // Asumir margen del 10%
    const initialInvestment = 5 * estimatedCostPerUnit; // Stock inicial de 5 unidades
    
    // Días hasta break-even
    if (dailyProfit <= 0) return 999;
    const breakEvenDays = initialInvestment / dailyProfit;
    
    return Math.max(1, Math.ceil(breakEvenDays));
  }

  /**
   * Calcular similitud de precio
   */
  private priceSimilarity(price1: number, price2: number): number {
    if (price1 === 0 && price2 === 0) return 1;
    if (price1 === 0 || price2 === 0) return 0;

    const diff = Math.abs(price1 - price2);
    const avg = (price1 + price2) / 2;
    const percentDiff = diff / avg;

    // Si la diferencia es menor al 5%, considerar muy similar
    if (percentDiff < 0.05) return 1;
    // Si la diferencia es menor al 15%, considerar similar
    if (percentDiff < 0.15) return 0.8;
    // Si la diferencia es menor al 30%, considerar algo similar
    if (percentDiff < 0.30) return 0.5;

    return 0;
  }

  /**
   * Fallback profit engine when Affiliate returns 0 products.
   * Order: 1) eBay, 2) ScraperAPI/ZenRows, 3) Cache, 4) AI Arbitrage. Solo productos reales.
   */
  private async findProductsUsingFallbackEngine(
    query: string,
    userId: number,
    config: { minProfitUsd: number; minRoiPct: number; maxItems: number; baseCurrency: string; environment: 'sandbox' | 'production'; marketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'>; region: string }
  ): Promise<Array<{
    title: string;
    price: number;
    priceMin?: number;
    priceMax?: number;
    priceMinSource?: number;
    priceMaxSource?: number;
    priceRangeSourceCurrency?: string;
    currency: string;
    sourcePrice?: number;
    sourceCurrency?: string;
    productUrl: string;
    imageUrl?: string;
    images?: string[];
    productId?: string;
    shippingCost?: number;
  }>> {
    const { minProfitUsd, minRoiPct, maxItems, baseCurrency } = config;

    type Discovery = {
      title: string;
      price: number;
      priceMin?: number;
      priceMax?: number;
      currency: string;
      sourcePrice?: number;
      sourceCurrency?: string;
      productUrl: string;
      imageUrl?: string;
      images?: string[];
      productId?: string;
      shippingCost?: number;
      estimatedProfit?: number;
      roi?: number;
      source?: 'ebay' | 'scraper' | 'cache' | 'ai';
    };

    // PRIORITY 1 — EBAY
    try {
      const marketplaceService = new MarketplaceService();
      const creds = await marketplaceService.getCredentials(userId, 'ebay', config.environment);
      if (creds?.credentials) {
        const { default: EbayService } = await import('./ebay.service');
        const ebay = new EbayService({
          ...(creds.credentials as any),
          sandbox: config.environment === 'sandbox',
        });
        const ebayProducts = await ebay.searchProducts({ keywords: query, limit: 20 });
        if (ebayProducts?.length > 0) {
          console.log('[AUTOPILOT] EBAY FALLBACK SUCCESS:', ebayProducts.length);
          return ebayProducts.map((p: any) => {
            const priceVal = parseFloat(p.price?.value ?? '0') || 0;
            const img = p.image?.imageUrl || '';
            const estimatedProfit = priceVal > 0 ? priceVal * 0.5 : 0;
            const roi = priceVal > 0 ? (estimatedProfit / priceVal) * 100 : 0;
            return {
              title: p.title || 'eBay product',
              price: priceVal,
              priceMin: priceVal,
              priceMax: priceVal,
              currency: p.price?.currency || baseCurrency,
              sourcePrice: priceVal,
              sourceCurrency: p.price?.currency || 'USD',
              productUrl: p.itemWebUrl || `https://www.ebay.com/itm/${p.itemId || ''}`,
              imageUrl: img || undefined,
              images: img ? [img] : [],
              productId: p.itemId,
              estimatedProfit,
              roi,
              source: 'ebay',
            } as Discovery;
          });
        }
      }
    } catch (e) {
      /* fall through */
    }
    console.log('[AUTOPILOT] EBAY FALLBACK FAILED');

    // PRIORITY 2 — SCRAPER (ScraperAPI / ZenRows) — NEW products from AliExpress
    try {
      const externalProducts = await this.tryExternalScrapingAPIs(userId, query, maxItems);
      if (externalProducts?.length > 0) {
        console.log('[AUTOPILOT] SCRAPER FALLBACK SUCCESS:', externalProducts.length);
        return externalProducts.map((p: any) => {
          const priceVal = Number(p.price) || Number(p.sourcePrice) || 0;
          const estimatedProfit = priceVal > 0 ? priceVal * 0.4 : 0;
          const roi = priceVal > 0 ? (estimatedProfit / priceVal) * 100 : 0;
          return {
            title: p.title || 'Product',
            price: priceVal,
            priceMin: priceVal,
            priceMax: priceVal,
            currency: baseCurrency,
            sourcePrice: priceVal,
            sourceCurrency: p.sourceCurrency || 'USD',
            productUrl: p.productUrl || p.url || '',
            imageUrl: p.imageUrl || p.images?.[0],
            images: Array.isArray(p.images) ? p.images : (p.imageUrl ? [p.imageUrl] : []),
            productId: p.productId,
            shippingCost: p.shippingCost,
            estimatedProfit,
            roi,
            source: 'scraper' as const,
          } satisfies Discovery;
        });
      }
    } catch (e: any) {
      logger.warn('[OPPORTUNITY-FINDER] Scraper fallback failed', { error: e?.message });
    }
    console.log('[AUTOPILOT] SCRAPER FALLBACK FAILED');

    // PRIORITY 3 — CACHE
    try {
      const { prisma } = await import('../config/database');
      const cachedProducts = await prisma.product.findMany({
        where: { userId, status: { in: ['APPROVED', 'PUBLISHED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      const mapped = cachedProducts
        .map((p) => {
          const cost = Number(p.aliexpressPrice || 0);
          const suggested = Number(p.suggestedPrice || p.finalPrice || cost * 1.5);
          const estimatedProfit = suggested - cost;
          const roi = cost > 0 ? (estimatedProfit / cost) * 100 : 0;
          if (estimatedProfit < minProfitUsd || roi < minRoiPct) return null;
          const imgs: string[] = [];
          try {
            const arr = JSON.parse(p.images || '[]');
            if (Array.isArray(arr)) imgs.push(...arr.filter((x: any) => typeof x === 'string'));
          } catch { /* ignore */ }
          return {
            title: p.title,
            price: cost,
            priceMin: cost,
            priceMax: cost,
            currency: baseCurrency,
            sourcePrice: cost,
            sourceCurrency: p.currency || 'USD',
            productUrl: p.aliexpressUrl,
            imageUrl: imgs[0],
            images: imgs.length > 0 ? imgs : undefined,
            productId: String(p.id),
            shippingCost: p.shippingCost != null ? Number(p.shippingCost) : undefined,
            estimatedProfit,
            roi,
            source: 'cache',
          } as Discovery;
        })
        .filter(Boolean) as Discovery[];
      if (mapped.length > 0) {
        console.log('[AUTOPILOT] CACHE FALLBACK SUCCESS:', mapped.length);
        return mapped;
      }
    } catch (err: any) {
      logger.warn('[OPPORTUNITY-FINDER] Fallback cache error', { error: err?.message });
    }
    console.log('[AUTOPILOT] CACHE FALLBACK FAILED');

    // PRIORITY 4 — AI ARBITRAGE ENGINE
    try {
      const { aiOpportunityEngine } = await import('./ai-opportunity.service');
      const aiProducts = await aiOpportunityEngine.findArbitrageOpportunities(query, { maxResults: 20 });
      if (aiProducts?.length > 0) {
        console.log('[AUTOPILOT] AI FALLBACK SUCCESS:', aiProducts.length);
        return aiProducts.map((opp: any) => {
          const src = opp.sourceProduct;
          const priceVal = src?.price?.value != null ? parseFloat(String(src.price.value)) : (opp.investment?.initialCost ?? opp.estimatedProfit ?? 10);
          const url = src?.itemWebUrl || src?.url || `https://fallback.ai/${encodeURIComponent(opp.title || '')}`;
          const img = src?.image?.imageUrl || (Array.isArray(src?.images) ? src.images[0] : undefined);
          return {
            title: opp.title || 'AI opportunity',
            price: priceVal,
            priceMin: priceVal,
            priceMax: priceVal,
            currency: baseCurrency,
            sourcePrice: priceVal,
            sourceCurrency: 'USD',
            productUrl: url,
            imageUrl: img,
            images: img ? [img] : [],
            productId: opp.id || src?.itemId,
            estimatedProfit: opp.estimatedProfit,
            roi: opp.profitMargin != null ? opp.profitMargin * 100 : undefined,
            source: 'ai',
          } as Discovery;
        });
      }
    } catch (_) {
      /* fall through */
    }
    console.log('[AUTOPILOT] AI FALLBACK FAILED');

    // ✅ Solo productos reales: eBay, Scraper, Cache, AI. Sin productos de ejemplo.
    logger.info('[OPPORTUNITY-FINDER] All fallback sources failed — no real products found');
    return [];
  }

  async findOpportunities(userId: number, filters: OpportunityFilters): Promise<OpportunityItem[]> {
    const query = filters.query?.trim();
    if (!query) return [];

    // FASE 0E: Log active thresholds on every pipeline run so operators can verify env vars are applied.
    logger.info('[OPPORTUNITY-FINDER] Active thresholds', {
      minMargin: this.minMargin,
      duplicateThreshold: this.duplicateThreshold,
      minSearchVolume: this.minSearchVolume,
      minTrendConfidence: this.minTrendConfidence,
      minSupplierOrders: this.minSupplierOrders,
      minSupplierRating: this.minSupplierRating,
      minSupplierReviews: this.minSupplierReviews,
      maxShippingDays: this.maxShippingDays,
      minSupplierScorePct: this.minSupplierScorePct,
      minSalesCompetitionRatio: this.minSalesCompetitionRatio,
    });

    const { pageSize, pageNo } = normalizeOpportunityPagination(filters.maxItems, filters.pageNo);
    const maxItems = pageSize;
    const requestedMarketplaces = (filters.marketplaces && filters.marketplaces.length > 0)
      ? filters.marketplaces
      : DEFAULT_COMPARATOR_MARKETPLACES;
    const region = filters.region || 'us';

    // ✅ MEDIA PRIORIDAD: Obtener environment del usuario si no se especificó (con logger estructurado)
    let environment: 'sandbox' | 'production' = filters.environment || 'production';
    if (!filters.environment) {
      try {
        environment = await workflowConfigService.getUserEnvironment(userId);
      } catch (error: any) {
        logger.warn('No se pudo obtener environment del usuario, usando production por defecto', {
          service: 'opportunity-finder',
          userId,
          error: error?.message || String(error),
          fallback: 'production'
        });
        environment = 'production';
      }
    }

    logger.info('Búsqueda de oportunidades iniciada', {
      service: 'opportunity-finder',
      userId,
      query,
      environment,
      maxItems,
      pageNo,
      marketplaces: requestedMarketplaces
    });

    const credentialDiagnostics: Record<string, { issues: string[]; warnings: string[] }> = {};
    const marketplaceService = new MarketplaceService();

    const usableMarketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'> = [];

    for (const mp of requestedMarketplaces) {
      try {
        const status = await marketplaceService.getCredentials(userId, mp);
        if (!status || !status.credentials || !status.isActive) {
          const optional = OPTIONAL_MARKETPLACES.includes(mp as any);
          credentialDiagnostics[mp] = {
            issues: optional ? [] : [`No encontramos credenciales activas de ${mp} para tu usuario.`],
            warnings: optional
              ? [`${mp} es opcional. Configúralo para mejorar la precisión.`]
              : [],
          };
          continue;
        }
        usableMarketplaces.push(mp);
        credentialDiagnostics[mp] = {
          issues: status.issues || [],
          warnings: status.warnings || [],
        };
      } catch (credError: any) {
        credentialDiagnostics[mp] = {
          issues: OPTIONAL_MARKETPLACES.includes(mp as any)
            ? []
            : [`Error leyendo credenciales de ${mp}: ${credError?.message || String(credError)}`],
          warnings: OPTIONAL_MARKETPLACES.includes(mp as any)
            ? [`${mp} es opcional. Error al validar: ${credError?.message || String(credError)}`]
            : [],
        };
      }
    }

    const marketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'> =
      usableMarketplaces.length > 0 ? usableMarketplaces : requestedMarketplaces;

    // 1) Product discovery: AFFILIATE API ONLY (no scraping)
    const useAffiliateOnly = true; // ✅ Force real source: AliExpress Affiliate API only
    let products: Array<{
      title: string;
      price: number;
      priceMin?: number;
      priceMax?: number;
      priceMinSource?: number;
      priceMaxSource?: number;
      priceRangeSourceCurrency?: string;
      priceSource?: string;
      currency: string;
      sourcePrice?: number;
      sourceCurrency?: string;
      productUrl: string;
      imageUrl?: string;
      productId?: string;
      images?: string[];
      shippingCost?: number;
      supplierSource?: 'cj';
      supplyMeta?: import('./supply-quote.types').SupplyRowMeta;
    }> = [];
    let supplyPipelineDiagnostics: SupplyDiscoveryDiagnostics | undefined;
    let manualAuthPending = false;
    let manualAuthError: ManualAuthRequiredError | null = null;
    let nativeErrorForLogs: any = null;

    const userSettingsService = (await import('./user-settings.service')).default;
    const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
    const oppCommerce = await userSettingsService.getOpportunityCommerceSettings(userId);
    logger.info('[OPPORTUNITY-FINDER] Using user base currency', { userId, baseCurrency });
    logger.info('[OPPORTUNITY-FINDER] Package tier commerce settings', {
      userId,
      allowedTiers: [...oppCommerce.allowedTiers],
      smallMaxUsd: oppCommerce.smallMaxPriceUsd,
      mediumMaxUsd: oppCommerce.mediumMaxPriceUsd,
      defaultShippingUsd: oppCommerce.defaultShippingUsd,
    });

    const sourcesTried: string[] = [];

    const runDiscoveryFallback = async (): Promise<void> => {
      sourcesTried.push('fallback');
      const fallbackProducts = await this.findProductsUsingFallbackEngine(query, userId, {
        minProfitUsd: 1,
        minRoiPct: 15,
        maxItems,
        baseCurrency: baseCurrency || 'USD',
        environment,
        marketplaces,
        region,
      });
      console.log('[AUTOPILOT] Legacy fallback restored:', fallbackProducts.length);
      products = fallbackProducts;
    };

    // ✅ Phase B: unified supply-quote (Affiliate + CJ per preference / OPPORTUNITY_CJ_SUPPLY_MODE), then legacy fallback
    if (useAffiliateOnly) {
      console.log('[AUTOPILOT] Discovery: supply-quote (AliExpress Affiliate + optional CJ)');
      try {
        const sq = await supplyQuoteService.discoverForOpportunities({
          userId,
          query,
          maxItems,
          pageNo,
          baseCurrency: baseCurrency || 'USD',
          region,
          environment,
          defaultShippingUsd: oppCommerce.defaultShippingUsd,
        });
        products = sq.rows as typeof products;
        supplyPipelineDiagnostics = sq.diagnostics;
        for (const s of sq.diagnostics.sourcesTried) {
          if (!sourcesTried.includes(s)) sourcesTried.push(s);
        }
        if (sq.diagnostics.notes.length > 0) {
          logger.info('[OPPORTUNITY-FINDER] Supply pipeline notes', {
            userId,
            notes: sq.diagnostics.notes,
            degradedPartial: sq.diagnostics.degradedPartial,
          });
        }
        if (products.length > 0) {
          const hasCjRow = products.some((p) => p.supplierSource === 'cj');
          if (hasCjRow && supplyPipelineDiagnostics) {
            try {
              const { applySelectiveCjDeepFreightQuotes } = await import('./cj-opportunity-deep-quote.service');
              const deepDiag = await applySelectiveCjDeepFreightQuotes({
                userId,
                rows: products,
                defaultShippingUsd: oppCommerce.defaultShippingUsd,
              });
              supplyPipelineDiagnostics = { ...supplyPipelineDiagnostics, deepQuote: deepDiag };
              if (deepDiag.degraded || deepDiag.rateLimited) {
                logger.info('[OPPORTUNITY-FINDER] CJ deep quote degraded', {
                  userId,
                  rateLimited: deepDiag.rateLimited,
                  succeeded: deepDiag.succeeded,
                  failed: deepDiag.failed,
                  notes: deepDiag.notes,
                });
              }
            } catch (deepErr: unknown) {
              logger.warn('[OPPORTUNITY-FINDER] CJ deep quote failed (non-fatal)', {
                userId,
                message: deepErr instanceof Error ? deepErr.message : String(deepErr),
              });
              supplyPipelineDiagnostics = {
                ...supplyPipelineDiagnostics,
                deepQuote: {
                  enabled: true,
                  maxCandidates: env.OPPORTUNITY_CJ_DEEP_QUOTE_MAX,
                  minSpacingMs: env.OPPORTUNITY_CJ_DEEP_QUOTE_MIN_SPACING_MS,
                  quantity: 1,
                  attempted: 0,
                  succeeded: 0,
                  servedFromCache: 0,
                  skippedMultiVariant: 0,
                  skippedNoProductId: 0,
                  failed: 0,
                  rateLimited: false,
                  degraded: true,
                  notes: ['deep_quote_exception'],
                },
              };
            }
          }
          logger.info('[OPPORTUNITY-FINDER] Supply-quote products', {
            count: products.length,
            preference: sq.diagnostics.preference,
            cjSupplyMode: sq.diagnostics.cjSupplyMode,
          });
        } else {
          console.log('[AUTOPILOT] Supply-quote empty — legacy fallback (eBay, Scraper, Cache, AI)');
          try {
            await runDiscoveryFallback();
          } catch (fbErr: any) {
            logger.error('[OPPORTUNITY-FINDER] Legacy fallback failed', { error: fbErr?.message });
          }
        }
      } catch (supplyErr: any) {
        logger.warn('[OPPORTUNITY-FINDER] Supply-quote failed, legacy fallback', {
          error: supplyErr?.message,
          query,
        });
        try {
          await runDiscoveryFallback();
        } catch (fbErr: any) {
          logger.error('[OPPORTUNITY-FINDER] Legacy fallback also failed', { error: fbErr?.message });
        }
      }
    }

    // A) AliExpress Affiliate API (when not useAffiliateOnly - disabled when useAffiliateOnly is true)
    if (!useAffiliateOnly && products.length === 0) {
      try {
        sourcesTried.push('affiliate');
        logger.info('[PIPELINE][DISCOVER][SOURCE=affiliate]', { query });
        const { CredentialsManager } = await import('./credentials-manager.service');
        let affiliateCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', environment);
        if (!affiliateCreds && (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY) && (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET)) {
          affiliateCreds = {
            appKey: String(process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY).trim(),
            appSecret: String(process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET).trim(),
            trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
            sandbox: false,
          } as any;
          logger.info('[OPPORTUNITY-FINDER] Using Affiliate API credentials from env (fallback)');
        }
        if (affiliateCreds) {
          aliexpressAffiliateAPIService.setCredentials(affiliateCreds as import('../types/api-credentials.types').AliExpressAffiliateCredentials);
          const countryCode = regionToCountryCode(region);
          const affiliateResultB = await aliexpressAffiliateAPIService.searchProducts({
            keywords: query,
            pageNo,
            pageSize: maxItems,
            targetCurrency: baseCurrency,
            shipToCountry: countryCode,
          });
          const rawProductsB = affiliateResultB?.products;
          const apiProducts = Array.isArray(rawProductsB) ? rawProductsB : [];
          if (apiProducts.length > 0) {
            const enrichShipToB =
              countryCode && String(countryCode).trim().length >= 2 ? String(countryCode).toUpperCase() : 'US';
            await aliexpressAffiliateAPIService.enrichProductsWithDetailShipping(apiProducts, {
              shipToCountry: enrichShipToB,
              targetCurrency: baseCurrency || 'USD',
            });
            const mapped = apiProducts
              .map((p) => mapAffiliateProductToDiscoveryRow(p, baseCurrency))
              .filter(
                (p: any) =>
                  p.title &&
                  (p.price || 0) > 0 &&
                  p.productUrl &&
                  p.productUrl.length > 10 &&
                  p.images &&
                  p.images.length > 0
              );
            products = mapped;
            if (products.length > 0) {
              logger.info('[PIPELINE][DISCOVER][SOURCE=affiliate]', { count: products.length });
            }
          }
        }
      } catch (affiliateError: any) {
        logger.warn('[OPPORTUNITY-FINDER] Affiliate API failed (soft fail)', {
          error: affiliateError?.message,
          query,
        });
        logger.info('[PIPELINE][DISCOVER][SOURCE=affiliate]', { count: 0, error: affiliateError?.message });
      }
    }

    // B) Native Scraper (Puppeteer) - DISABLED when useAffiliateOnly
    const scraper = useAffiliateOnly ? null : new AdvancedMarketplaceScraper();
    let scraperInitialized = false;
    if (!useAffiliateOnly && products.length === 0) {
    try {
      sourcesTried.push('native');
      logger.info('[PIPELINE][DISCOVER][SOURCE=native]', { query });
      // ✅ HOTFIX: Verificar feature flags antes de intentar scraping
      const { env } = await import('../config/env');
      const allowBrowserAutomation = env.ALLOW_BROWSER_AUTOMATION;
      const dataSource = env.ALIEXPRESS_DATA_SOURCE;
      
      logger.info('[OPPORTUNITY-FINDER] scrapeAliExpress will attempt: 1) AliExpress Affiliate API → 2) Native scraping (Puppeteer)', { 
        query,
        userId,
        environment,
        baseCurrency,
        dataSource,
        allowBrowserAutomation
      });

      // ✅ Inicializar scraper explícitamente antes de usar (solo si automation está permitido)
      if (!scraper['browser'] && allowBrowserAutomation) {
        logger.debug('[OPPORTUNITY-FINDER] Initializing browser');
        try {
          await scraper['init']();
          scraperInitialized = true;
          logger.info('[OPPORTUNITY-FINDER] Browser initialized successfully');
        } catch (initError: any) {
          logger.error('[OPPORTUNITY-FINDER] Browser initialization failed', {
            error: initError?.message || String(initError),
            stack: initError?.stack
          });
          throw initError;
        }
      }

      logger.debug('[OPPORTUNITY-FINDER] Calling scrapeAliExpress', { query, userId, environment, baseCurrency });
      const scrapeStartTime = Date.now();
      const items = await scraper.scrapeAliExpress(userId, query, environment, baseCurrency, { nativeOnly: true });
      const scrapeDuration = Date.now() - scrapeStartTime;
      logger.info('[OPPORTUNITY-FINDER] scrapeAliExpress completed', {
        count: items?.length || 0,
        duration: `${scrapeDuration}ms`,
        query,
        userId
      });

      products = (items || [])
        .slice(0, maxItems)
        .map((p: any) => {
          const rangeCurrency = String(
            p.priceRangeSourceCurrency || p.sourceCurrency || p.currency || baseCurrency || 'USD'
          ).toUpperCase();

          const sourcePriceCandidates = [
            typeof p.priceMaxSource === 'number' && p.priceMaxSource > 0 ? p.priceMaxSource : null,
            typeof p.sourcePrice === 'number' && p.sourcePrice > 0 ? p.sourcePrice : null,
            typeof p.priceMinSource === 'number' && p.priceMinSource > 0 ? p.priceMinSource : null,
          ].filter((value): value is number => typeof value === 'number');
          let sourcePrice = sourcePriceCandidates.length > 0 ? sourcePriceCandidates[0] : 0;

          const basePriceCandidates = [
            typeof p.priceMax === 'number' && p.priceMax > 0 ? p.priceMax : null,
            typeof p.price === 'number' && p.price > 0 ? p.price : null,
            typeof p.priceMin === 'number' && p.priceMin > 0 ? p.priceMin : null,
          ].filter((value): value is number => typeof value === 'number');
          let priceInBase = basePriceCandidates.length > 0 ? basePriceCandidates[0] : 0;
          let detectedCurrency = rangeCurrency;

          // ✅ NOTA: La conversión ahora se hace correctamente en el scraper usando:
          // 1. Moneda local de AliExpress (extraída de la página)
          // 2. Moneda base del usuario (desde Settings)
          // Ya no necesitamos esta validación de reconversión porque la conversión inicial es correcta

          if (priceInBase <= 0 && sourcePrice > 0) {
            try {
              priceInBase = fxService.convert(sourcePrice, detectedCurrency, baseCurrency);
            } catch (error: any) {
              logger.warn('[OpportunityFinder] FX conversion failed, using source price', {
                from: detectedCurrency,
                to: baseCurrency,
                amount: sourcePrice,
                error: error?.message
              });
              // Fallback: usar precio sin convertir (asumir que ya está en baseCurrency si falla)
              priceInBase = sourcePrice;
            }
          }

          const priceMinBase =
            typeof p.priceMin === 'number' && p.priceMin > 0 ? p.priceMin : priceInBase;
          const priceMaxBase =
            typeof p.priceMax === 'number' && p.priceMax > 0 ? p.priceMax : priceInBase;

          // ✅ MEJORADO: Extraer shipping cost si está disponible
          let shippingCost = 0;
          if (p.shipping?.cost !== undefined && typeof p.shipping.cost === 'number' && p.shipping.cost > 0) {
            // Convertir shipping cost a moneda base si es necesario
            try {
              shippingCost = fxService.convert(p.shipping.cost, detectedCurrency, baseCurrency);
            } catch (error: any) {
              logger.warn('[OpportunityFinder] FX conversion failed for shipping cost', {
                from: detectedCurrency,
                to: baseCurrency,
                amount: p.shipping.cost,
                error: error?.message
              });
              shippingCost = p.shipping.cost; // Fallback: usar sin convertir
            }
          } else if (typeof p.shippingCost === 'number' && p.shippingCost > 0) {
            try {
              shippingCost = fxService.convert(p.shippingCost, detectedCurrency, baseCurrency);
            } catch (error: any) {
              logger.warn('[OpportunityFinder] FX conversion failed for shipping cost', {
                from: detectedCurrency,
                to: baseCurrency,
                amount: p.shippingCost,
                error: error?.message
              });
              shippingCost = p.shippingCost; // Fallback: usar sin convertir
            }
          }

          return {
            title: p.title,
            price: priceInBase,
            priceMin: priceMinBase,
            priceMax: priceMaxBase,
            priceMinSource:
              typeof p.priceMinSource === 'number' && p.priceMinSource > 0
                ? p.priceMinSource
                : sourcePrice,
            priceMaxSource: sourcePrice,
            priceRangeSourceCurrency: detectedCurrency, // ✅ Usar moneda detectada/corregida
            priceSource: p.priceSource,
            currency: baseCurrency,
            sourcePrice: sourcePrice,
            sourceCurrency: detectedCurrency, // ✅ Usar moneda detectada/corregida
            productUrl: p.productUrl,
            imageUrl: p.imageUrl,
            productId: p.productId || p.productUrl?.split('/').pop()?.split('.html')[0],
            images: Array.isArray(p.images) && p.images.length > 0 
              ? p.images.filter((img: any) => img && typeof img === 'string' && img.startsWith('http'))
              : undefined,
            shippingCost: shippingCost > 0 ? shippingCost : undefined, // ✅ MEJORADO: Shipping cost
          };
        })
        .filter(p => {
          // ✅ RESTAURACIÓN: Validación más permisiva para restaurar funcionalidad cuando funcionaba
          // Aceptar productos con precio mínimo (1) cuando no se puede detectar precio correctamente
          // Esto permite que productos extraídos durante bloqueo de AliExpress se procesen
          const hasTitle = p.title && p.title.trim().length > 0;
          const hasPrice = (p.price || 0) > 0;
          const hasSourcePrice = (p.sourcePrice || 0) > 0;
          const hasUrl = p.productUrl && p.productUrl.trim().length > 10;
          
          // Real data only: must have at least one real image URL
          const hasImages =
            (Array.isArray(p.images) && p.images.length > 0 && p.images.some((img: any) => img && String(img).startsWith('http'))) ||
            (p.imageUrl && String(p.imageUrl).startsWith('http'));
          const isValid = hasTitle && hasPrice && hasUrl && (hasSourcePrice || hasPrice) && hasImages;
          
          if (!isValid && p.title) {
            logger.debug('Producto filtrado (datos inválidos)', {
              service: 'opportunity-finder',
              title: p.title.substring(0, 50),
              hasTitle,
              price: p.price,
              sourcePrice: p.sourcePrice,
              hasPrice,
              hasSourcePrice,
              hasUrl: !!p.productUrl,
              urlLength: p.productUrl?.length || 0
            });
          }
          return isValid;
        });

      if (products.length > 0) {
        console.log('[PIPELINE][DISCOVER][SOURCE=native] count=', products.length);
        logger.info('[PIPELINE][DISCOVER][SOURCE=native]', { count: products.length });
        logger.info('✅ Scraping nativo exitoso', {
          service: 'opportunity-finder',
          query,
          userId,
          productsFound: products.length,
          environment,
          firstProducts: products.slice(0, 3).map(p => ({ 
            title: p.title?.substring(0, 50), 
            price: p.price, 
            sourcePrice: p.sourcePrice,
            hasImage: !!p.imageUrl,
            hasUrl: !!p.productUrl
          })),
          allProductsValid: products.every(p => {
            const hasTitle = p.title && p.title.trim().length > 0;
            const hasPrice = (p.price || 0) > 0;
            const hasUrl = p.productUrl && p.productUrl.trim().length > 10;
            return hasTitle && hasPrice && hasUrl;
          })
        });
      } else {
        logger.info('[PIPELINE][DISCOVER][SOURCE=native]', { count: 0 });
        logger.warn('⚠️ Scraping nativo no encontró productos', {
          service: 'opportunity-finder',
          query,
          userId,
          maxItems,
          environment,
          itemsRaw: items?.length || 0,
          filteredItems: items && items.length > 0 ? items.slice(0, 3).map((i: any) => ({ 
            title: i.title?.substring(0, 50), 
            price: i.price, 
            sourcePrice: i.sourcePrice,
            hasTitle: !!i.title,
            hasPrice: (i.price || 0) > 0,
            hasSourcePrice: (i.sourcePrice || 0) > 0,
            hasUrl: !!i.productUrl
          })) : [],
          possibleCauses: [
            'El scraper retornó vacío (posible bloqueo de AliExpress)',
            'Los productos no tienen precio válido (resolvePrice falló)',
            'Los productos no pasaron el filtro de validación',
            'El término de búsqueda no tiene resultados'
          ],
          action: 'Intentando Affiliate API y ScraperAPI/ZenRows'
        });
        // ✅ Forzar que se intente el bridge Python estableciendo products como vacío explícitamente
        products = [];
      }
    } catch (nativeError: any) {
      nativeErrorForLogs = nativeError;
      const errorMsg = nativeError?.message || String(nativeError);

      // ✅ SOFT FAIL: No exception aborts cascade - log and continue to next source
      if (nativeError?.details?.authRequired === true || nativeError?.errorCode === 'CREDENTIALS_ERROR') {
        logger.warn('[OPPORTUNITY-FINDER] AUTH_REQUIRED (soft fail): API credentials missing, continuing cascade', {
          service: 'opportunity-finder',
          userId,
          query,
          error: errorMsg,
        });
        // Do NOT throw - continue to bridge/fallbacks
      } else if (nativeError instanceof ManualAuthRequiredError) {
        logger.warn('[OPPORTUNITY-FINDER] CAPTCHA detectado (soft fail), continuing cascade', {
          service: 'opportunity-finder',
          userId,
          query,
          error: errorMsg
        });
        // Do NOT throw - continue to bridge/fallbacks
      } else {
        logger.warn('Error en scraping nativo (esperado si navegador no está disponible), continuando cascade', {
          service: 'opportunity-finder',
          userId,
          query,
          error: errorMsg,
          errorType: nativeError?.constructor?.name || 'Unknown',
          note: 'Continuando con Affiliate API y External.'
        });
      }

      // ✅ NO intentar resolver CAPTCHA aquí - mejor continuar directamente con bridge Python
      // El sistema de CAPTCHA manual se activará solo si el bridge Python también falla
    } finally {
      if (scraperInitialized) {
        await scraper.close().catch(() => { });
      }
    }
    } // end if !useAffiliateOnly && products.length === 0

    // C) Scraper Bridge - DISABLED when useAffiliateOnly
    if (!useAffiliateOnly && products.length === 0) {
    try {
      sourcesTried.push('bridge');
      const isBridgeAvailable = await scraperBridge.isAvailable().catch(() => false);
      if (isBridgeAvailable) {
          const items = await scraperBridge.aliexpressSearch({ query, maxItems, locale: 'es-ES' });
          if (items && items.length > 0) {
            products = (items as any[])
              .map((p: any) => {
                const sourceCurrency = String(p.currency || baseCurrency || 'USD').toUpperCase();
                const sourcePrice = Number(p.price) || 0;
                let priceInBase = sourcePrice;
                try { priceInBase = fxService.convert(sourcePrice, sourceCurrency, baseCurrency); } catch { priceInBase = sourcePrice; }
                let shippingCost = 0;
                if (typeof (p as any).shippingCost === 'number' && (p as any).shippingCost > 0) {
                  try { shippingCost = fxService.convert((p as any).shippingCost, sourceCurrency, baseCurrency); } catch { shippingCost = (p as any).shippingCost; }
                }
                return {
                  title: p.title,
                  price: priceInBase,
                  priceMin: priceInBase,
                  priceMax: priceInBase,
                  priceMinSource: sourcePrice,
                  priceMaxSource: sourcePrice,
                  priceRangeSourceCurrency: sourceCurrency,
                  currency: baseCurrency,
                  sourcePrice,
                  sourceCurrency,
                  productUrl: p.url || p.productUrl,
                  imageUrl: p.images?.[0] || p.image || p.imageUrl,
                  images: Array.isArray(p.images) ? p.images.filter((img: any) => img && typeof img === 'string' && img.startsWith('http')) : [],
                  productId: p.productId,
                  shippingCost: shippingCost > 0 ? shippingCost : undefined,
                };
              })
              .filter(
                (p: any) =>
                  p.title &&
                  (p.price || 0) > 0 &&
                  p.productUrl &&
                  p.productUrl.length > 10 &&
                  ((p.images && p.images.length > 0) || (p.imageUrl && p.imageUrl.startsWith('http')))
              );
            logger.info('[PIPELINE][DISCOVER][SOURCE=bridge]', { count: products.length });
            if (products.length > 0) {
              logger.info('[OPPORTUNITY-FINDER] Scraper bridge succeeded', { count: products.length });
            }
          }
      } else {
        logger.info('[PIPELINE][DISCOVER][SOURCE=bridge]', { count: 0, reason: 'not available' });
      }
    } catch (bridgeErr: any) {
      logger.warn('[OPPORTUNITY-FINDER] Scraper bridge failed (soft fail)', { error: bridgeErr?.message, query });
      logger.info('[PIPELINE][DISCOVER][SOURCE=bridge]', { count: 0, error: bridgeErr?.message });
    }
    }

    // D) External APIs (ScraperAPI / ZenRows) - DISABLED when useAffiliateOnly
    if (!useAffiliateOnly && (!products || products.length === 0)) {
      try {
        sourcesTried.push('external');
        logger.info('[PIPELINE][DISCOVER][SOURCE=external]', { query });
        const externalScrapingResult = await this.tryExternalScrapingAPIs(userId, query, maxItems);
        if (externalScrapingResult && externalScrapingResult.length > 0) {
          products = externalScrapingResult.filter(
            (p: any) =>
              p.title &&
              (p.price || 0) > 0 &&
              p.productUrl &&
              ((p.images && p.images.length > 0) || (p.imageUrl && String(p.imageUrl).startsWith('http')))
          );
          logger.info('[PIPELINE][DISCOVER][SOURCE=external]', { count: products.length });
        } else {
          logger.info('[PIPELINE][DISCOVER][SOURCE=external]', { count: 0 });
        }
      } catch (externalError: any) {
        logger.warn('[OPPORTUNITY-FINDER] External APIs failed (soft fail)', { error: externalError?.message, query });
        logger.info('[PIPELINE][DISCOVER][SOURCE=external]', { count: 0, error: externalError?.message });
      }
    }

    const beforePackageTierFilter = products.length;
    products = filterDiscoveryProductsByPackageTier(products as any[], oppCommerce, (amt, from) => {
      try {
        return fxService.convert(amt, from, 'USD');
      } catch {
        return amt;
      }
    });
    if (beforePackageTierFilter !== products.length) {
      logger.info('[OPPORTUNITY-FINDER] Package tier filter applied', {
        before: beforePackageTierFilter,
        after: products.length,
        allowed: [...oppCommerce.allowedTiers],
      });
    }

    if (!products || products.length === 0) {
      logger.warn('[OPPORTUNITY-FINDER] All sources failed - NO_REAL_PRODUCTS', {
        service: 'opportunity-finder',
        userId,
        query,
        sourcesTried,
      });
      const diag = filters._collectDiagnostics?.current;
      if (diag) {
        diag.sourcesTried = sourcesTried;
        diag.discovered = 0;
        diag.normalized = 0;
        diag.reason = 'NO_REAL_PRODUCTS';
      }
      return [];
    }

    const discoveredCount = products.length;
    const diag = filters._collectDiagnostics?.current;
    if (diag) {
      diag.sourcesTried = sourcesTried;
      diag.discovered = discoveredCount;
      diag.normalized = discoveredCount;
      if (supplyPipelineDiagnostics) {
        diag.supplyQuotePhaseB = supplyPipelineDiagnostics;
      }
    }
    logger.info('[PIPELINE][NORMALIZED]', { count: products.length });
    // 2) Analizar competencia real (placeholder hasta integrar servicios específicos)
    logger.info('[OPPORTUNITY-FINDER] Processing scraped products to find opportunities', { productCount: products.length });
    const effectiveMinMargin = filters.relaxedMargin ? Math.min(this.minMargin, 0.05) : this.minMargin;
    const opportunities: OpportunityItem[] = [];
    let skippedInvalid = 0;
    let skippedLowMargin = 0;
    let skippedLowDemand = 0; // ✅ NUEVO: Contador de productos descartados por baja demanda
    let skippedDecliningTrend = 0; // ✅ NUEVO: Contador de productos descartados por tendencia declinante
    let skippedLowVolume = 0; // ✅ NUEVO: Contador de productos descartados por bajo volumen de búsqueda
    let skippedSlowSale = 0; // ✅ NUEVO: Contador de productos descartados por tiempo largo hasta primera venta
    let skippedLongBreakEven = 0; // ✅ NUEVO: Contador de productos descartados por tiempo largo hasta break-even
    let skippedLowSalesRatio = 0; // ✅ Spec: sales_competition_ratio = estimated_sales / listing_count >= MIN_SALES_COMPETITION_RATIO
    let processedCount = 0;

    // ─── Pre-fetch competitor analyses in parallel batches ────────────────────
    // Previously each product's analysis ran sequentially (20 products × 3 marketplaces
    // × ~2-30s = 60-1800s total). Running in parallel batches of 5 reduces that to
    // ceil(N/5) rounds, delivering results ~5× faster and well within the 90s frontend timeout.
    const ANALYSIS_BATCH_SIZE = 5;
    const productAnalysisCache = new Map<(typeof products)[number], Record<string, any>>();
    const validProductsForAnalysis = products.filter(p => p.title && p.price && p.price > 0);
    logger.info('[OPPORTUNITY-FINDER] Pre-fetching competitor analyses in parallel', {
      total: validProductsForAnalysis.length,
      batchSize: ANALYSIS_BATCH_SIZE,
      batches: Math.ceil(validProductsForAnalysis.length / ANALYSIS_BATCH_SIZE),
    });
    for (let batchStart = 0; batchStart < validProductsForAnalysis.length; batchStart += ANALYSIS_BATCH_SIZE) {
      const batch = validProductsForAnalysis.slice(batchStart, batchStart + ANALYSIS_BATCH_SIZE);
      await Promise.all(
        batch.map(async (product) => {
          try {
            const a = await competitorAnalyzer.analyzeCompetition(
              userId,
              product.title,
              marketplaces as ('ebay' | 'amazon' | 'mercadolibre')[],
              region,
              environment
            );
            productAnalysisCache.set(product, a);
          } catch (err: any) {
            logger.warn('[OPPORTUNITY-FINDER] Competition analysis failed (pre-fetch), using heuristic fallback', {
              service: 'opportunity-finder',
              error: err?.message || String(err),
              title: product.title?.substring(0, 50),
            });
            productAnalysisCache.set(product, {});
          }
        })
      );
      logger.debug('[OPPORTUNITY-FINDER] Analysis batch done', {
        batchStart,
        batchEnd: batchStart + batch.length,
        total: validProductsForAnalysis.length,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    for (const product of products) {
      if (!product.title || !product.price || product.price <= 0) {
        skippedInvalid++;
        logger.debug('[OPPORTUNITY-FINDER] Product discarded (invalid)', {
          title: product.title?.substring(0, 50),
          price: product.price
        });
        continue;
      }

      processedCount++;
      logger.debug('[OPPORTUNITY-FINDER] Analyzing product', {
        progress: `${processedCount}/${products.length}`,
        title: product.title.substring(0, 60),
        price: product.price,
        currency: product.currency
      });

      // Use pre-fetched analysis result (populated above in parallel batches).
      const analysis: Record<string, any> = productAnalysisCache.get(product) ?? {};

      const competitionDiagnostics = Object.values(analysis || {}).map((a: any) => ({
        marketplace: String(a?.marketplace || ''),
        region: String(a?.region || region),
        listingsFound: typeof a?.listingsFound === 'number' ? a.listingsFound : 0,
        competitivePrice: typeof a?.competitivePrice === 'number' ? a.competitivePrice : 0,
        dataSource: a?.dataSource as string | undefined,
        probeCode: a?.competitionProbe?.code as string | undefined,
        probeDetail: a?.competitionProbe?.detail as string | undefined,
      }));

      // Agregar oportunidades solo si existe algún marketplace con datos reales
      const analyses = Object.values(analysis || {});
      const valid = analyses.find(a => a && a.listingsFound > 0 && a.competitivePrice > 0);

      if (valid) {
        logger.debug('Análisis de competencia encontrado', {
          service: 'opportunity-finder',
          marketplace: valid.marketplace,
          listingsFound: valid.listingsFound,
          competitivePrice: valid.competitivePrice
        });
      } else {
        logger.debug('No se encontraron datos de competencia válidos, usando estimación heurística', {
          service: 'opportunity-finder'
        });
      }

      let best = {
        margin: -Infinity,
        price: 0,
        priceBase: 0,
        mp: valid?.marketplace || marketplaces[0],
        currency: valid?.currency || baseCurrency,
      } as { margin: number; price: number; priceBase: number; mp: string; currency: string };
      let bestBreakdown: Record<string, number> = {};
      let estimatedFields: string[] = [];
      const estimationNotes: string[] = [];

      if (
        typeof product.priceMin === 'number' &&
        typeof product.priceMax === 'number' &&
        product.priceMax > 0
      ) {
        const variance = Math.abs(product.priceMax - product.priceMin);
        if (variance > product.priceMax * 0.1) {
          const minSrcValue =
            typeof product.priceMinSource === 'number' && product.priceMinSource > 0
              ? product.priceMinSource
              : product.sourcePrice;
          const maxSrcValue =
            typeof product.priceMaxSource === 'number' && product.priceMaxSource > 0
              ? product.priceMaxSource
              : product.sourcePrice;
          // ✅ Formatear precio según moneda
          const formatSource = (value: number | undefined) =>
            typeof value === 'number' && isFinite(value)
              ? formatPriceByCurrency(value, product.sourceCurrency || baseCurrency)
              : 'N/A';
          const sourceCurrencyLabel = product.sourceCurrency || baseCurrency;
          estimationNotes.push(
            `El proveedor reporta un rango de precios entre ${formatSource(minSrcValue)} y ${formatSource(maxSrcValue)} ${sourceCurrencyLabel}. Calculamos el margen usando el valor más alto.`
          );
        }
      }

      // ✅ MEJORADO: Obtener país destino para cálculo de impuestos
      // Mapear región a código de país (ej: 'us' -> 'US', 'cl' -> 'CL')
      const countryCode = region ? region.toUpperCase() : 'US'; // Por defecto US
      const targetCountry = countryCode.length === 2 ? countryCode : 
        (countryCode === 'MEXICO' || countryCode === 'MX' ? 'MX' :
         countryCode === 'CHILE' || countryCode === 'CL' ? 'CL' :
         countryCode === 'SPAIN' || countryCode === 'ES' ? 'ES' : 'US');

      // ✅ MEJORADO: Obtener shipping cost del producto
      const productShippingCost = getEffectiveShippingCostForPublish(
        { shippingCost: product.shippingCost ?? null },
        undefined,
        { defaultUsd: oppCommerce.defaultShippingUsd }
      );
      /** Moneda real del precio proveedor (AliExpress); no usar baseCurrency del usuario aquí. */
      const supplierCostCurrency = String(
        product.sourceCurrency || product.currency || 'USD'
      ).toUpperCase();

      // ✅ MEJORADO: Calcular impuestos de importación
      let importTax = 0;
      if (productShippingCost > 0 || product.price > 0) {
        try {
          const subtotal = product.price + productShippingCost;
          const taxResult = taxCalculatorService.calculateTax(subtotal, targetCountry);
          importTax = taxResult.totalTax;
        } catch (taxError: any) {
          logger.warn('Error calculando impuestos, usando 0', {
            service: 'opportunity-finder',
            error: taxError?.message,
            country: targetCountry
          });
          importTax = 0;
        }
      }

      if (valid) {
        // 3) Calcular costos con el marketplace más favorable (max margen)
        for (const a of analyses) {
          if (!a || a.listingsFound <= 0 || a.competitivePrice <= 0) continue;
          const saleCurrency = String(a.currency || 'USD').toUpperCase();
          const shippingInSale = opportunityFxConvert(
            productShippingCost,
            supplierCostCurrency,
            saleCurrency,
            'opportunity-shipping-to-sale-currency'
          );
          const importTaxInSale = opportunityFxConvert(
            importTax,
            supplierCostCurrency,
            saleCurrency,
            'opportunity-import-tax-to-sale-currency'
          );
          const { breakdown, margin } = costCalculator.calculateAdvanced(
            a.marketplace as any,
            region,
            a.competitivePrice,
            product.price,
            saleCurrency,
            supplierCostCurrency,
            {
              shippingCost: shippingInSale,
              importTax: importTaxInSale,
              taxesPct: 0,
              otherCosts: 0,
            }
          );
          if (margin > best.margin) {
            const competitivePriceInBase =
              saleCurrency === baseCurrency.toUpperCase()
                ? a.competitivePrice
                : opportunityFxConvert(
                    a.competitivePrice,
                    saleCurrency,
                    baseCurrency,
                    'opportunity-competitive-to-base-currency'
                  );

            best = {
              margin,
              price: a.competitivePrice,
              priceBase: competitivePriceInBase,
              mp: a.marketplace,
              currency: saleCurrency,
            };
            bestBreakdown = breakdown as any;
          }
        }

        logger.debug('Margen calculado con datos reales', {
          service: 'opportunity-finder',
          margin: (best.margin * 100).toFixed(1),
          minRequired: (effectiveMinMargin * 100).toFixed(1),
          marketplace: best.mp,
          costPrice: product.price.toFixed(2),
          suggestedPrice: best.priceBase.toFixed(2)
        });
        if (best.margin < effectiveMinMargin) {
          skippedLowMargin++;
          logger.info('Producto descartado por margen bajo', {
            service: 'opportunity-finder',
            title: product.title.substring(0, 50),
            marginCalculated: (best.margin * 100).toFixed(1) + '%',
            minRequired: (effectiveMinMargin * 100).toFixed(1) + '%',
            costPrice: product.price.toFixed(2),
            suggestedPrice: best.priceBase.toFixed(2),
            marketplace: best.mp
          });
          continue;
        }
      } else {
        // Sin datos de competencia — usar canonical engine para calcular precio mínimo viable
        // con fees reales (marketplace fee + payment fee + duties) y target margin.
        // Garantiza que el precio sugerido no genere pérdida neta.
        const targetMarginPct = effectiveMinMargin * 100; // e.g. 18
        const fallbackMp = (marketplaces[0] || 'mercadolibre') as 'ebay' | 'amazon' | 'mercadolibre';
        const canonicalFallback = computeMinimumViablePrice({
          supplierPriceRaw: product.price,
          supplierCurrency: supplierCostCurrency,
          saleCurrency: baseCurrency,
          shippingToCustomerRaw: productShippingCost,
          marketplace: fallbackMp,
          region: (region || 'us').toUpperCase(),
          targetMarginPct,
        });

        const fallbackPriceBase = canonicalFallback.minSalePriceUsd;
        // Compute actual margin from canonical breakdown
        const netProfit = fallbackPriceBase - canonicalFallback.breakdown.totalCostUsd;
        const fallbackMargin = fallbackPriceBase > 0 ? netProfit / fallbackPriceBase : 0;

        logger.info('[OPPORTUNITY-FINDER] Fallback canónico (sin competitor data)', {
          service: 'opportunity-finder',
          title: product.title.substring(0, 50),
          targetMarginPct,
          marketplace: fallbackMp,
          region,
          supplierPrice: product.price.toFixed(2),
          minSalePrice: fallbackPriceBase.toFixed(2),
          canonicalMarginPct: (fallbackMargin * 100).toFixed(1),
          totalCostUsd: canonicalFallback.breakdown.totalCostUsd.toFixed(2),
          marketplaceFeeUsd: canonicalFallback.breakdown.marketplaceFeeUsd.toFixed(2),
          paymentFeeUsd: canonicalFallback.breakdown.paymentFeeUsd.toFixed(2),
          importDutiesUsd: canonicalFallback.breakdown.importDutiesUsd.toFixed(2),
          warnings: canonicalFallback.warnings,
        });

        if (fallbackMargin < effectiveMinMargin - 0.001 || fallbackPriceBase <= 0) {
          skippedLowMargin++;
          logger.info('Producto descartado por margen canónico insuficiente (sin competitor data)', {
            service: 'opportunity-finder',
            title: product.title.substring(0, 50),
            marginCanonical: (fallbackMargin * 100).toFixed(1) + '%',
            minRequired: (effectiveMinMargin * 100).toFixed(1) + '%',
            supplierPrice: product.price.toFixed(2),
            minSalePrice: fallbackPriceBase.toFixed(2),
          });
          continue;
        }

        best = {
          margin: fallbackMargin,
          price: fallbackPriceBase,
          priceBase: fallbackPriceBase,
          mp: fallbackMp,
          currency: baseCurrency,
        };
        bestBreakdown = {
          marketplaceFee: canonicalFallback.breakdown.marketplaceFeeUsd,
          paymentFee: canonicalFallback.breakdown.paymentFeeUsd,
          importDuties: canonicalFallback.breakdown.importDutiesUsd,
          supplierCost: canonicalFallback.breakdown.supplierCostUsd,
          shippingToCustomer: canonicalFallback.breakdown.shippingToCustomerUsd,
          totalCost: canonicalFallback.breakdown.totalCostUsd,
        };
        estimatedFields = ['suggestedPriceUsd', 'profitMargin', 'roiPercentage'];
        estimationNotes.push(
          'Valores estimados: no hubo listados comparables en catálogo (eBay Browse / Mercado Libre público / Amazon) para este título y región. Revisa región en Oportunidades, credenciales de Amazon (si aplica) y App ID/Cert ID de eBay en el servidor o en Ajustes.'
        );
        for (const d of competitionDiagnostics) {
          if (d.probeCode) {
            estimationNotes.push(
              `[${d.marketplace}] ${d.probeCode}${d.probeDetail ? `: ${d.probeDetail}` : ''}`
            );
          }
        }
        for (const mp of marketplaces) {
          const diag = credentialDiagnostics[mp];
          if (diag?.issues?.length) {
            estimationNotes.push(...diag.issues.map(issue => `[${mp}] ${issue}`));
          }
          if (diag?.warnings?.length) {
            estimationNotes.push(...diag.warnings.map(warning => `[${mp}] ${warning}`));
          }
        }
      }

      // ✅ NUEVO: Validar demanda real con Google Trends DESPUÉS de validar margen
      let trendsValidation: TrendData | null = null;
      const isStaticFallback = (product as any).source === 'static';
      const skipTrends = filters.skipTrendsValidation || isStaticFallback;

      try {
        // ✅ NUEVO: Obtener instancia de Google Trends con credenciales del usuario
        const googleTrends = getGoogleTrendsService(userId);
        logger.debug('[OPPORTUNITY-FINDER] Validando demanda real con Google Trends', {
          productTitle: product.title.substring(0, 60),
          category: (product as any).category || 'general',
          userId
        });
        
        trendsValidation = await googleTrends.validateProductViability(
          product.title,
          (product as any).category || 'general',
          undefined // Keywords se extraen automáticamente del título
        );
        
        logger.debug('[OPPORTUNITY-FINDER] Resultado validación Google Trends', {
          viable: trendsValidation.validation.viable,
          confidence: trendsValidation.validation.confidence,
          trend: trendsValidation.trend,
          searchVolume: trendsValidation.searchVolume,
          reason: trendsValidation.validation.reason
        });
        
        // ❌ DESCARTA si NO es viable o confianza muy baja (skip si skipTrends o producto static)
        if (!skipTrends && (!trendsValidation.validation.viable || trendsValidation.validation.confidence < this.minTrendConfidence)) {
          logger.info('[OPPORTUNITY-FINDER] Producto descartado - baja demanda o no viable según Google Trends', {
            title: product.title.substring(0, 50),
            viable: trendsValidation.validation.viable,
            confidence: trendsValidation.validation.confidence,
            minRequired: this.minTrendConfidence,
            reason: trendsValidation.validation.reason
          });
          skippedLowDemand++;
          continue; // ❌ DESCARTA PRODUCTO
        }
        
        // ❌ DESCARTA si tendencia está declinando significativamente (skip si skipTrendsValidation o static)
        if (!skipTrends && trendsValidation.trend === 'declining' && trendsValidation.validation.confidence < 50) {
          logger.info('[OPPORTUNITY-FINDER] Producto descartado - tendencia declinante', {
            title: product.title.substring(0, 50),
            trend: trendsValidation.trend,
            confidence: trendsValidation.validation.confidence,
            reason: trendsValidation.validation.reason
          });
          skippedDecliningTrend++;
          continue; // ❌ DESCARTA PRODUCTO
        }
        
        // ❌ DESCARTA si volumen de búsqueda es muy bajo (skip si skipTrendsValidation o static)
        if (!skipTrends && trendsValidation.searchVolume < this.minSearchVolume) {
          logger.info('[OPPORTUNITY-FINDER] Producto descartado - volumen de búsqueda muy bajo', {
            title: product.title.substring(0, 50),
            searchVolume: trendsValidation.searchVolume,
            minRequired: this.minSearchVolume
          });
          skippedLowVolume++;
          continue; // ❌ DESCARTA PRODUCTO
        }
        
      } catch (trendsError: any) {
        logger.warn('[OPPORTUNITY-FINDER] Error validando con Google Trends, continuando con advertencia', {
          error: trendsError?.message || String(trendsError),
          productTitle: product.title.substring(0, 50)
        });
        // ⚠️ Si falla Google Trends, continuar pero marcar como "baja confianza"
        // No descartar el producto completamente si Google Trends falla
        estimationNotes.push('No se pudo validar demanda con Google Trends. Se recomienda verificar manualmente la demanda del producto.');
      }

      // ✅ NUEVO: Calcular tiempo hasta primera venta y break-even
      // Nota: totalCost se calcula más adelante, usamos variables locales aquí
      const productShippingCostCalc = getEffectiveShippingCostForPublish(
        { shippingCost: product.shippingCost ?? null },
        undefined,
        { defaultUsd: oppCommerce.defaultShippingUsd }
      );
      const importTaxCalc = importTax; // Ya calculado arriba
      const totalCostSupplierCalc = product.price + productShippingCostCalc + importTaxCalc;
      const totalCostBaseCalc = opportunityFxConvert(
        totalCostSupplierCalc,
        supplierCostCurrency,
        baseCurrency,
        'opportunity-total-cost-to-base-for-break-even'
      );
      const competitorCount = valid ? (valid.listingsFound || 0) : 0;
      const estimatedTimeToFirstSale = this.estimateTimeToFirstSale(
        trendsValidation?.searchVolume || 0,
        trendsValidation?.trend || 'stable',
        competitorCount
      );
      
      // Calcular ganancia por unidad para break-even
      const profitPerUnit = best.priceBase - totalCostBaseCalc;
      const breakEvenTime = this.calculateBreakEvenTime(
        profitPerUnit,
        trendsValidation?.searchVolume || 0,
        trendsValidation?.trend || 'stable'
      );

      // ✅ NUEVO: Descartar si tiempo hasta primera venta es muy largo (skip si skipTrends o static)
      if (!skipTrends && estimatedTimeToFirstSale > this.maxTimeToFirstSale) {
        logger.info('[OPPORTUNITY-FINDER] Producto descartado - tiempo hasta primera venta muy largo', {
          title: product.title.substring(0, 50),
          estimatedTimeToFirstSale,
          maxAllowed: this.maxTimeToFirstSale
        });
        skippedSlowSale++;
        continue;
      }

      // ✅ NUEVO: Descartar si break-even time es muy largo (skip si skipTrends o static)
      if (!skipTrends && breakEvenTime > this.maxBreakEvenTime) {
        logger.info('[OPPORTUNITY-FINDER] Producto descartado - tiempo hasta break-even muy largo', {
          title: product.title.substring(0, 50),
          breakEvenTime,
          maxAllowed: this.maxBreakEvenTime
        });
        skippedLongBreakEven++;
        continue;
      }

      // ✅ Spec: market demand gate — sales_competition_ratio = estimated_sales / listing_count >= MIN_SALES_COMPETITION_RATIO (default 0 = off)
      if (this.minSalesCompetitionRatio > 0 && analyses.length > 0) {
        const estimatedMonthlySales = trendsValidation?.searchVolume != null && trendsValidation.searchVolume > 0
          ? trendsValidation.searchVolume
          : null;
        let maxRatio = 0;
        for (const a of analyses) {
          if (a.listingsFound <= 0) continue;
          const estimated = estimatedMonthlySales ?? a.listingsFound * 0.5;
          const ratio = estimated / a.listingsFound;
          if (ratio > maxRatio) maxRatio = ratio;
        }
        if (maxRatio < this.minSalesCompetitionRatio) {
          logger.info('[OPPORTUNITY-FINDER] Producto descartado - ratio demanda/competencia bajo', {
            title: product.title.substring(0, 50),
            maxRatio: Math.round(maxRatio * 100) / 100,
            minRequired: this.minSalesCompetitionRatio,
            estimatedMonthlySales: estimatedMonthlySales ?? 'heuristic',
          });
          skippedLowSalesRatio++;
          continue;
        }
      }

      if (manualAuthPending) {
        estimationNotes.push('Sesión de AliExpress pendiente de confirmación. Completa el login manual desde la barra superior para obtener datos completos.');
      }

      const selectedDiag = credentialDiagnostics[best.mp];
      // Do not attach credential warnings to rows that already use real comparable prices (avoids misleading "estimado" messaging).
      if ((!valid || (estimatedFields?.length ?? 0) > 0) && selectedDiag?.warnings?.length) {
        estimationNotes.push(...selectedDiag.warnings.map(warning => `[${best.mp}] ${warning}`));
      }

      const competitionSources = [...new Set(
        analyses
          .filter((a: any) => a && a.listingsFound > 0 && a.competitivePrice > 0 && a.dataSource)
          .map((a: any) => String(a.dataSource))
      )];
      const commercialTruth: CommercialTruthMeta = valid
        ? {
            sourceCost: 'exact',
            suggestedPrice: 'exact',
            profitMargin: 'exact',
            roi: 'exact',
            competitionLevel: 'exact',
            competitionSources: competitionSources.length ? competitionSources : undefined,
          }
        : {
            sourceCost: 'exact',
            suggestedPrice: 'estimated',
            profitMargin: 'estimated',
            roi: 'estimated',
            competitionLevel: 'unavailable',
            competitionSources: [],
          };

      // ✅ Validar que el producto tenga URL antes de crear la oportunidad
      if (!product.productUrl || product.productUrl.length < 10) {
        logger.warn('Producto sin URL válida, saltando oportunidad', {
          service: 'opportunity-finder',
          title: product.title?.substring(0, 50),
          hasUrl: !!product.productUrl,
          urlLength: product.productUrl?.length || 0,
          productUrl: product.productUrl?.substring(0, 80) || 'NO_URL'
        });
        continue; // Saltar productos sin URL válida
      }

      // ✅ TAREA 1: Validar y normalizar URL de imagen con fallback
      let imageUrl = product.imageUrl;
      if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
        // Intentar extraer imagen de la URL del producto si está disponible
        if (product.productUrl) {
          try {
            // Algunos productos de AliExpress tienen imágenes en su URL
            const urlMatch = product.productUrl.match(/(\d+\.html)/);
            if (urlMatch) {
              const productId = urlMatch[1]?.replace('.html', '');
              if (productId) {
                imageUrl = `https://ae01.alicdn.com/kf/${productId.substring(0, 2)}/${productId}.jpg`;
              }
            }
          } catch (e) {
            // Ignorar errores de parsing
          }
        }
        // Real data only: skip products without valid image
        if (!imageUrl || !imageUrl.startsWith('http')) {
          skippedInvalid++;
          continue;
        }
      } else {
        // Asegurar que la URL esté completa (agregar https:// si falta)
        if (!imageUrl.startsWith('http')) {
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          } else if (imageUrl.startsWith('/')) {
            imageUrl = 'https://www.aliexpress.com' + imageUrl;
          } else {
            imageUrl = 'https://' + imageUrl;
          }
        }
      }

      // ✅ MEJORADO: Extraer todas las imágenes disponibles del producto
      const allImages: string[] = [];
      if (Array.isArray(product.images) && product.images.length > 0) {
        // Si el producto tiene un array de imágenes, usar todas
        product.images.forEach((img: any) => {
          if (img && typeof img === 'string' && img.trim().length > 0) {
            let normalized = img.trim();
            if (!normalized.startsWith('http')) {
              if (normalized.startsWith('//')) {
                normalized = `https:${normalized}`;
              } else if (normalized.startsWith('/')) {
                normalized = `https://www.aliexpress.com${normalized}`;
              } else {
                normalized = `https://${normalized}`;
              }
            }
            if (/^https?:\/\//i.test(normalized)) {
              allImages.push(normalized);
            }
          }
        });
      }
      // Si no hay imágenes en el array pero sí imageUrl, agregarla
      if (allImages.length === 0 && imageUrl && imageUrl.startsWith('http')) {
        allImages.push(imageUrl);
      }

      // ✅ MEJORADO: Calcular costo total (proveedor) y en moneda base para comparar con precio sugerido
      const totalCost = product.price + productShippingCost + importTax;
      const costInBaseCurrency = opportunityFxConvert(
        product.price,
        supplierCostCurrency,
        baseCurrency,
        'opportunity-unit-cost-to-base'
      );
      const totalCostInBaseCurrency =
        totalCost > product.price
          ? opportunityFxConvert(
              totalCost,
              supplierCostCurrency,
              baseCurrency,
              'opportunity-total-cost-to-base'
            )
          : costInBaseCurrency;

      // Recalcular margen y ROI usando costo total en la misma moneda que best.priceBase
      let finalMargin = best.margin;
      let finalROI = Math.round(best.margin * 100);

      const totalCostForMargin =
        totalCost > product.price ? totalCostInBaseCurrency : costInBaseCurrency;
      let netProfitInBaseCurrency: number | undefined;
      if (totalCostForMargin > 0 && best.priceBase > 0) {
        const netProfit = best.priceBase - totalCostForMargin;
        netProfitInBaseCurrency = netProfit;
        finalMargin = best.priceBase > 0 ? Math.round((netProfit / best.priceBase) * 10000) / 10000 : 0;
        finalROI =
          totalCostForMargin > 0 ? Math.round((netProfit / totalCostForMargin) * 100) : 0;
      }

      // ✅ LOGGING: Verificar qué imágenes tenemos antes de construir el objeto
      logger.info('[OPPORTUNITY-FINDER] Construyendo OpportunityItem con imágenes', {
        userId,
        productTitle: product.title?.substring(0, 50),
        productImagesCount: Array.isArray(product.images) ? product.images.length : 0,
        allImagesCount: allImages.length,
        hasImageUrl: !!imageUrl,
        imagesToInclude: allImages.length > 0 ? allImages.length : 1,
        firstImagePreview: allImages.length > 0 ? allImages[0]?.substring(0, 60) : imageUrl?.substring(0, 60)
      });

      const opp: OpportunityItem = {
        productId: product.productId,
        title: product.title,
        sourceMarketplace: product.supplierSource === 'cj' ? 'cjdropshipping' : 'aliexpress',
        aliexpressUrl: product.productUrl || '', // Asegurar que siempre haya una URL
        productUrl: product.productUrl || '', // ✅ Alias para compatibilidad con deduplicación
        image: imageUrl, // ✅ TAREA 1: URL de imagen validada y normalizada (primera imagen)
        images: allImages.length > 0 ? allImages : [imageUrl], // ✅ MEJORADO: Todas las imágenes disponibles
        costUsd: product.price, // Costo base del producto
        price: product.price, // ✅ Alias para compatibilidad con deduplicación
        costAmount:
          typeof product.priceMaxSource === 'number' && product.priceMaxSource > 0
            ? product.priceMaxSource
            : typeof product.sourcePrice === 'number' && product.sourcePrice > 0
              ? product.sourcePrice
              : fxService.convert(product.price, baseCurrency, product.sourceCurrency || baseCurrency),
        costCurrency: product.priceRangeSourceCurrency || product.sourceCurrency || baseCurrency,
        baseCurrency,
        // ✅ MEJORADO: Costos adicionales
        shippingCost: productShippingCost,
        importTax: importTax > 0 ? importTax : undefined,
        totalCost: totalCost > product.price ? totalCost : undefined, // Solo incluir si hay costos adicionales (moneda proveedor)
        costInBaseCurrency:
          supplierCostCurrency !== baseCurrency.toUpperCase() ? costInBaseCurrency : undefined,
        totalCostInBaseCurrency:
          totalCost > product.price && supplierCostCurrency !== baseCurrency.toUpperCase()
            ? totalCostInBaseCurrency
            : supplierCostCurrency !== baseCurrency.toUpperCase()
              ? costInBaseCurrency
              : undefined,
        netProfitInBaseCurrency,
        targetCountry: targetCountry,
        suggestedPriceUsd: best.priceBase || (() => {
            try {
              return fxService.convert(best.price, best.currency || baseCurrency, baseCurrency);
            } catch (error: any) {
              logger.warn('[OpportunityFinder] FX conversion failed for suggested price', {
                from: best.currency || baseCurrency,
                to: baseCurrency,
                amount: best.price,
                error: error?.message
              });
              return best.price; // Fallback: usar sin convertir
            }
          })(),
        suggestedPriceAmount: best.price,
        suggestedPriceCurrency: best.currency || baseCurrency,
        profitMargin: finalMargin, // ✅ MEJORADO: Margen basado en costo total
        roiPercentage: finalROI, // ✅ MEJORADO: ROI basado en costo total
        competitionLevel: listingsToCompetitionLevel(valid?.listingsFound ?? 0),
        marketDemand: trendsValidation 
          ? (trendsValidation.trend === 'rising' ? 'high' : 
             trendsValidation.trend === 'stable' ? 'medium' : 'low')
          : 'unknown', // ✅ NUEVO: Usar demanda real de Google Trends
        confidenceScore: trendsValidation 
          ? Math.min(0.9, 0.5 + (trendsValidation.validation.confidence || 0) / 200)
          : (valid ? 0.5 : 0.3), // ✅ NUEVO: Ajustar confianza con Google Trends
        // ✅ NUEVO: Datos de demanda real validados con Google Trends
        trendData: trendsValidation ? {
          trend: trendsValidation.trend,
          searchVolume: trendsValidation.searchVolume,
          validation: trendsValidation.validation
        } : undefined,
        // ✅ NUEVO: Estimación de velocidad de venta
        estimatedTimeToFirstSale: estimatedTimeToFirstSale,
        breakEvenTime: breakEvenTime,
        targetMarketplaces: marketplaces,
        feesConsidered: bestBreakdown,
        generatedAt: new Date().toISOString(),
        estimatedFields,
        estimationNotes,
        commercialTruth,
        competitionDiagnostics,
        supplierOrdersCount: (product as any).supplierOrdersCount,
        supplierRating: (product as any).supplierRating,
        supplierReviewsCount: (product as any).supplierReviewsCount,
        shippingDaysMax: (product as any).shippingDaysMax,
        estimatedDeliveryDays: (product as any).estimatedDeliveryDays ?? (product as any).shippingDaysMax,
        supplierScorePct: (product as any).supplierScorePct,
        publishingDecision: computePublishingDecision({
          opp: {
            profitMargin: finalMargin,
            suggestedPriceUsd: best.priceBase || best.price,
            feesConsidered: bestBreakdown,
            images: allImages.length > 0 ? allImages : (imageUrl ? [imageUrl] : []),
            aliexpressUrl: product.productUrl || '',
            title: product.title,
          } as OpportunityItem,
          comparablesCount: valid?.listingsFound ?? 0,
          dataSource: valid?.dataSource,
          probeCodes: competitionDiagnostics.map((d) => d.probeCode || '').filter(Boolean),
          minMarginPct: effectiveMinMargin * 100,
        }),
        supplyDiagnostics: supplyPipelineDiagnostics
          ? {
              pipelinePreference: supplyPipelineDiagnostics.preference,
              cjSupplyMode: supplyPipelineDiagnostics.cjSupplyMode,
              sourcesTried: supplyPipelineDiagnostics.sourcesTried,
              degradedPartial: supplyPipelineDiagnostics.degradedPartial,
              notes: supplyPipelineDiagnostics.notes,
              deepQuote: supplyPipelineDiagnostics.deepQuote
                ? { ...supplyPipelineDiagnostics.deepQuote }
                : undefined,
              rowMeta: product.supplyMeta
                ? {
                    supplier: product.supplyMeta.supplier,
                    quoteConfidence: product.supplyMeta.quoteConfidence,
                    preferredSupplierSatisfied: product.supplyMeta.preferredSupplierSatisfied,
                    fallbackUsed: product.supplyMeta.fallbackUsed,
                    unitCostTruth: product.supplyMeta.unitCostTruth,
                    shippingTruth: product.supplyMeta.shippingTruth,
                    shippingEstimateStatus: product.supplyMeta.shippingEstimateStatus,
                    shippingSource: product.supplyMeta.shippingSource,
                    deepQuotePerformed: product.supplyMeta.deepQuotePerformed,
                    deepQuoteAt: product.supplyMeta.deepQuoteAt,
                    freightQuoteCachedAt: product.supplyMeta.freightQuoteCachedAt,
                    quoteFreshness: product.supplyMeta.quoteFreshness,
                    cjFreightMethod: product.supplyMeta.cjFreightMethod,
                    deepQuoteFailureReason: product.supplyMeta.deepQuoteFailureReason,
                    costSemantics: product.supplyMeta.costSemantics,
                  }
                : undefined,
            }
          : undefined,
        economicSupplyQuote: buildOpportunityEconomicSupplyQuote({
          price: product.price,
          currency: product.currency,
          shippingCost: product.shippingCost,
          shippingDaysMax: (product as { shippingDaysMax?: number }).shippingDaysMax,
          estimatedDeliveryDays: (product as { estimatedDeliveryDays?: number }).estimatedDeliveryDays,
          supplyMeta: product.supplyMeta,
        }),
      };

      logger.info('[PIPELINE] EVALUATED', {
        title: opp.title?.substring(0, 40),
        profitMargin: (opp.profitMargin * 100).toFixed(1),
        publishingDecision: opp.publishingDecision?.decision,
      });
      opportunities.push(opp);
      logger.debug('Oportunidad agregada', {
        service: 'opportunity-finder',
        title: opp.title.substring(0, 50),
        margin: (opp.profitMargin * 100).toFixed(1),
        suggestedPrice: `${formatPriceByCurrency(opp.suggestedPriceUsd, opp.suggestedPriceCurrency)} ${opp.suggestedPriceCurrency}`
      });

      try {
        logger.info('[PIPELINE][STORED]', { count: opportunities.length });
        await opportunityPersistence.saveOpportunity(userId, {
          title: opp.title,
          sourceMarketplace: opp.sourceMarketplace,
          costUsd: opp.costUsd,
          // ✅ MEJORADO: Incluir costos adicionales
          shippingCost: opp.shippingCost,
          importTax: opp.importTax,
          totalCost: opp.totalCost,
          targetCountry: opp.targetCountry,
          suggestedPriceUsd: opp.suggestedPriceUsd,
          profitMargin: opp.profitMargin,
          roiPercentage: opp.roiPercentage,
          competitionLevel: opp.competitionLevel,
          marketDemand: opp.marketDemand,
          confidenceScore: opp.confidenceScore,
          feesConsidered: opp.feesConsidered,
          targetMarketplaces: opp.targetMarketplaces,
        }, analysis as any);
      } catch (e) {
        // Ignorar errores al guardar oportunidad
      }
    }

    logger.info('Resumen de procesamiento', {
      service: 'opportunity-finder',
      userId,
      productsScraped: products.length,
      productsProcessed: processedCount,
      skippedInvalid,
      skippedLowMargin,
      skippedLowDemand, // NUEVO: Productos descartados por baja demanda
      skippedDecliningTrend, // NUEVO: Productos descartados por tendencia declinante
      skippedLowVolume, // NUEVO: Productos descartados por bajo volumen de búsqueda
      skippedSlowSale, // NUEVO: Productos descartados por tiempo largo hasta primera venta
      skippedLongBreakEven, // NUEVO: Productos descartados por tiempo largo hasta break-even
      skippedLowSalesRatio, // Spec: ratio demanda/competencia < MIN_SALES_COMPETITION_RATIO
      opportunitiesFound: opportunities.length,
      qualityFilters: {
        minMargin: `${(this.minMargin * 100).toFixed(1)}%`,
        minSearchVolume: this.minSearchVolume,
        minTrendConfidence: `${this.minTrendConfidence}%`,
        maxTimeToFirstSale: `${this.maxTimeToFirstSale} días`,
        maxBreakEvenTime: `${this.maxBreakEvenTime} días`
      }
    });

    const trendsDiscarded = skippedDecliningTrend + skippedLowVolume + skippedLowDemand;
    if (trendsDiscarded > 0) {
      logger.info('[OPPORTUNITY-FINDER] Productos descartados por validación de tendencias', {
        skippedDecliningTrend,
        skippedLowVolume,
        skippedLowDemand,
        totalTrendsDiscarded: trendsDiscarded,
      });
    }
    if (opportunities.length === 0 && products.length > 0) {
      logger.warn('PROBLEMA DETECTADO: Se scrapearon productos pero no se generaron oportunidades', {
        service: 'opportunity-finder',
        userId,
        productsScraped: products.length,
        possibleCauses: [
          `Margen mínimo muy alto (actual: ${(this.minMargin * 100).toFixed(1)}%)`,
          'Falta de datos de competencia (configura eBay/Amazon/MercadoLibre)',
          'Precios de AliExpress muy altos comparados con la competencia'
        ]
      });
    }

    logger.info('[PIPELINE][EVALUATED]', { count: opportunities.length });
    // ✅ NUEVO: Aplicar deduplicación antes de retornar
    const uniqueOpportunities = this.deduplicateOpportunities(opportunities);
    // ✅ Spec: apply supplier filters (orders, rating, reviews, shipping days, supplier score) when env set
    const afterSupplierFilters = this.applySupplierFilters(uniqueOpportunities);

    logger.info('Búsqueda de oportunidades completada', {
      service: 'opportunity-finder',
      userId,
      query,
      totalFound: opportunities.length,
      uniqueOpportunities: uniqueOpportunities.length,
      afterSupplierFilters: afterSupplierFilters.length,
      duplicatesRemoved: opportunities.length - uniqueOpportunities.length
    });

    // Attach diagnostics for the route layer (used for empty-state messaging)
    (afterSupplierFilters as any)._searchStats = {
      productsFound: products.length,
      skippedLowMargin,
      skippedInvalid,
      processedCount,
    };

    return afterSupplierFilters;
  }

  /**
   * ✅ FALLBACK NIVEL 3: Intentar usar ScraperAPI o ZenRows para scraping externo
   */
  private async tryExternalScrapingAPIs(
    userId: number,
    query: string,
    maxItems: number
  ): Promise<Array<{
    title: string;
    price: number;
    currency: string;
    sourcePrice: number;
    sourceCurrency: string;
    productUrl: string;
    imageUrl?: string;
    productId?: string;
    images?: string[];
    shippingCost?: number;
  }>> {
    try {
      const CredentialsManagerModule = await import('./credentials-manager.service');
      const CredentialsManager = CredentialsManagerModule.CredentialsManager;

      // Intentar ScraperAPI primero (CredentialsManager o env SCRAPER_API_KEY)
      try {
        let scraperApiKey =
          (await CredentialsManager.getCredentials(userId, 'scraperapi', 'production'))?.apiKey ||
          (process.env.SCRAPER_API_KEY || process.env.SCRAPERAPI_KEY || '').trim();
        if (scraperApiKey && scraperApiKey !== 'REPLACE_ME') {
          logger.info('Intentando ScraperAPI', { userId, query });
          const scraperApiResult = await this.scrapeWithScraperAPI(
            scraperApiKey,
            query,
            maxItems
          );
          if (scraperApiResult && scraperApiResult.length > 0) {
            return scraperApiResult;
          }
        }
      } catch (scraperApiError: any) {
        logger.warn('ScraperAPI falló o no está configurado', {
          error: scraperApiError?.message || String(scraperApiError)
        });
      }

      // Intentar ZenRows como alternativa (CredentialsManager o env ZENROWS_API_KEY)
      try {
        let zenRowsKey =
          (await CredentialsManager.getCredentials(userId, 'zenrows', 'production'))?.apiKey ||
          (process.env.ZENROWS_API_KEY || '').trim();
        if (zenRowsKey && zenRowsKey !== 'REPLACE_ME') {
          logger.info('Intentando ZenRows', { userId, query });
          const zenRowsResult = await this.scrapeWithZenRows(
            zenRowsKey,
            query,
            maxItems
          );
          if (zenRowsResult && zenRowsResult.length > 0) {
            return zenRowsResult;
          }
        }
      } catch (zenRowsError: any) {
        logger.warn('ZenRows falló o no está configurado', {
          error: zenRowsError?.message || String(zenRowsError)
        });
      }

      return [];
    } catch (error: any) {
      logger.error('Error en tryExternalScrapingAPIs', {
        error: error?.message || String(error)
      });
      return [];
    }
  }

  /**
   * Scraping usando ScraperAPI
   */
  private async scrapeWithScraperAPI(
    apiKey: string,
    query: string,
    maxItems: number
  ): Promise<Array<{
    title: string;
    price: number;
    currency: string;
    sourcePrice: number;
    sourceCurrency: string;
    productUrl: string;
    imageUrl?: string;
    productId?: string;
    images?: string[];
    shippingCost?: number;
  }>> {
    try {
      // ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout y logging
      const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
      const scraperApiUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(searchUrl)}&render=true`;

      // ✅ PRODUCTION READY: Retry logic para operaciones de scraping
      const response = await retryWithBackoff(
        async () => {
          const resp = await scrapingHttpClient.get(scraperApiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          // ✅ Validar respuesta
          if (!resp.data) {
            throw new Error('Empty response from ScraperAPI');
          }
          
          return resp;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          retryable: isRetryableError,
        }
      );

      // Parsear HTML usando cheerio (default export es load; fallback a named load)
      const mod = await import('cheerio');
      const load = typeof mod.load === 'function' ? mod.load : (mod as any).default;
      if (typeof load !== 'function') throw new Error('Cheerio load not found');
      const html = typeof response.data === 'string' ? response.data : String(response.data || '');
      if (!html || html.length < 100) throw new Error('ScraperAPI returned invalid or empty HTML');
      const $ = load(html);

      const products: Array<{
        title: string;
        price: number;
        currency: string;
        sourcePrice: number;
        sourceCurrency: string;
        productUrl: string;
        imageUrl?: string;
        productId?: string;
        images?: string[];
        shippingCost?: number;
      }> = [];

      const extractProducts = ($doc: any, sel: string): void => {
        $doc(sel).slice(0, maxItems * 2).each((_: number, el: any) => {
          if (products.length >= maxItems) return;
          try {
            const $el = $doc(el);
            const title = ($el.find('h1, .item-title, .product-title, [class*="title"]').first().text() || $el.find('a[href*="/item/"]').first().attr('title') || $el.find('a[href*="/item/"]').first().text()).trim();
            const priceText = $el.find('.price-current, .price, [data-price], [class*="price"]').first().text().trim();
            const url = $el.find('a[href*="/item/"]').first().attr('href') || '';
            const img = $el.find('img').first();
            const image = img.attr('src') || img.attr('data-src') || '';

            if (!title || !url) return;
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
            if (price <= 0) return;

            const fullUrl = url.startsWith('http') ? url : `https://www.aliexpress.com${url.startsWith('/') ? '' : '/'}${url}`;
            const imgs = image && image.startsWith('http') ? [image] : (image ? [`https:${image.replace(/^\/\//, '')}`] : []);
            if (imgs.length === 0) return;

            products.push({
              title: title.slice(0, 255),
              price,
              currency: 'USD',
              sourcePrice: price,
              sourceCurrency: 'USD',
              productUrl: fullUrl,
              imageUrl: imgs[0],
              images: imgs
            });
          } catch { /* skip */ }
        });
      };

      extractProducts($, '[data-product-id]');
      if (products.length === 0) extractProducts($, '.search-card-item');
      if (products.length === 0) extractProducts($, '[class*="search-card-item"]');

      return products.slice(0, maxItems);
    } catch (error: any) {
      logger.error('Error en scrapeWithScraperAPI', {
        error: error?.message || String(error)
      });
      return [];
    }
  }

  /**
   * Scraping usando ZenRows
   */
  private async scrapeWithZenRows(
    apiKey: string,
    query: string,
    maxItems: number
  ): Promise<Array<{
    title: string;
    price: number;
    currency: string;
    sourcePrice: number;
    sourceCurrency: string;
    productUrl: string;
    imageUrl?: string;
    productId?: string;
    images?: string[];
    shippingCost?: number;
  }>> {
    try {
      // ✅ PRODUCTION READY: Usar cliente HTTP centralizado con retry logic
      const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
      const zenRowsUrl = `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encodeURIComponent(searchUrl)}&js_render=true&premium_proxy=true`;

      // ✅ PRODUCTION READY: Retry logic para operaciones de scraping
      const response = await retryWithBackoff(
        async () => {
          const resp = await scrapingHttpClient.get(zenRowsUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          // ✅ Validar respuesta
          if (!resp.data) {
            throw new Error('Empty response from ZenRows');
          }
          
          return resp;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          retryable: isRetryableError,
        }
      );

      const mod = await import('cheerio');
      const load = typeof mod.load === 'function' ? mod.load : (mod as any).default;
      if (typeof load !== 'function') throw new Error('Cheerio load not found');
      const html = typeof response.data === 'string' ? response.data : String(response.data || '');
      if (!html || html.length < 100) throw new Error('ZenRows returned invalid or empty HTML');
      const $ = load(html);

      const products: Array<{
        title: string;
        price: number;
        currency: string;
        sourcePrice: number;
        sourceCurrency: string;
        productUrl: string;
        imageUrl?: string;
        productId?: string;
        images?: string[];
        shippingCost?: number;
      }> = [];

      const extractProductsZen = ($doc: any, sel: string): void => {
        $doc(sel).slice(0, maxItems * 2).each((_: number, el: any) => {
          if (products.length >= maxItems) return;
          try {
            const $el = $doc(el);
            const title = ($el.find('h1, .item-title, .product-title, [class*="title"]').first().text() || $el.find('a[href*="/item/"]').first().attr('title') || $el.find('a[href*="/item/"]').first().text()).trim();
            const priceText = $el.find('.price-current, .price, [data-price], [class*="price"]').first().text().trim();
            const url = $el.find('a[href*="/item/"]').first().attr('href') || '';
            const img = $el.find('img').first();
            const image = img.attr('src') || img.attr('data-src') || '';

            if (!title || !url) return;
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
            if (price <= 0) return;

            const fullUrl = url.startsWith('http') ? url : `https://www.aliexpress.com${url.startsWith('/') ? '' : '/'}${url}`;
            const imgs = image && image.startsWith('http') ? [image] : (image ? [`https:${image.replace(/^\/\//, '')}`] : []);
            if (imgs.length === 0) return;

            products.push({
              title: title.slice(0, 255),
              price,
              currency: 'USD',
              sourcePrice: price,
              sourceCurrency: 'USD',
              productUrl: fullUrl,
              imageUrl: imgs[0],
              images: imgs
            });
          } catch { /* skip */ }
        });
      };

      extractProductsZen($, '[data-product-id]');
      if (products.length === 0) extractProductsZen($, '.search-card-item');
      if (products.length === 0) extractProductsZen($, '[class*="search-card-item"]');

      return products.slice(0, maxItems);
    } catch (error: any) {
      logger.error('Error en scrapeWithZenRows', {
        error: error?.message || String(error)
      });
      return [];
    }
  }

  async findOpportunitiesWithDiagnostics(
    userId: number,
    filters: OpportunityFilters
  ): Promise<{ success: boolean; opportunities: OpportunityItem[]; diagnostics: PipelineDiagnostics }> {
    const diagnostics: PipelineDiagnostics = { sourcesTried: [], discovered: 0, normalized: 0 };
    const opportunities = await this.findOpportunities(userId, {
      ...filters,
      _collectDiagnostics: { current: diagnostics },
    });
    // Pipeline must FAIL when discovered === 0 (no real product returned). No discovery-only relaxation.
    const success = opportunities.length > 0 && diagnostics.discovered > 0;
    if (!success && diagnostics.discovered === 0) {
      diagnostics.reason = 'NO_REAL_PRODUCTS';
    }
    return { success, opportunities, diagnostics };
  }

  /**
   * Full opportunity search (Affiliate → fallback). Real data only; no mock/simulated.
   */
  async searchOpportunities(
    query: string,
    userId: number,
    options?: {
      maxItems?: number;
      pageNo?: number;
      skipTrendsValidation?: boolean;
      relaxedMargin?: boolean;
      marketplaces?: Array<'ebay' | 'amazon' | 'mercadolibre'>;
      region?: string;
      environment?: 'sandbox' | 'production';
    }
  ): Promise<OpportunityItem[]> {
    const opportunities = await this.findOpportunities(userId, {
      query,
      maxItems: options?.maxItems ?? 20,
      pageNo: options?.pageNo,
      skipTrendsValidation: options?.skipTrendsValidation,
      relaxedMargin: options?.relaxedMargin,
      marketplaces: options?.marketplaces,
      region: options?.region ?? 'us',
      environment: options?.environment,
    });
    const normalized = (opportunities ?? []).map((o: OpportunityItem) => {
      const base = { ...o };
      const imageVal = (o as any).image ?? (o as any).imageUrl ?? '';
      const urlVal = o.productUrl ?? o.aliexpressUrl ?? '';
      return {
        ...base,
        id: (o as any).id ?? o.productId ?? null,
        title: o.title ?? 'Untitled',
        image: imageVal,
        imageUrl: imageVal,
        aliexpressUrl: urlVal,
        productUrl: urlVal,
        baseCurrency: (o as any).baseCurrency ?? 'USD',
        costUsd: Number(o.costUsd ?? (o as any).cost ?? 0),
        suggestedPriceUsd: Number(o.suggestedPriceUsd ?? (o as any).price ?? 0),
        profitMargin: Number(o.profitMargin ?? 0),
        roiPercentage: Number(o.roiPercentage ?? (o as any).roi ?? 0),
        confidenceScore: Number(o.confidenceScore ?? 0),
        source: (o as any).source ?? 'unknown',
      };
    });
    console.log('[PRODUCTION] Opportunities normalized:', normalized.length);
    return normalized as unknown as OpportunityItem[];
  }
}

const opportunityFinder = new OpportunityFinderService();
export default opportunityFinder;




