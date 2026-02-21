/**
 * Trends Service - FASE 1: Detecciùn de Tendencias
 * 
 * Objetivo: Determinar QUù productos buscar en AliExpress
 * basùndose en tendencias reales de bùsqueda.
 * 
 * Fuentes de tendencias:
 * - Google Trends (via SerpAPI o fallback)
 * - Datos internos del sistema
 * - Anùlisis de estacionalidad
 */

import { trace } from '../utils/boot-trace';
trace('loading trends.service');

import { logger } from '../config/logger';
import { getGoogleTrendsService } from './google-trends.service';
import { trendSuggestionsService } from './trend-suggestions.service';
import { prisma } from '../config/database';

export interface TrendKeyword {
  keyword: string;
  score: number; // Score de tendencia (0-100)
  region: string; // Cùdigo de regiùn (US, ES, MX, etc.)
  date: string; // Fecha ISO de la tendencia
  trend: 'rising' | 'stable' | 'declining';
  searchVolume: number; // Volumen estimado de bùsqueda
  category?: string;
  segment?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TrendsConfig {
  region?: string; // Cùdigo de regiùn (default: 'US')
  days?: number; // Dùas hacia atrùs para analizar (default: 30)
  maxKeywords?: number; // Mùximo de keywords a retornar (default: 50)
  userId?: number; // Usuario para obtener credenciales personalizadas
}

export class TrendsService {
  /**
   * Obtener keywords priorizadas basadas en tendencias
   * 
   * @param config - Configuraciùn de bùsqueda de tendencias
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

      // 1. Obtener keywords de Google Trends (si estù disponible)
      const googleTrendsKeywords = await this.getGoogleTrendsKeywords(region, days, userId);
      keywords.push(...googleTrendsKeywords);

      // 2. Obtener keywords de tendencias internas del sistema
      if (userId) {
        const internalKeywords = await this.getInternalTrendKeywords(userId, days);
        keywords.push(...internalKeywords);
      }

      // 3. Agregar keywords de categorùas populares (fallback) ù only when no trends API key (SERP/GOOGLE_TRENDS)
      const hasTrendsApiKey = !!(process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY);
      if (!hasTrendsApiKey && keywords.length < 10) {
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
      // When SERP/GOOGLE_TRENDS key exists, do NOT fall back to static keywords (real API only)
      const hasTrendsApiKey = !!(process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY);
      if (hasTrendsApiKey) return [];
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

          // Ajustar score basado en volumen de bùsqueda
          if (trendData.searchVolume > 1000) score += 15;
          else if (trendData.searchVolume > 100) score += 5;

          // Ajustar score basado en validaciùn
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
        
        // Calcular score basado en mùtricas
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
          searchVolume: suggestion.estimatedOpportunities * 50, // Estimaciùn
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
   * Obtener keywords de fallback (categorùas populares)
   */
  private getFallbackKeywords(region: string): TrendKeyword[] {
    const fallbackKeywords = [
      { keyword: 'wireless earbuds', category: 'Electrùnica', segment: 'Audio', score: 75 },
      { keyword: 'gaming keyboard', category: 'Electrùnica', segment: 'Gaming', score: 70 },
      { keyword: 'smart watch', category: 'Electrùnica', segment: 'Wearables', score: 65 },
      { keyword: 'phone case', category: 'Accesorios', segment: 'Accesorios', score: 60 },
      { keyword: 'kitchen organizer', category: 'Hogar', segment: 'Organizaciùn', score: 55 },
      { keyword: 'wireless charger', category: 'Electrùnica', segment: 'Carga', score: 50 },
      { keyword: 'bluetooth speaker', category: 'Electrùnica', segment: 'Audio', score: 45 },
      { keyword: 'fitness tracker', category: 'Electrùnica', segment: 'Fitness', score: 40 },
    ];

    return fallbackKeywords.map(item => ({
      keyword: item.keyword,
      score: item.score,
      region,
      date: new Date().toISOString(),
      trend: 'stable' as const,
      searchVolume: item.score * 20, // Estimaciùn
      category: item.category,
      segment: item.segment,
      priority: item.score >= 60 ? 'high' : item.score >= 45 ? 'medium' : 'low',
    }));
  }

  /**
   * Priorizar keywords combinando mùltiples fuentes
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

        // Sumar volùmenes
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
