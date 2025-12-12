import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Google Trends Service
 * Valida viabilidad de productos usando Google Trends API
 * 
 * Nota: Google Trends no tiene API oficial pública gratuita.
 * Este servicio usa alternativas:
 * 1. SerpApi (si está configurado) - Servicio de pago
 * 2. Alternative APIs como pytrends via bridge
 * 3. Fallback a estimaciones basadas en datos internos
 */

export interface GoogleTrendsConfig {
  apiKey?: string; // SerpAPI key o similar
  useSerpAPI?: boolean;
}

export interface TrendData {
  keyword: string;
  searchVolume: number;
  trend: 'rising' | 'stable' | 'declining';
  interestOverTime: Array<{
    date: string;
    value: number;
  }>;
  relatedQueries: Array<{
    query: string;
    value: number;
  }>;
  regionalInterest: Array<{
    region: string;
    value: number;
  }>;
  validation: {
    viable: boolean;
    confidence: number;
    reason: string;
  };
}

export class GoogleTrendsService {
  private apiKey?: string;
  private useSerpAPI: boolean;
  private serpApiClient?: AxiosInstance;
  private userId?: number; // ✅ NUEVO: Guardar userId para obtener credenciales del usuario

  constructor(config?: GoogleTrendsConfig) {
    this.apiKey = config?.apiKey || process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY;
    this.useSerpAPI = config?.useSerpAPI ?? !!this.apiKey;

    if (this.useSerpAPI && this.apiKey) {
      this.serpApiClient = axios.create({
        baseURL: 'https://serpapi.com',
        timeout: 10000,
        params: {
          api_key: this.apiKey,
          engine: 'google_trends'
        }
      });
    }
  }

  /**
   * ✅ NUEVO: Configurar API key desde credenciales del usuario
   * Actualiza el cliente de SerpAPI con la nueva API key
   */
  async setUserCredentials(userId: number): Promise<void> {
    this.userId = userId;
    try {
      // Intentar obtener credenciales del usuario desde CredentialsManager
      const { CredentialsManager } = await import('./credentials-manager.service');
      
      // Intentar 'serpapi' primero, luego 'googletrends' como alias
      let credentials = await CredentialsManager.getCredentials(userId, 'serpapi', 'production');
      if (!credentials || !credentials.apiKey) {
        credentials = await CredentialsManager.getCredentials(userId, 'googletrends', 'production');
      }
      
      if (credentials && credentials.apiKey) {
        this.apiKey = String(credentials.apiKey).trim();
        this.useSerpAPI = true;
        
        // Recrear cliente con nueva API key
        this.serpApiClient = axios.create({
          baseURL: 'https://serpapi.com',
          timeout: 10000,
          params: {
            api_key: this.apiKey,
            engine: 'google_trends'
          }
        });
        
        logger.info('[GoogleTrendsService] Credenciales del usuario configuradas', {
          userId,
          hasApiKey: !!this.apiKey,
          apiKeyPrefix: this.apiKey.substring(0, 6) + '...'
        });
      } else {
        // Si no hay credenciales del usuario, usar variables de entorno como fallback
        const envApiKey = process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY;
        if (envApiKey) {
          this.apiKey = envApiKey;
          this.useSerpAPI = true;
          this.serpApiClient = axios.create({
            baseURL: 'https://serpapi.com',
            timeout: 10000,
            params: {
              api_key: this.apiKey,
              engine: 'google_trends'
            }
          });
          logger.info('[GoogleTrendsService] Usando API key de variables de entorno (usuario no configurado)', {
            userId,
            hasEnvApiKey: true
          });
        } else {
          this.apiKey = undefined;
          this.useSerpAPI = false;
          this.serpApiClient = undefined;
          logger.warn('[GoogleTrendsService] No hay API key configurada (ni usuario ni variables de entorno)', {
            userId
          });
        }
      }
    } catch (error: any) {
      logger.warn('[GoogleTrendsService] Error obteniendo credenciales del usuario, usando fallback', {
        userId,
        error: error?.message || String(error)
      });
      
      // Fallback a variables de entorno
      const envApiKey = process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY;
      if (envApiKey) {
        this.apiKey = envApiKey;
        this.useSerpAPI = true;
        this.serpApiClient = axios.create({
          baseURL: 'https://serpapi.com',
          timeout: 10000,
          params: {
            api_key: this.apiKey,
            engine: 'google_trends'
          }
        });
      }
    }
  }

