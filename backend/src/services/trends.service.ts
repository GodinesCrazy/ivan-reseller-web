/**
 * Trends Service - FASE 1: Detección de Tendencias
 * 
 * Objetivo: Determinar QUÉ productos buscar en AliExpress
 * basándose en tendencias reales de búsqueda.
 * 
 * Fuentes de tendencias:
 * - Google Trends (via SerpAPI o fallback)
 * - Datos internos del sistema
 * - Análisis de estacionalidad
 */

import { logger } from '../config/logger';
import { getGoogleTrendsService } from './google-trends.service';
import { trendSuggestionsService } from './trend-suggestions.service';
import { prisma } from '../config/database';

export interface TrendKeyword {
  keyword: string;
  score: number; // Score de tendencia (0-100)
  region: string; // Código de región (US, ES, MX, etc.)
  date: string; // Fecha ISO de la tendencia
  trend: 'rising' | 'stable' | 'declining';
  searchVolume: number; // Volumen estimado de búsqueda
  category?: string;
  segment?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TrendsConfig {
  region?: string; // Código de región (default: 'US')
  days?: number; // Días hacia atrás para analizar (default: 30)
  maxKeywords?: number; // Máximo de keywords a retornar (default: 50)
  userId?: number; // Usuario para obtener credenciales personalizadas
}

export class TrendsService {
  /**
   * Obtener keywords priorizadas basadas en tendencias
   * 
   * @param config - Configuración de búsqueda de tendencias
   * @returns Lista de keywords priorizadas con score de tendencia
   */
  async getTrendingKeywords(config: TrendsConfig = {}): Promise<TrendKeyword[]> {
    const {
      region = 'US',
      days = 30,
      maxKeywords = 50,
      userId,
    } = config;

    console.log('[TRENDS-SERVICE] Obteniendo keywords de tendencias', {
      region,
      days,
      maxKeywords,
      hasUserId: !!userId,
    });

    try {
      const keywords: TrendKeyword[] = [];

      // 1. Obtener keywords de Google Trends (si está disponible)
      const googleTrendsKeywords = await this.getGoogleTrendsKeywords(region, days, userId);
      keywords.push(...googleTrendsKeywords);

      // 2. Obtener keywords de tendencias internas del sistema
      if (userId) {
        const internalKeywords = await this.getInternalTrendKeywords(userId, days);
        keywords.push(...internalKeywords);
      }

      // 3. Agregar keywords de categorías populares (fallback)
      if (keywords.length < 10) {
        const fallbackKeywords = this.getFallbackKeywords(region);
        keywords.push(...fallbackKeywords);
      }

      // 4. Priorizar y ordenar keywords
      const prioritized = this.prioritizeKeywords(keywords);

      // 5. Limitar resultados
      return prioritized.slice(0, maxKeywords);

    } catch (error: any) {
      logger.error('[TrendsService] Error obteniendo keywords de tendencias', {
        error: error.message,
        stack: error.stack,
        config,
      });

      // Retornar keywords de fallback en caso de error
      return this.getFallbackKeywords(region).slice(0, maxKeywords);
    }
  }

