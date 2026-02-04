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
import { getGoogleTrendsService, type TrendData } from './google-trends.service'; // ✅ NUEVO: Google Trends para validar demanda real
// ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
import { scrapingHttpClient } from '../config/http-client';
// ✅ PRODUCTION READY: Retry logic para operaciones de scraping
import { retryWithBackoff, isRetryableError } from '../utils/retry';
import {
  DEFAULT_COMPARATOR_MARKETPLACES,
  OPTIONAL_MARKETPLACES,
} from '../config/marketplaces.config';

export interface OpportunityFilters {
  query: string;
  maxItems?: number;
  marketplaces?: Array<'ebay' | 'amazon' | 'mercadolibre'>;
  region?: string; // e.g., 'us', 'uk', 'mx'
  environment?: 'sandbox' | 'production'; // Environment para credenciales
  skipTrendsValidation?: boolean; // For smoke test: skip Google Trends filter
  /** Internal: collect pipeline diagnostics for test-full-cycle */
  _collectDiagnostics?: { current: PipelineDiagnostics };
}

export interface PipelineDiagnostics {
  sourcesTried: string[];
  discovered: number;
  normalized: number;
  reason?: 'NO_REAL_PRODUCTS';
  [key: string]: unknown;
}

export interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  productUrl?: string; // ✅ Alias para aliexpressUrl (para compatibilidad)
  image?: string;
  images?: string[]; // ✅ MEJORADO: Array de todas las imágenes disponibles
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  price?: number; // ✅ Alias para costUsd (para compatibilidad con deduplicación)
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number; // 0-1
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered: Record<string, number>;
  generatedAt: string;
  estimatedFields?: string[];
  estimationNotes?: string[];
  category?: string; // ✅ Categoría del producto (para deduplicación)
  shippingCost?: number; // ✅ Costo de envío adicional
  importTax?: number; // ✅ Impuestos de importación
  totalCost?: number; // ✅ Costo total (producto + envío + impuestos)
  targetCountry?: string; // ✅ País destino para cálculo de impuestos
  // ✅ NUEVO: Datos de demanda real validados con Google Trends
  trendData?: {
    trend: 'rising' | 'stable' | 'declining';
    searchVolume: number;
    validation: {
      viable: boolean;
      confidence: number;
      reason: string;
    };
  };
  estimatedTimeToFirstSale?: number; // ✅ NUEVO: Días estimados hasta primera venta
  breakEvenTime?: number; // ✅ NUEVO: Días hasta recuperar inversión (break-even)
}

class OpportunityFinderService {
  private minMargin = Number(process.env.MIN_OPPORTUNITY_MARGIN || '0.10'); // ✅ Reducido de 0.20 a 0.10 para permitir más oportunidades válidas
  private duplicateThreshold = Number(process.env.OPPORTUNITY_DUPLICATE_THRESHOLD || '0.85'); // Similarity threshold (85%)
  // ✅ NUEVO: Filtros de calidad para garantizar oportunidades reales
  private minSearchVolume = Number(process.env.MIN_SEARCH_VOLUME || '100'); // Volumen mínimo de búsqueda
  private minTrendConfidence = Number(process.env.MIN_TREND_CONFIDENCE || '30'); // Confianza mínima de tendencias (%)
  private maxTimeToFirstSale = Number(process.env.MAX_TIME_TO_FIRST_SALE || '60'); // Días máximos hasta primera venta
  private maxBreakEvenTime = Number(process.env.MAX_BREAK_EVEN_TIME || '90'); // Días máximos hasta break-even

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

  async findOpportunities(userId: number, filters: OpportunityFilters): Promise<OpportunityItem[]> {
    const query = filters.query?.trim();
    if (!query) return [];

    const maxItems = Math.min(Math.max(filters.maxItems || 10, 1), 10);
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

    // 1) Scrape AliExpress: PRIORIDAD 1 - API Oficial de AliExpress → PRIORIDAD 2 - Scraping nativo (Puppeteer) → fallback a bridge Python
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
      sourcePrice: number;
      sourceCurrency: string;
      productUrl: string;
      imageUrl?: string;
      productId?: string;
      images?: string[]; // ✅ MEJORADO: Array de imágenes
      shippingCost?: number; // ✅ MEJORADO: Costo de envío
    }> = [];
    let manualAuthPending = false;
    let manualAuthError: ManualAuthRequiredError | null = null;
    let nativeErrorForLogs: any = null;