  /**
   * Validar viabilidad de producto usando Google Trends
   */
  async validateProductViability(
    productTitle: string,
    category?: string,
    keywords?: string[]
  ): Promise<TrendData> {
    try {
      // Extraer palabras clave del título del producto
      const searchKeywords = keywords || this.extractKeywords(productTitle, category);
      const primaryKeyword = searchKeywords[0] || productTitle;

      logger.info('Validando viabilidad de producto con Google Trends', {
        productTitle,
        primaryKeyword,
        category
      });

      let trendData: TrendData | null = null;

      // Intentar con SerpAPI si está configurado
      if (this.useSerpAPI && this.serpApiClient) {
        try {
          trendData = await this.getTrendsFromSerpAPI(primaryKeyword, searchKeywords);
        } catch (error: any) {
          logger.warn('SerpAPI falló, usando fallback', { error: error.message });
        }
      }

      // Fallback: usar datos internos y estimaciones
      if (!trendData) {
        trendData = await this.getTrendsFallback(primaryKeyword, category);
      }

      // Validar viabilidad basado en los datos de tendencias
      trendData.validation = this.validateViability(trendData);

      logger.info('Validación de tendencias completada', {
        productTitle,
        viable: trendData.validation.viable,
        confidence: trendData.validation.confidence,
        trend: trendData.trend
      });

      return trendData;

    } catch (error: any) {
      logger.error('Error validando viabilidad con Google Trends', {
        error: error.message,
        productTitle
      });

      // En caso de error, retornar datos neutros pero marcar como viable
      // para no bloquear productos válidos
      return {
        keyword: productTitle,
        searchVolume: 0,
        trend: 'stable',
        interestOverTime: [],
        relatedQueries: [],
        regionalInterest: [],
        validation: {
          viable: true, // Por defecto permitir si no hay datos
          confidence: 0,
          reason: 'No se pudieron obtener datos de Google Trends. Producto aprobado por defecto.'
        }
      };
    }
  }

  /**
   * Obtener tendencias usando SerpAPI
   */
  private async getTrendsFromSerpAPI(
    keyword: string,
    relatedKeywords: string[]
  ): Promise<TrendData> {
    if (!this.serpApiClient) {
      throw new Error('SerpAPI client not initialized');
    }

    try {
      const response = await this.serpApiClient.get('/search', {
        params: {
          q: keyword,
          geo: 'US', // Puede ser configurable
          hl: 'en'
        }
      });

      // Procesar respuesta de SerpAPI
      const interestOverTime = response.data.interest_over_time?.map((item: any) => ({
        date: item.date,
        value: item.values?.[0]?.value || 0
      })) || [];

      const relatedQueries = (response.data.related_queries?.rising || []).slice(0, 5).map((q: any) => ({
        query: q.query,
        value: q.value || 0
      }));

      const regionalInterest = (response.data.interest_by_region || []).slice(0, 10).map((r: any) => ({
        region: r.geoName,
        value: r.value?.[0]?.value || 0
      }));

      // Calcular tendencia general
      const avgInterest = interestOverTime.reduce((sum: number, item: any) => sum + item.value, 0) / Math.max(1, interestOverTime.length);
      const recentAvg = interestOverTime.slice(-7).reduce((sum: number, item: any) => sum + item.value, 0) / Math.max(1, Math.min(7, interestOverTime.length));
      const olderAvg = interestOverTime.slice(0, -7).reduce((sum: number, item: any) => sum + item.value, 0) / Math.max(1, Math.max(0, interestOverTime.length - 7));

      let trend: 'rising' | 'stable' | 'declining' = 'stable';
      if (recentAvg > olderAvg * 1.2) trend = 'rising';
      else if (recentAvg < olderAvg * 0.8) trend = 'declining';

      return {
        keyword,
        searchVolume: Math.round(avgInterest * 100), // Escalar para simular volumen de búsqueda
        trend,
        interestOverTime,
        relatedQueries,
        regionalInterest,
        validation: {
          viable: true,
          confidence: 0,
          reason: ''
        }
      };

    } catch (error: any) {
      logger.error('Error obteniendo tendencias de SerpAPI', { error: error.message });
      throw error;
    }
  }