  /**
   * Obtener keywords de Google Trends
   */
  private async getGoogleTrendsKeywords(
    region: string,
    days: number,
    userId?: number
  ): Promise<TrendKeyword[]> {
    try {
      const googleTrendsService = userId 
        ? getGoogleTrendsService(userId)
        : getGoogleTrendsService();

      // Keywords base para buscar tendencias
      const baseKeywords = [
        'wireless earbuds',
        'gaming keyboard',
        'smart watch',
        'phone case',
        'kitchen organizer',
        'wireless charger',
        'bluetooth speaker',
        'fitness tracker',
        'phone stand',
        'cable organizer',
      ];

      const keywords: TrendKeyword[] = [];

      // Buscar tendencias para cada keyword base
      for (const baseKeyword of baseKeywords.slice(0, 5)) { // Limitar a 5 para no sobrecargar
        try {
          const trendData = await googleTrendsService.validateProductViability(
            baseKeyword,
            undefined,
            [baseKeyword]
          );

          // Calcular score de tendencia
          let score = 0;
          if (trendData.trend === 'rising') score = 80;
          else if (trendData.trend === 'stable') score = 50;
          else score = 20;

          // Ajustar score basado en volumen de búsqueda
          if (trendData.searchVolume > 1000) score += 15;
          else if (trendData.searchVolume > 100) score += 5;

          // Ajustar score basado en validación
          if (trendData.validation.viable) score += 10;
          score += trendData.validation.confidence * 0.1;

          score = Math.min(100, Math.max(0, score));

          // Determinar prioridad
          let priority: 'high' | 'medium' | 'low' = 'medium';
          if (score >= 70) priority = 'high';
          else if (score < 40) priority = 'low';

          keywords.push({
            keyword: baseKeyword,
            score: Math.round(score),
            region,
            date: new Date().toISOString(),
            trend: trendData.trend,
            searchVolume: trendData.searchVolume,
            priority,
          });

          // Peque?o delay para no sobrecargar la API
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error: any) {
          logger.warn('[TrendsService] Error obteniendo tendencia para keyword', {
            keyword: baseKeyword,
            error: error.message,
          });
          // Continuar con siguiente keyword
        }
      }

      logger.info('[TrendsService] Keywords de Google Trends obtenidas', {
        count: keywords.length,
        region,
      });

      return keywords;

    } catch (error: any) {
      logger.warn('[TrendsService] Error obteniendo keywords de Google Trends, usando fallback', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Obtener keywords de tendencias internas del sistema
   */
  private async getInternalTrendKeywords(
    userId: number,
    days: number
  ): Promise<TrendKeyword[]> {
    try {
      // Usar el servicio de sugerencias de tendencias existente
      const suggestions = await trendSuggestionsService.generateKeywordSuggestions(
        userId,
        20
      );

      const keywords: TrendKeyword[] = suggestions.map(suggestion => {
        // Convertir sugerencia a TrendKeyword
        let score = 0;
        
        // Calcular score basado en métricas
        if (suggestion.supportingMetric.type === 'trend') {
          score = Math.min(100, 60 + suggestion.supportingMetric.value * 0.4);
        } else if (suggestion.supportingMetric.type === 'margin') {
          score = Math.min(100, 50 + suggestion.supportingMetric.value * 0.5);
        } else if (suggestion.supportingMetric.type === 'roi') {
          score = Math.min(100, 40 + suggestion.supportingMetric.value * 0.3);
        } else {
          score = 30 + Math.min(30, suggestion.estimatedOpportunities * 2);
        }

        // Ajustar por confianza
        score = score * (suggestion.confidence / 100);

        // Determinar tendencia basada en prioridad
        let trend: 'rising' | 'stable' | 'declining' = 'stable';
        if (suggestion.priority === 'high') trend = 'rising';
        else if (suggestion.priority === 'low') trend = 'declining';

        return {
          keyword: suggestion.keyword,
          score: Math.round(score),
          region: 'US', // Default, puede mejorarse
          date: new Date().toISOString(),
          trend,
          searchVolume: suggestion.estimatedOpportunities * 50, // Estimación
          category: suggestion.category,
          segment: suggestion.segment,
          priority: suggestion.priority,
        };
      });

      logger.info('[TrendsService] Keywords internas obtenidas', {
        count: keywords.length,
        userId,
      });

      return keywords;

    } catch (error: any) {
      logger.warn('[TrendsService] Error obteniendo keywords internas', {
        error: error.message,
        userId,
      });
      return [];
    }
  }

  /**
   * Obtener keywords de fallback (categorías populares)
   */
  private getFallbackKeywords(region: string): TrendKeyword[] {
    const fallbackKeywords = [
      { keyword: 'wireless earbuds', category: 'Electrónica', segment: 'Audio', score: 75 },
      { keyword: 'gaming keyboard', category: 'Electrónica', segment: 'Gaming', score: 70 },
      { keyword: 'smart watch', category: 'Electrónica', segment: 'Wearables', score: 65 },
      { keyword: 'phone case', category: 'Accesorios', segment: 'Accesorios', score: 60 },
      { keyword: 'kitchen organizer', category: 'Hogar', segment: 'Organización', score: 55 },
      { keyword: 'wireless charger', category: 'Electrónica', segment: 'Carga', score: 50 },
      { keyword: 'bluetooth speaker', category: 'Electrónica', segment: 'Audio', score: 45 },
      { keyword: 'fitness tracker', category: 'Electrónica', segment: 'Fitness', score: 40 },
    ];

    return fallbackKeywords.map(item => ({
      keyword: item.keyword,
      score: item.score,
      region,
      date: new Date().toISOString(),
      trend: 'stable' as const,
      searchVolume: item.score * 20, // Estimación
      category: item.category,
      segment: item.segment,
      priority: item.score >= 60 ? 'high' : item.score >= 45 ? 'medium' : 'low',
    }));
  }

  /**
   * Priorizar keywords combinando múltiples fuentes
   */
  private prioritizeKeywords(keywords: TrendKeyword[]): TrendKeyword[] {
    // Agrupar por keyword (puede haber duplicados de diferentes fuentes)
    const keywordMap = new Map<string, TrendKeyword[]>();

    keywords.forEach(kw => {
      const key = kw.keyword.toLowerCase();
      if (!keywordMap.has(key)) {
        keywordMap.set(key, []);
      }
      keywordMap.get(key)!.push(kw);
    });

    // Consolidar keywords duplicadas (promediar scores, tomar mejor tendencia)
    const consolidated: TrendKeyword[] = [];

    keywordMap.forEach((instances, key) => {
      if (instances.length === 1) {
        consolidated.push(instances[0]);
      } else {
        // Promediar scores
        const avgScore = instances.reduce((sum, kw) => sum + kw.score, 0) / instances.length;
        
        // Tomar mejor tendencia (rising > stable > declining)
        const trends = instances.map(kw => kw.trend);
        let bestTrend: 'rising' | 'stable' | 'declining' = 'stable';
        if (trends.includes('rising')) bestTrend = 'rising';
        else if (trends.includes('stable')) bestTrend = 'stable';
        else bestTrend = 'declining';

        // Sumar volúmenes
        const totalVolume = instances.reduce((sum, kw) => sum + kw.searchVolume, 0);

        // Tomar mejor prioridad
        const priorities = instances.map(kw => kw.priority);
        let bestPriority: 'high' | 'medium' | 'low' = 'medium';
        if (priorities.includes('high')) bestPriority = 'high';
        else if (priorities.includes('medium')) bestPriority = 'medium';
        else bestPriority = 'low';

        consolidated.push({
          keyword: instances[0].keyword,
          score: Math.round(avgScore),
          region: instances[0].region,
          date: instances[0].date,
          trend: bestTrend,
          searchVolume: totalVolume,
          category: instances[0].category,
          segment: instances[0].segment,
          priority: bestPriority,
        });
      }
    });

    // Ordenar por score descendente
    consolidated.sort((a, b) => b.score - a.score);

    return consolidated;
  }
}

export const trendsService = new TrendsService();