    // ✅ PRIORIDAD 1: API Oficial de AliExpress (si está configurada) → PRIORIDAD 2: Scraping nativo (Puppeteer) como fallback
    const scraper = new AdvancedMarketplaceScraper();
    let scraperInitialized = false;

    // ✅ Obtener moneda base del usuario desde Settings
    const userSettingsService = (await import('./user-settings.service')).default;
    const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
    logger.info('[OPPORTUNITY-FINDER] Using user base currency', { userId, baseCurrency });

    // ✅ CASCADE ORDER: A) Bridge B) Native C) Affiliate API D) External (ScraperAPI/ZenRows)
    const sourcesTried: string[] = [];

    // A) Scraper Bridge
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
              logger.info('[OPPORTUNITY-FINDER] Native scraper (bridge) succeeded first', { count: products.length });
            }
          }
      } else {
        logger.info('[PIPELINE][DISCOVER][SOURCE=bridge]', { count: 0, reason: 'not available' });
      }
    } catch (bridgeErr: any) {
      logger.warn('[OPPORTUNITY-FINDER] Scraper bridge failed (soft fail)', { error: bridgeErr?.message, query });
      logger.info('[PIPELINE][DISCOVER][SOURCE=bridge]', { count: 0, error: bridgeErr?.message });
    }

    // B) Native Scraper (Puppeteer)
    if (products.length === 0) {
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
    } // end if products.length === 0

    // C) AliExpress Affiliate API
    if (!products || products.length === 0) {
      try {
        sourcesTried.push('affiliate');
        logger.info('[PIPELINE][DISCOVER][SOURCE=affiliate]', { query });
        const { CredentialsManager } = await import('./credentials-manager.service');
        const { aliexpressAffiliateAPIService } = await import('./aliexpress-affiliate-api.service');
        let affiliateCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', environment);
        if (!affiliateCreds && process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET) {
          affiliateCreds = {
            appKey: process.env.ALIEXPRESS_APP_KEY.trim(),
            appSecret: process.env.ALIEXPRESS_APP_SECRET.trim(),
            trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
            sandbox: false,
          } as any;
          logger.info('[OPPORTUNITY-FINDER] Using Affiliate API credentials from env (fallback)');
        }
        if (affiliateCreds) {
          aliexpressAffiliateAPIService.setCredentials(affiliateCreds);
          const countryCode = baseCurrency === 'CLP' ? 'CL' : baseCurrency === 'MXN' ? 'MX' : 'US';
          const apiProducts = await aliexpressAffiliateAPIService.searchProducts({
            keywords: query,
            pageNo: 1,
            pageSize: maxItems,
            targetCurrency: baseCurrency,
            shipToCountry: countryCode,
          });
          if (apiProducts && apiProducts.length > 0) {
            const mapped = apiProducts
              .map((p: any) => {
                const sourceCurrency = String(p.currency || 'USD').toUpperCase();
                const sourcePrice = Number(p.salePrice || p.originalPrice) || 0;
                let priceInBase = sourcePrice;
                try {
                  priceInBase = fxService.convert(sourcePrice, sourceCurrency, baseCurrency);
                } catch { priceInBase = sourcePrice; }
                const imgs = [p.productMainImageUrl, ...(p.productSmallImageUrls || [])].filter(
                  (x: any) => x && typeof x === 'string' && x.startsWith('http')
                );
                return {
                  title: p.productTitle,
                  price: priceInBase,
                  priceMin: priceInBase,
                  priceMax: priceInBase,
                  priceMinSource: sourcePrice,
                  priceMaxSource: sourcePrice,
                  priceRangeSourceCurrency: sourceCurrency,
                  currency: baseCurrency,
                  sourcePrice,
                  sourceCurrency,
                  productUrl: p.productDetailUrl || p.promotionLink || '',
                  imageUrl: imgs[0],
                  images: imgs,
                  productId: p.productId,
                };
              })
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

    // D) External APIs (ScraperAPI / ZenRows)
    if (!products || products.length === 0) {
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
    }
    logger.info('[PIPELINE][NORMALIZED]', { count: products.length });
    // 2) Analizar competencia real (placeholder hasta integrar servicios específicos)
    logger.info('[OPPORTUNITY-FINDER] Processing scraped products to find opportunities', { productCount: products.length });
    const opportunities: OpportunityItem[] = [];
    let skippedInvalid = 0;
    let skippedLowMargin = 0;
    let skippedLowDemand = 0; // ✅ NUEVO: Contador de productos descartados por baja demanda
    let skippedDecliningTrend = 0; // ✅ NUEVO: Contador de productos descartados por tendencia declinante
    let skippedLowVolume = 0; // ✅ NUEVO: Contador de productos descartados por bajo volumen de búsqueda
    let skippedSlowSale = 0; // ✅ NUEVO: Contador de productos descartados por tiempo largo hasta primera venta
    let skippedLongBreakEven = 0; // ✅ NUEVO: Contador de productos descartados por tiempo largo hasta break-even
    let processedCount = 0;

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

      let analysis: Record<string, any> = {};
      try {
        analysis = await competitorAnalyzer.analyzeCompetition(
          userId,
          product.title,
          marketplaces as ('ebay' | 'amazon' | 'mercadolibre')[],
          region
        );
      } catch (err: any) {
        logger.warn('Competition analysis failed, using heuristic fallback', {
          service: 'opportunity-finder',
          userId,
          error: err?.message || String(err)
        });
        analysis = {};
      }

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
      const productShippingCost = product.shippingCost || 0;
      
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
          const { breakdown, margin } = costCalculator.calculateAdvanced(
            a.marketplace as any,
            region,
            a.competitivePrice,
            product.price,
            a.currency || 'USD',
            baseCurrency,
            { 
              shippingCost: productShippingCost, // ✅ MEJORADO: Incluir shipping
              importTax: importTax, // ✅ MEJORADO: Incluir impuestos
              taxesPct: 0, 
              otherCosts: 0 
            }
          );
          if (margin > best.margin) {
            // ✅ Verificar si competitivePrice ya está en baseCurrency para evitar conversión doble
            const competitivePriceInBase = (a.currency || 'USD').toUpperCase() === baseCurrency.toUpperCase()
              ? a.competitivePrice // Ya está en moneda base
              : fxService.convert(a.competitivePrice, a.currency || 'USD', baseCurrency); // Convertir solo si es necesario

            best = {
              margin,
              price: a.competitivePrice,
              priceBase: competitivePriceInBase,
              mp: a.marketplace,
              currency: a.currency || 'USD',
            };
            bestBreakdown = breakdown as any;
          }
        }

        logger.debug('Margen calculado con datos reales', {
          service: 'opportunity-finder',
          margin: (best.margin * 100).toFixed(1),
          minRequired: (this.minMargin * 100).toFixed(1),
          marketplace: best.mp,
          costPrice: product.price.toFixed(2),
          suggestedPrice: best.priceBase.toFixed(2)
        });
        if (best.margin < this.minMargin) {
          skippedLowMargin++;
          logger.info('Producto descartado por margen bajo', {
            service: 'opportunity-finder',
            title: product.title.substring(0, 50),
            marginCalculated: (best.margin * 100).toFixed(1) + '%',
            minRequired: (this.minMargin * 100).toFixed(1) + '%',
            costPrice: product.price.toFixed(2),
            suggestedPrice: best.priceBase.toFixed(2),
            marketplace: best.mp
          });
          continue;
        }
      } else {
        // No pudimos obtener datos de competencia, crear una estimación heurística
        const fallbackPriceBase = product.price * 1.45;
        const fallbackMargin = (fallbackPriceBase - product.price) / product.price;
        logger.debug('Margen estimado (sin datos de competencia)', {
          service: 'opportunity-finder',
          margin: (fallbackMargin * 100).toFixed(1),
          minRequired: (this.minMargin * 100).toFixed(1),
          costPrice: product.price.toFixed(2),
          estimatedPrice: fallbackPriceBase.toFixed(2)
        });
        if (fallbackMargin < this.minMargin) {
          skippedLowMargin++;
          logger.info('Producto descartado por margen estimado bajo', {
            service: 'opportunity-finder',
            title: product.title.substring(0, 50),
            marginEstimated: (fallbackMargin * 100).toFixed(1) + '%',
            minRequired: (this.minMargin * 100).toFixed(1) + '%',
            costPrice: product.price.toFixed(2),
            estimatedPrice: fallbackPriceBase.toFixed(2),
            note: 'Sin datos de competencia - usando estimación heurística'
          });
          continue;
        }
        // ✅ No convertir baseCurrency → baseCurrency (conversión redundante)
        best = {
          margin: fallbackMargin,
          price: fallbackPriceBase, // Ya está en baseCurrency
          priceBase: fallbackPriceBase,
          mp: marketplaces[0],
          currency: baseCurrency,
        };
        bestBreakdown = {};
        estimatedFields = ['suggestedPriceUsd', 'profitMargin', 'roiPercentage'];
        estimationNotes.push('Valores estimados por falta de datos de competencia real. Configura tus credenciales de Amazon, eBay o MercadoLibre para obtener precios exactos.');
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
        
        // ❌ DESCARTA si NO es viable o confianza muy baja (skip si skipTrendsValidation)
        if (!filters.skipTrendsValidation && (!trendsValidation.validation.viable || trendsValidation.validation.confidence < this.minTrendConfidence)) {
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
        
        // ❌ DESCARTA si tendencia está declinando significativamente (skip si skipTrendsValidation)
        if (!filters.skipTrendsValidation && trendsValidation.trend === 'declining' && trendsValidation.validation.confidence < 50) {
          logger.info('[OPPORTUNITY-FINDER] Producto descartado - tendencia declinante', {
            title: product.title.substring(0, 50),
            trend: trendsValidation.trend,
            confidence: trendsValidation.validation.confidence,
            reason: trendsValidation.validation.reason
          });
          skippedDecliningTrend++;
          continue; // ❌ DESCARTA PRODUCTO
        }
        
        // ❌ DESCARTA si volumen de búsqueda es muy bajo
        if (trendsValidation.searchVolume < this.minSearchVolume) {
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
      const productShippingCostCalc = product.shippingCost || 0;
      const importTaxCalc = importTax; // Ya calculado arriba
      const totalCostCalc = product.price + productShippingCostCalc + importTaxCalc;
      const competitorCount = valid ? (valid.listingsFound || 0) : 0;
      const estimatedTimeToFirstSale = this.estimateTimeToFirstSale(
        trendsValidation?.searchVolume || 0,
        trendsValidation?.trend || 'stable',
        competitorCount
      );
      
      // Calcular ganancia por unidad para break-even
      const profitPerUnit = best.priceBase - totalCostCalc;
      const breakEvenTime = this.calculateBreakEvenTime(
        profitPerUnit,
        trendsValidation?.searchVolume || 0,
        trendsValidation?.trend || 'stable'
      );

      // ✅ NUEVO: Descartar si tiempo hasta primera venta es muy largo (skip si skipTrendsValidation)
      if (!filters.skipTrendsValidation && estimatedTimeToFirstSale > this.maxTimeToFirstSale) {
        logger.info('[OPPORTUNITY-FINDER] Producto descartado - tiempo hasta primera venta muy largo', {
          title: product.title.substring(0, 50),
          estimatedTimeToFirstSale,
          maxAllowed: this.maxTimeToFirstSale
        });
        skippedSlowSale++;
        continue;
      }

      // ✅ NUEVO: Descartar si break-even time es muy largo (skip si skipTrendsValidation)
      if (!filters.skipTrendsValidation && breakEvenTime > this.maxBreakEvenTime) {
        logger.info('[OPPORTUNITY-FINDER] Producto descartado - tiempo hasta break-even muy largo', {
          title: product.title.substring(0, 50),
          breakEvenTime,
          maxAllowed: this.maxBreakEvenTime
        });
        skippedLongBreakEven++;
        continue;
      }

      if (manualAuthPending) {
        estimationNotes.push('Sesión de AliExpress pendiente de confirmación. Completa el login manual desde la barra superior para obtener datos completos.');
      }

      const selectedDiag = credentialDiagnostics[best.mp];
      if (selectedDiag?.warnings?.length) {
        estimationNotes.push(...selectedDiag.warnings.map(warning => `[${best.mp}] ${warning}`));
      }

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

      // ✅ MEJORADO: Calcular costo total y recalcular margen/ROI con costos completos
      const totalCost = product.price + productShippingCost + importTax;
      
      // Recalcular margen y ROI usando costo total si está disponible
      let finalMargin = best.margin;
      let finalROI = Math.round(best.margin * 100);
      
      if (totalCost > 0 && best.priceBase > 0) {
        // Recalcular margen basado en costo total
        const netProfit = best.priceBase - totalCost;
        finalMargin = best.priceBase > 0 ? Math.round((netProfit / best.priceBase) * 10000) / 10000 : 0;
        finalROI = totalCost > 0 ? Math.round((netProfit / totalCost) * 100) : 0;
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
        sourceMarketplace: 'aliexpress',
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
        shippingCost: productShippingCost > 0 ? productShippingCost : undefined,
        importTax: importTax > 0 ? importTax : undefined,
        totalCost: totalCost > product.price ? totalCost : undefined, // Solo incluir si hay costos adicionales
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
        competitionLevel: 'unknown',
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
      };

      logger.info('[PIPELINE] EVALUATED', { title: opp.title?.substring(0, 40), profitMargin: (opp.profitMargin * 100).toFixed(1) });
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
      opportunitiesFound: opportunities.length,
      qualityFilters: {
        minMargin: `${(this.minMargin * 100).toFixed(1)}%`,
        minSearchVolume: this.minSearchVolume,
        minTrendConfidence: `${this.minTrendConfidence}%`,
        maxTimeToFirstSale: `${this.maxTimeToFirstSale} días`,
        maxBreakEvenTime: `${this.maxBreakEvenTime} días`
      }
    });

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

    logger.info('Búsqueda de oportunidades completada', {
      service: 'opportunity-finder',
      userId,
      query,
      totalFound: opportunities.length,
      uniqueOpportunities: uniqueOpportunities.length,
      duplicatesRemoved: opportunities.length - uniqueOpportunities.length
    });

    return uniqueOpportunities;
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

      // Intentar ScraperAPI primero
      try {
        const scraperApiCreds = await CredentialsManager.getCredentials(userId, 'scraperapi');
        if (scraperApiCreds && scraperApiCreds.apiKey) {
          logger.info('Intentando ScraperAPI', { userId, query });
          const scraperApiResult = await this.scrapeWithScraperAPI(
            scraperApiCreds.apiKey,
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

      // Intentar ZenRows como alternativa
      try {
        const zenRowsCreds = await CredentialsManager.getCredentials(userId, 'zenrows');
        if (zenRowsCreds && zenRowsCreds.apiKey) {
          logger.info('Intentando ZenRows', { userId, query });
          const zenRowsResult = await this.scrapeWithZenRows(
            zenRowsCreds.apiKey,
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

      // Parsear HTML usando cheerio
      const cheerio = (await import('cheerio')).default;
      const $ = cheerio.load(response.data);

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

      // Extraer productos de la página (selectores comunes de AliExpress)
      $('[data-product-id]').slice(0, maxItems).each((_, element) => {
        try {
          const $el = $(element);
          const title = $el.find('h1, .item-title, a[href*="/item/"]').first().text().trim();
          const priceText = $el.find('.price-current, .price, [data-price]').first().text().trim();
          const url = $el.find('a[href*="/item/"]').first().attr('href') || '';
          const image = $el.find('img').first().attr('src') || '';

          if (title && priceText && url) {
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

            if (price > 0) {
              products.push({
                title,
                price,
                currency: 'USD',
                sourcePrice: price,
                sourceCurrency: 'USD',
                productUrl: url.startsWith('http') ? url : `https://www.aliexpress.com${url}`,
                imageUrl: image,
                images: image ? [image] : []
              });
            }
          }
        } catch (parseError) {
          // Continuar con siguiente producto
        }
      });

      return products;
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

      // Parsear HTML usando cheerio
      const cheerio = (await import('cheerio')).default;
      const $ = cheerio.load(response.data);

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

      // Extraer productos de la página (selectores comunes de AliExpress)
      $('[data-product-id]').slice(0, maxItems).each((_, element) => {
        try {
          const $el = $(element);
          const title = $el.find('h1, .item-title, a[href*="/item/"]').first().text().trim();
          const priceText = $el.find('.price-current, .price, [data-price]').first().text().trim();
          const url = $el.find('a[href*="/item/"]').first().attr('href') || '';
          const image = $el.find('img').first().attr('src') || '';

          if (title && priceText && url) {
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

            if (price > 0) {
              products.push({
                title,
                price,
                currency: 'USD',
                sourcePrice: price,
                sourceCurrency: 'USD',
                productUrl: url.startsWith('http') ? url : `https://www.aliexpress.com${url}`,
                imageUrl: image,
                images: image ? [image] : []
              });
            }
          }
        } catch (parseError) {
          // Continuar con siguiente producto
        }
      });

      return products;
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
    const success = opportunities.length > 0;
    if (!success && diagnostics.discovered === 0) {
      diagnostics.reason = 'NO_REAL_PRODUCTS';
    }
    return { success, opportunities, diagnostics };
  }
}

const opportunityFinder = new OpportunityFinderService();
export default opportunityFinder;




