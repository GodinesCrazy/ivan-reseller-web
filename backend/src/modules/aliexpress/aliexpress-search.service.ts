/**
 * AliExpress Search Service - FASE 2: Búsqueda en AliExpress
 * 
 * Responsabilidad:
 * - Buscar productos basados en keywords de tendencias
 * - Aplicar filtros básicos
 * - Normalizar productos a formato candidato
 * - NO calcular rentabilidad (eso es FASE 3)
 */

import aliExpressService from './aliexpress.service';
import { trendsService, type TrendKeyword } from '../../services/trends.service';
import logger from '../../config/logger';
import env from '../../config/env';
import type { AliExpressProduct } from './aliexpress.types';

export interface ProductCandidate {
  productId: string;
  title: string;
  basePrice: number;
  currency: string;
  shippingCost: number | null;
  estimatedDeliveryDays: number | null;
  rating: number | null;
  ordersCount: number | null;
  affiliateLink: string;
  sourceKeyword: string;
  trendScore: number;
  priority: 'high' | 'medium' | 'low';
  productUrl: string;
  productImageUrl: string;
  shopName?: string;
  shopUrl?: string;
}

export interface SearchCandidatesConfig {
  userId?: number;
  limit?: number;
  priority?: 'high' | 'medium' | 'low';
  minTrendScore?: number;
  region?: string;
  days?: number;
}

export interface SearchCandidatesResult {
  candidates: ProductCandidate[];
  totalFound: number;
  totalFiltered: number;
  keywordsProcessed: number;
  processingTime: number;
}

/**
 * Filtros básicos configurables
 */
const FILTERS = {
  MIN_PRICE: parseFloat(process.env.ALIEXPRESS_MIN_PRICE || '0.01'),
  MIN_RATING: parseFloat(process.env.ALIEXPRESS_MIN_RATING || '4.2'),
  MIN_ORDERS: parseInt(process.env.ALIEXPRESS_MIN_ORDERS || '50', 10),
  REQUIRE_SHIPPING_INFO: process.env.ALIEXPRESS_REQUIRE_SHIPPING_INFO !== 'false',
};