  /**
   * Fallback: estimar tendencias usando datos internos
   */
  private async getTrendsFallback(
    keyword: string,
    category?: string
  ): Promise<TrendData> {
    const { prisma } = await import('../config/database');

    try {
      // Buscar productos similares en la base de datos para analizar tendencias
      const similarProducts = await prisma.product.findMany({
        where: {
          OR: [
            { title: { contains: keyword.split(' ')[0], mode: 'insensitive' } },
            category ? { category: { contains: category, mode: 'insensitive' } } : {}
          ]
        },
        include: {
          sales: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Últimos 90 días
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        },
        take: 20
      });

      // Calcular tendencias basadas en ventas reales
      const salesByWeek: number[] = [];
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
        const weekSales = similarProducts.reduce((count, product) => {
          return count + product.sales.filter(sale => {
            const saleDate = sale.createdAt;
            return saleDate >= weekStart && saleDate < weekEnd;
          }).length;
        }, 0);
        salesByWeek.push(weekSales);
      }

      // Calcular tendencia
      const recentAvg = salesByWeek.slice(-4).reduce((a, b) => a + b, 0) / 4;
      const olderAvg = salesByWeek.slice(0, 4).reduce((a, b) => a + b, 0) / 4;

      let trend: 'rising' | 'stable' | 'declining' = 'stable';
      if (recentAvg > olderAvg * 1.2 && recentAvg > 0) trend = 'rising';
      else if (recentAvg < olderAvg * 0.8 || recentAvg === 0) trend = 'declining';

      // Generar datos simulados de interés
      const interestOverTime = salesByWeek.map((sales, index) => {
        const date = new Date(Date.now() - (11 - index) * 7 * 24 * 60 * 60 * 1000);
        return {
          date: date.toISOString().split('T')[0],
          value: Math.min(100, sales * 10) // Escalar para simular interés 0-100
        };
      });

      const totalSales = similarProducts.reduce((sum, p) => sum + p.sales.length, 0);
      const searchVolume = Math.round(totalSales * 50); // Estimación: cada venta = 50 búsquedas

      return {
        keyword,
        searchVolume,
        trend,
        interestOverTime,
        relatedQueries: similarProducts.slice(0, 5).map(p => ({
          query: p.title.substring(0, 50),
          value: p.sales.length
        })),
        regionalInterest: [],
        validation: {
          viable: true,
          confidence: 0,
          reason: ''
        }
      };

    } catch (error: any) {
      logger.error('Error en fallback de tendencias', { error: error.message });
      
      // Retornar datos neutros
      return {
        keyword,
        searchVolume: 0,
        trend: 'stable',
        interestOverTime: [],
        relatedQueries: [],
        regionalInterest: [],
        validation: {
          viable: true,
          confidence: 0,
          reason: 'No se pudieron analizar datos internos'
        }
      };
    }
  }

  /**
   * Validar viabilidad basado en datos de tendencias
   */
  private validateViability(trendData: TrendData): {
    viable: boolean;
    confidence: number;
    reason: string;
  } {
    const { searchVolume, trend, interestOverTime } = trendData;

    let viable = true;
    let confidence = 0;
    const reasons: string[] = [];

    // Validar volumen de búsqueda
    if (searchVolume > 1000) {
      confidence += 30;
      reasons.push('Alto volumen de búsqueda');
    } else if (searchVolume > 100) {
      confidence += 15;
      reasons.push('Volumen de búsqueda moderado');
    } else if (searchVolume === 0) {
      confidence += 5;
      reasons.push('Volumen de búsqueda bajo o desconocido');
    }

    // Validar tendencia
    if (trend === 'rising') {
      confidence += 40;
      reasons.push('Tendencia en crecimiento');
      viable = true;
    } else if (trend === 'stable') {
      confidence += 20;
      reasons.push('Tendencia estable');
      viable = true;
    } else if (trend === 'declining') {
      confidence -= 20;
      reasons.push('Tendencia en declive');
      viable = searchVolume > 500; // Solo viable si tiene buen volumen a pesar del declive
    }

    // Validar interés a lo largo del tiempo
    if (interestOverTime.length > 0) {
      const recentInterest = interestOverTime.slice(-4).reduce((sum, item) => sum + item.value, 0) / 4;
      const avgInterest = interestOverTime.reduce((sum, item) => sum + item.value, 0) / interestOverTime.length;

      if (recentInterest > avgInterest * 1.1) {
        confidence += 20;
        reasons.push('Interés reciente en aumento');
      } else if (recentInterest < avgInterest * 0.9) {
        confidence -= 10;
        reasons.push('Interés reciente en disminución');
      }
    }

    confidence = Math.max(0, Math.min(100, confidence));

    // Determinar viabilidad final
    if (confidence < 30) {
      viable = false;
      reasons.push('Baja confianza general en la viabilidad del producto');
    } else if (confidence >= 70) {
      viable = true;
      reasons.push('Alta confianza en la viabilidad del producto');
    }

    return {
      viable,
      confidence,
      reason: reasons.join('. ') || 'Validación basada en tendencias de búsqueda'
    };
  }

  /**
   * Extraer palabras clave del título del producto
   */
  private extractKeywords(title: string, category?: string): string[] {
    // Palabras comunes a excluir
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'];

    // Limpiar y dividir título
    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    // Si hay categoría, agregarla
    if (category) {
      const categoryWords = category.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      words.unshift(...categoryWords);
    }

    // Devolver hasta 5 palabras clave más relevantes
    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.useSerpAPI && this.serpApiClient) {
        // Intentar una búsqueda de prueba
        await this.getTrendsFromSerpAPI('test', ['test']);
        return {
          success: true,
          message: 'Google Trends (via SerpAPI) connection successful'
        };
      }

      // Si no hay SerpAPI, probar el fallback
      await this.getTrendsFallback('test');
      return {
        success: true,
        message: 'Google Trends fallback (internal data) available'
      };

    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Google Trends service unavailable'
      };
    }
  }
}