export class AliExpressSearchService {
  /**
   * Buscar productos candidatos basados en keywords de tendencias
   */
  async searchCandidates(config: SearchCandidatesConfig = {}): Promise<SearchCandidatesResult> {
    const startTime = Date.now();
    
    console.log('[ALIEXPRESS-SEARCH] Start keyword search');
    console.log('[ALIEXPRESS-SEARCH] Config:', {
      hasUserId: !!config.userId,
      limit: config.limit,
      priority: config.priority,
      minTrendScore: config.minTrendScore,
    });

    logger.info('[AliExpress Search] Iniciando búsqueda de candidatos', {
      userId: config.userId,
      limit: config.limit,
      priority: config.priority,
      minTrendScore: config.minTrendScore,
    });

    try {
      // 1. Obtener keywords de tendencias (FASE 1)
      const trendKeywords = await trendsService.getTrendingKeywords({
        userId: config.userId,
        region: config.region || 'US',
        days: config.days || 30,
        maxKeywords: 20, // Limitar keywords para no sobrecargar
      });

      // Filtrar keywords por prioridad y score si se especifica
      let filteredKeywords = trendKeywords;
      if (config.priority) {
        filteredKeywords = filteredKeywords.filter(kw => kw.priority === config.priority);
      }
      if (config.minTrendScore !== undefined) {
        filteredKeywords = filteredKeywords.filter(kw => kw.score >= config.minTrendScore!);
      }

      console.log('[ALIEXPRESS-SEARCH] Keywords processed:', filteredKeywords.length);
      logger.info('[AliExpress Search] Keywords obtenidas', {
        total: trendKeywords.length,
        filtered: filteredKeywords.length,
      });

      // 2. Buscar productos para cada keyword
      const allCandidates: ProductCandidate[] = [];
      const productIdSet = new Set<string>(); // Para evitar duplicados

      for (const keyword of filteredKeywords.slice(0, 10)) { // Limitar a 10 keywords para no sobrecargar
        try {
          console.log('[ALIEXPRESS-SEARCH] Keyword processed:', keyword.keyword);
          
          const searchResult = await aliExpressService.searchProducts({
            keywords: keyword.keyword,
            pageNo: 1,
            pageSize: 20, // Obtener hasta 20 productos por keyword
          });

          console.log('[ALIEXPRESS-SEARCH] Products fetched:', searchResult.products.length);

          // 3. Normalizar y filtrar productos
          const candidates = this.normalizeAndFilterProducts(
            searchResult.products,
            keyword
          );

          console.log('[ALIEXPRESS-SEARCH] Products filtered:', candidates.length);

          // 4. Agregar candidatos únicos
          for (const candidate of candidates) {
            if (!productIdSet.has(candidate.productId)) {
              productIdSet.add(candidate.productId);
              allCandidates.push(candidate);
            }
          }

          // Peque?o delay para no sobrecargar la API
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error: any) {
          logger.warn('[AliExpress Search] Error procesando keyword', {
            keyword: keyword.keyword,
            error: error.message,
          });
          // Continuar con siguiente keyword
        }
      }

      // 5. Ordenar por trendScore descendente
      allCandidates.sort((a, b) => b.trendScore - a.trendScore);

      // 6. Limitar resultados
      const limitedCandidates = config.limit
        ? allCandidates.slice(0, config.limit)
        : allCandidates;

      const processingTime = Date.now() - startTime;

      console.log('[ALIEXPRESS-SEARCH] Candidates ready:', limitedCandidates.length);
      logger.info('[AliExpress Search] Búsqueda completada', {
        totalFound: allCandidates.length,
        totalFiltered: limitedCandidates.length,
        keywordsProcessed: filteredKeywords.length,
        processingTime,
      });

      return {
        candidates: limitedCandidates,
        totalFound: allCandidates.length,
        totalFiltered: limitedCandidates.length,
        keywordsProcessed: filteredKeywords.length,
        processingTime,
      };

    } catch (error: any) {
      logger.error('[AliExpress Search] Error en búsqueda de candidatos', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Normalizar y filtrar productos de AliExpress
   */
  private normalizeAndFilterProducts(
    products: AliExpressProduct[],
    keyword: TrendKeyword
  ): ProductCandidate[] {
    const candidates: ProductCandidate[] = [];

    for (const product of products) {
      try {
        // Normalizar producto
        const candidate = this.normalizeProduct(product, keyword);

        // Aplicar filtros básicos
        if (this.passesBasicFilters(candidate)) {
          candidates.push(candidate);
        }

      } catch (error: any) {
        logger.warn('[AliExpress Search] Error normalizando producto', {
          productId: product.productId,
          error: error.message,
        });
        // Continuar con siguiente producto
      }
    }

    return candidates;
  }

  /**
   * Normalizar producto de AliExpress a formato candidato
   */
  private normalizeProduct(
    product: AliExpressProduct,
    keyword: TrendKeyword
  ): ProductCandidate {
    // Parsear precios
    const basePrice = this.parsePrice(product.salePrice || product.originalPrice);
    const shippingCost = null; // AliExpress API no siempre proporciona shipping cost
    const estimatedDeliveryDays = null; // AliExpress API no siempre proporciona delivery days

    // Parsear rating (si está disponible en productData)
    const rating = null; // AliExpress Affiliate API no proporciona rating directamente
    const ordersCount = null; // AliExpress Affiliate API no proporciona orders directamente

    // Generar link afiliado (usar el servicio existente)
    // Nota: Esto requiere una llamada adicional a la API, pero es necesario
    // Por ahora, usamos el productUrl como fallback
    const affiliateLink = product.productUrl;

    return {
      productId: product.productId,
      title: product.productTitle || '',
      basePrice,
      currency: product.currency || 'USD',
      shippingCost,
      estimatedDeliveryDays,
      rating,
      ordersCount,
      affiliateLink,
      sourceKeyword: keyword.keyword,
      trendScore: keyword.score,
      priority: keyword.priority,
      productUrl: product.productUrl,
      productImageUrl: product.productImageUrl || '',
      shopName: product.shopName,
      shopUrl: product.shopUrl,
    };
  }

  /**
   * Aplicar filtros básicos
   */
  private passesBasicFilters(candidate: ProductCandidate): boolean {
    // Filtro: Precio > 0
    if (candidate.basePrice <= FILTERS.MIN_PRICE) {
      return false;
    }

    // Filtro: Título no vacío y no sospechoso
    if (!candidate.title || candidate.title.trim().length === 0) {
      return false;
    }

    // Detectar títulos sospechosos (spam, caracteres extra?os)
    const suspiciousPatterns = [
      /^[^a-zA-Z0-9]+$/, // Solo caracteres especiales
      /^(test|demo|sample)/i, // Palabras de prueba
      /.{200,}/, // Títulos extremadamente largos
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(candidate.title)) {
        return false;
      }
    }

    // Filtro: Rating (si está disponible)
    if (candidate.rating !== null && candidate.rating < FILTERS.MIN_RATING) {
      return false;
    }

    // Filtro: Orders (si está disponible)
    if (candidate.ordersCount !== null && candidate.ordersCount < FILTERS.MIN_ORDERS) {
      return false;
    }

    // Filtro: Información de envío (si es requerida)
    if (FILTERS.REQUIRE_SHIPPING_INFO) {
      // Por ahora, solo verificamos que el producto tenga URL válida
      if (!candidate.productUrl || candidate.productUrl.length === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Parsear precio de string a number
   */
  private parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    
    // Remover símbolos de moneda y espacios
    const cleaned = priceStr
      .replace(/[^\d.,-]/g, '')
      .replace(/,/g, '')
      .trim();
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}

export const aliExpressSearchService = new AliExpressSearchService();