// ✅ MODIFICADO: Ya no usamos singleton global - cada usuario debe tener su propia instancia
// Esto permite que cada usuario use sus propias credenciales de SerpAPI

/**
 * ✅ NUEVO: Obtener instancia de GoogleTrendsService para un usuario específico
 * Si userId no se proporciona, retorna una instancia con variables de entorno
 */
export function getGoogleTrendsService(userId?: number): GoogleTrendsService {
  const service = new GoogleTrendsService({
    apiKey: process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY,
    useSerpAPI: !!(process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY)
  });
  
  // Si se proporciona userId, intentar obtener credenciales del usuario
  if (userId) {
    service.setUserCredentials(userId).catch((error: any) => {
      logger.warn('[getGoogleTrendsService] Error configurando credenciales del usuario, usando fallback', {
        userId,
        error: error?.message || String(error)
      });
    });
  }
  
  return service;
}

// ✅ MANTENER: Singleton para retrocompatibilidad (usa variables de entorno)
let googleTrendsServiceInstance: GoogleTrendsService | null = null;

/**
 * @deprecated Usar getGoogleTrendsService(userId) para obtener credenciales del usuario
 * Este método solo usa variables de entorno
 */
export function getDefaultGoogleTrendsService(): GoogleTrendsService {
  if (!googleTrendsServiceInstance) {
    googleTrendsServiceInstance = new GoogleTrendsService({
      apiKey: process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY,
      useSerpAPI: !!(process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY)
    });
  }
  return googleTrendsServiceInstance;
}

export default getDefaultGoogleTrendsService();

