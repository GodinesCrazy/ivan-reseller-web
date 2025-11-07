import { prisma } from '../config/database';
import { logger } from '../config/logger';
import axios from 'axios';
import { CredentialsManager } from './credentials-manager.service';

export interface AISuggestion {
  id: string;
  type: 'pricing' | 'inventory' | 'marketing' | 'listing' | 'optimization' | 'automation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: {
    revenue: number;
    time: number;
    difficulty: 'easy' | 'medium' | 'hard';
  };
  confidence: number;
  actionable: boolean;
  implemented: boolean;
  estimatedTime: string;
  requirements: string[];
  steps: string[];
  relatedProducts?: string[];
  metrics?: {
    currentValue: number;
    targetValue: number;
    unit: string;
  };
  createdAt: string;
}

interface UserBusinessData {
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  activeProducts: number;
  averageProfitMargin: number;
  bestCategory: string;
  worstCategory: string;
  products: Array<{
    id: number;
    title: string;
    category: string;
    price: number;
    sales: number;
    profit: number;
  }>;
  recentOpportunities: number;
}

export class AISuggestionsService {
  /**
   * Obtener datos del negocio del usuario para análisis
   */
  private async getUserBusinessData(userId: number): Promise<UserBusinessData> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          products: {
            include: {
              sales: {
                where: {
                  status: 'DELIVERED'
                }
              }
            }
          },
          sales: {
            where: {
              status: 'DELIVERED'
            },
            include: {
              product: {
                select: {
                  category: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        logger.warn('AISuggestions: Usuario no encontrado', { userId });
        throw new Error('Usuario no encontrado');
      }

    const totalSales = user.sales.length;
    const totalRevenue = user.sales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
    const totalProfit = user.sales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0);
    const activeProducts = user.products.filter(p => p.status === 'APPROVED').length;

    // Calcular margen promedio
    const profitableSales = user.sales.filter(s => s.salePrice && s.salePrice > 0);
    const averageProfitMargin = profitableSales.length > 0
      ? profitableSales.reduce((sum, s) => {
          const margin = s.salePrice ? ((s.netProfit || s.grossProfit || 0) / s.salePrice) * 100 : 0;
          return sum + margin;
        }, 0) / profitableSales.length
      : 0;

    // Analizar categorías
    const categoryStats = new Map<string, { sales: number; profit: number }>();
    for (const sale of user.sales) {
      const category = sale.product?.category || 'General';
      const stats = categoryStats.get(category) || { sales: 0, profit: 0 };
      stats.sales += 1;
      stats.profit += sale.netProfit || sale.grossProfit || 0;
      categoryStats.set(category, stats);
    }

    let bestCategory = 'General';
    let worstCategory = 'General';
    let maxProfit = -Infinity;
    let minProfit = Infinity;

    for (const [category, stats] of categoryStats.entries()) {
      if (stats.profit > maxProfit) {
        maxProfit = stats.profit;
        bestCategory = category;
      }
      if (stats.profit < minProfit && stats.sales > 0) {
        minProfit = stats.profit;
        worstCategory = category;
      }
    }

    // Productos con estadísticas
    const products = user.products.map(p => ({
      id: p.id,
      title: p.title,
      category: p.category || 'General',
      price: (p as any).price || 0,
      sales: p.sales.length,
      profit: p.sales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0)
    }));

    // Oportunidades recientes (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOpportunities = await prisma.opportunity.count({
      where: {
        userId,
        createdAt: {
          gte: thirtyDaysAgo
        }
      }
    });

    return {
      totalSales,
      totalRevenue,
      totalProfit,
      activeProducts,
      averageProfitMargin,
      bestCategory,
      worstCategory,
      products,
      recentOpportunities
    };
    } catch (error: any) {
      logger.error('AISuggestions: Error en getUserBusinessData', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Generar sugerencias IA usando GROQ
   */
  async generateSuggestions(userId: number, category?: string): Promise<AISuggestion[]> {
    try {
      // ✅ Obtener datos del negocio primero (puede fallar si no hay datos)
      let businessData: UserBusinessData;
      try {
        businessData = await this.getUserBusinessData(userId);
      } catch (dataError: any) {
        logger.error('AISuggestions: Error obteniendo datos del negocio', { error: dataError.message, userId });
        // Si falla, usar datos por defecto
        businessData = {
          totalSales: 0,
          totalRevenue: 0,
          totalProfit: 0,
          activeProducts: 0,
          averageProfitMargin: 0,
          bestCategory: 'General',
          worstCategory: 'General',
          products: [],
          recentOpportunities: 0
        };
      }

      // Obtener credenciales de GROQ
      let groqCredentials: any = null;
      try {
        groqCredentials = await CredentialsManager.getCredentials(userId, 'groq', 'production');
        
        // ✅ Validar que las credenciales estén presentes y sean válidas
        if (groqCredentials && groqCredentials.apiKey) {
          // Limpiar espacios en blanco
          groqCredentials.apiKey = String(groqCredentials.apiKey).trim();
          
          // Validar que la API key no esté vacía
          if (!groqCredentials.apiKey || groqCredentials.apiKey.length < 10) {
            logger.warn('AISuggestions: GROQ API key inválida (muy corta o vacía)', { 
              apiKeyLength: groqCredentials.apiKey?.length || 0 
            });
            groqCredentials = null;
          } else {
            logger.info('AISuggestions: Credenciales GROQ obtenidas correctamente', { 
              hasApiKey: !!groqCredentials.apiKey,
              apiKeyPrefix: groqCredentials.apiKey.substring(0, 10) + '...',
              model: groqCredentials.model || 'default'
            });
          }
        }
      } catch (credError: any) {
        logger.warn('AISuggestions: Error obteniendo credenciales GROQ', { error: credError.message });
        // Continuar sin GROQ, usar fallback
        groqCredentials = null;
      }

      if (!groqCredentials || !groqCredentials.apiKey) {
        logger.warn('AISuggestions: GROQ API no configurada, usando sugerencias de fallback');
        return this.generateFallbackSuggestions(userId);
      }

      // Generar prompt para IA
      const prompt = this.buildPrompt(businessData, category);

      // Llamar a GROQ API
      let response: any;
      try {
        // ✅ Asegurar que la API key esté limpia
        const cleanApiKey = String(groqCredentials.apiKey).trim();
        const model = groqCredentials.model || 'llama-3.3-70b-versatile';
        
        logger.info('AISuggestions: Llamando a GROQ API', { 
          model,
          apiKeyPrefix: cleanApiKey.substring(0, 10) + '...',
          promptLength: prompt.length
        });

        response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages: [
              {
                role: 'system',
                content: 'Eres un consultor experto en e-commerce y dropshipping. Genera sugerencias prácticas y accionables basadas en datos reales del negocio. Responde SOLO en formato JSON válido.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${cleanApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        logger.info('AISuggestions: Respuesta exitosa de GROQ API', { 
          hasContent: !!response.data?.choices?.[0]?.message?.content 
        });
      } catch (apiError: any) {
        // ✅ Logging más detallado para diagnosticar el 401
        const errorDetails: any = {
          error: apiError.message,
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          userId,
          apiKeyPrefix: groqCredentials.apiKey ? String(groqCredentials.apiKey).trim().substring(0, 10) + '...' : 'N/A'
        };
        
        // Si hay respuesta del servidor, incluir más detalles
        if (apiError.response) {
          errorDetails.responseData = apiError.response.data;
          errorDetails.responseHeaders = apiError.response.headers;
        }
        
        logger.error('AISuggestions: Error llamando a GROQ API', errorDetails);
        
        // Si es 401, sugerir verificar la API key
        if (apiError.response?.status === 401) {
          logger.warn('AISuggestions: GROQ API retornó 401 (Unauthorized). Verifica que la API key sea válida y esté activa.');
        }
        
        return this.generateFallbackSuggestions(userId);
      }

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        logger.warn('AISuggestions: Respuesta vacía de GROQ');
        return this.generateFallbackSuggestions(userId);
      }

      // Parsear respuesta JSON
      let aiResponse: any;
      try {
        aiResponse = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (e) {
        logger.error('AISuggestions: Error parseando JSON de GROQ', { content });
        return this.generateFallbackSuggestions(userId);
      }

      // Convertir respuesta de IA a formato AISuggestion
      const suggestions = this.parseAISuggestions(aiResponse, businessData);

      // Guardar sugerencias en BD (no crítico si falla, pero intentar guardar)
      if (suggestions.length > 0) {
        try {
          await this.saveSuggestions(userId, suggestions);
          logger.info(`AISuggestions: ${suggestions.length} sugerencias guardadas para usuario ${userId}`);
        } catch (saveError: any) {
          logger.warn('AISuggestions: Error guardando sugerencias (no crítico)', { error: saveError.message });
          // Continuar y retornar sugerencias de todos modos
        }
      }

      return suggestions;

    } catch (error: any) {
      logger.error('AISuggestions: Error generando sugerencias', { 
        error: error.message, 
        stack: error.stack,
        userId 
      });
      // ✅ Asegurar que siempre retornamos algo, nunca lanzamos error
      try {
        return this.generateFallbackSuggestions(userId);
      } catch (fallbackError: any) {
        logger.error('AISuggestions: Error incluso en fallback', { error: fallbackError.message });
        // Retornar array vacío como último recurso
        return [];
      }
    }
  }

  /**
   * Construir prompt para IA
   */
  private buildPrompt(data: UserBusinessData, category?: string): string {
    return `Eres un consultor experto en DROPSHIPPING automatizado. Analiza los siguientes datos de un negocio de dropshipping que opera con AliExpress como proveedor y publica en marketplaces (eBay, Amazon, MercadoLibre).

CONTEXTO DEL SISTEMA:
- Este es un sistema automatizado de dropshipping
- Fuente de productos: AliExpress (scraping automatizado)
- Canales de venta: eBay, Amazon, MercadoLibre (publicación automatizada)
- El sistema tiene: búsqueda de oportunidades, scraping, publicación automática, gestión de inventario virtual, cálculo de comisiones

DATOS DEL NEGOCIO:
- Ventas totales: ${data.totalSales}
- Ingresos totales: $${data.totalRevenue.toFixed(2)}
- Ganancia total: $${data.totalProfit.toFixed(2)}
- Productos activos: ${data.activeProducts}
- Margen de ganancia promedio: ${data.averageProfitMargin.toFixed(1)}%
- Mejor categoría: ${data.bestCategory}
- Categoría con menor rendimiento: ${data.worstCategory}
- Oportunidades recientes encontradas: ${data.recentOpportunities}

${category ? `FILTRO: Genera solo sugerencias de tipo "${category}"` : 'GENERA SUGERENCIAS EN TODAS LAS CATEGORÍAS'}

IMPORTANTE: Las sugerencias DEBEN ser ESPECÍFICAS para DROPSHIPPING automatizado, NO genéricas de e-commerce.

TIPOS DE SUGERENCIAS ESPECÍFICAS PARA DROPSHIPPING:

1. PRICING (Optimización de precios):
   - Ajustar precios basándose en competencia de marketplaces específicos
   - Implementar repricing automático según cambios en AliExpress
   - Optimizar márgenes considerando fees de marketplaces
   - Ejemplo: "Ajustar precios en eBay para competir con Amazon en categoría ${data.bestCategory}"

2. INVENTORY (Gestión de inventario virtual):
   - Sincronizar disponibilidad entre marketplaces
   - Gestionar productos sin stock en AliExpress
   - Automatizar pausa de listados cuando AliExpress no tiene stock
   - Ejemplo: "Configurar sincronización automática de inventario entre eBay y MercadoLibre"

3. MARKETING (Campañas específicas de marketplaces):
   - Optimizar promociones en marketplaces específicos
   - Mejorar visibilidad en búsquedas de eBay/Amazon/MercadoLibre
   - Ejemplo: "Crear campaña promocional en MercadoLibre para productos de ${data.bestCategory}"

4. LISTING (Optimización de listados):
   - Mejorar títulos y descripciones para SEO de marketplaces
   - Optimizar keywords para búsquedas en AliExpress
   - Mejorar imágenes y especificaciones para conversión
   - Ejemplo: "Optimizar títulos de productos en ${data.worstCategory} para mejorar ranking en búsquedas de eBay"

5. OPTIMIZATION (Optimizaciones del flujo):
   - Mejorar velocidad de publicación desde AliExpress
   - Optimizar selección de productos rentables
   - Mejorar filtrado de oportunidades
   - Ejemplo: "Filtrar oportunidades de ${data.worstCategory} para enfocarse en ${data.bestCategory}"

6. AUTOMATION (Automatizaciones del flujo):
   - Automatizar publicación desde oportunidades encontradas
   - Configurar reglas de auto-aprobación de productos
   - Automatizar repricing según competencia
   - Ejemplo: "Configurar auto-publicación de productos con margen >40% desde AliExpress a eBay"

Genera entre 5-8 sugerencias ESPECÍFICAS DE DROPSHIPPING en formato JSON:
{
  "suggestions": [
    {
      "type": "pricing|inventory|marketing|listing|optimization|automation",
      "priority": "high|medium|low",
      "title": "Título específico de dropshipping (ej: 'Optimizar precios en eBay basándose en competencia de Amazon')",
      "description": "Descripción detallada específica para dropshipping automatizado, mencionando AliExpress y marketplaces",
      "impactRevenue": número_estimado,
      "impactTime": número_horas_ahorradas,
      "difficulty": "easy|medium|hard",
      "confidence": número_0_100,
      "estimatedTime": "X minutos/horas",
      "requirements": ["requisito específico de dropshipping"],
      "steps": ["paso específico relacionado con AliExpress/marketplaces"],
      "relatedProducts": ["producto específico si aplica"] (opcional),
      "metrics": {
        "currentValue": número,
        "targetValue": número,
        "unit": "USD|%|unidades"
      } (opcional)
    }
  ]
}

REGLAS ESTRICTAS:
- NO generar sugerencias genéricas como "crear listados atractivos" o "mejorar sitio web"
- SIEMPRE mencionar AliExpress, marketplaces (eBay/Amazon/MercadoLibre), o automatización
- Las sugerencias deben ser accionables dentro del sistema de dropshipping
- Basarse en los datos reales proporcionados (márgenes, categorías, ventas)
- Priorizar sugerencias que mejoren el flujo automatizado AliExpress → Marketplaces`;
  }

  /**
   * Parsear respuesta de IA a formato AISuggestion
   */
  private parseAISuggestions(aiResponse: any, businessData: UserBusinessData): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    const aiSuggestions = aiResponse.suggestions || [];

    for (let i = 0; i < aiSuggestions.length; i++) {
      const sug = aiSuggestions[i];
      try {
        suggestions.push({
          id: `ai_${Date.now()}_${i}`,
          type: sug.type || 'optimization',
          priority: sug.priority || 'medium',
          title: sug.title || 'Sugerencia sin título',
          description: sug.description || '',
          impact: {
            revenue: sug.impactRevenue || 0,
            time: sug.impactTime || 0,
            difficulty: sug.difficulty || 'medium'
          },
          confidence: Math.min(100, Math.max(0, sug.confidence || 75)),
          actionable: true,
          implemented: false,
          estimatedTime: sug.estimatedTime || '30 minutos',
          requirements: Array.isArray(sug.requirements) ? sug.requirements : [],
          steps: Array.isArray(sug.steps) ? sug.steps : [],
          relatedProducts: Array.isArray(sug.relatedProducts) ? sug.relatedProducts : undefined,
          metrics: sug.metrics ? {
            currentValue: sug.metrics.currentValue || 0,
            targetValue: sug.metrics.targetValue || 0,
            unit: sug.metrics.unit || 'USD'
          } : undefined,
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        logger.warn('AISuggestions: Error parseando sugerencia', { suggestion: sug, error: e });
      }
    }

    return suggestions;
  }

  /**
   * Generar sugerencias de fallback sin IA
   */
  private async generateFallbackSuggestions(userId: number): Promise<AISuggestion[]> {
    let data: UserBusinessData;
    try {
      data = await this.getUserBusinessData(userId);
    } catch (error: any) {
      logger.warn('AISuggestions: Error obteniendo datos para fallback, usando valores por defecto', { error: error.message });
      // Usar datos por defecto si falla
      data = {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        activeProducts: 0,
        averageProfitMargin: 0,
        bestCategory: 'General',
        worstCategory: 'General',
        products: [],
        recentOpportunities: 0
      };
    }
    
    const suggestions: AISuggestion[] = [];

    // Sugerencia de pricing específica de dropshipping
    if (data.averageProfitMargin < 30) {
      suggestions.push({
        id: `fallback_${Date.now()}_1`,
        type: 'pricing',
        priority: 'high',
        title: 'Optimizar precios en marketplaces basándose en competencia',
        description: `Tu margen promedio es ${data.averageProfitMargin.toFixed(1)}%. Analiza precios de competencia en eBay, Amazon y MercadoLibre para productos similares y ajusta tus precios para alcanzar al menos 40% de margen manteniendo competitividad.`,
        impact: {
          revenue: data.totalRevenue * 0.15,
          time: 2,
          difficulty: 'easy'
        },
        confidence: 85,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a configuración de precios en marketplaces', 'API de marketplaces configurada'],
        steps: [
          'Revisar productos con menor margen en el sistema',
          'Buscar productos similares en eBay, Amazon y MercadoLibre',
          'Comparar precios de competencia vs precio de AliExpress',
          'Ajustar precios incrementando 10-15% manteniendo competitividad',
          'Configurar reglas de repricing automático si está disponible'
        ],
        metrics: {
          currentValue: data.averageProfitMargin,
          targetValue: 40,
          unit: '%'
        },
        createdAt: new Date().toISOString()
      });
    }

    // Sugerencia de inventory específica de dropshipping
    if (data.activeProducts < 10) {
      suggestions.push({
        id: `fallback_${Date.now()}_2`,
        type: 'inventory',
        priority: 'medium',
        title: 'Expandir catálogo desde AliExpress usando búsqueda de oportunidades',
        description: `Tienes ${data.activeProducts} productos activos. Usa la función de búsqueda de oportunidades para encontrar productos rentables en AliExpress en la categoría ${data.bestCategory} y publicarlos automáticamente en tus marketplaces configurados.`,
        impact: {
          revenue: data.totalRevenue * 0.3,
          time: 3,
          difficulty: 'medium'
        },
        confidence: 80,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a búsqueda de oportunidades', 'APIs de marketplaces configuradas', 'Credenciales de AliExpress'],
        steps: [
          'Ir a la sección "Oportunidades" del dashboard',
          `Buscar productos en AliExpress de la categoría ${data.bestCategory}`,
          'Revisar oportunidades encontradas y filtrar por margen >40%',
          'Seleccionar productos rentables y crear productos desde oportunidades',
          'Publicar automáticamente en eBay, Amazon o MercadoLibre'
        ],
        createdAt: new Date().toISOString()
      });
    }

    // Sugerencia de listing específica de dropshipping
    if (data.totalSales > 0 && data.totalSales < 20) {
      suggestions.push({
        id: `fallback_${Date.now()}_3`,
        type: 'listing',
        priority: 'medium',
        title: 'Optimizar títulos y descripciones para SEO en marketplaces',
        description: `Tus productos tienen ${data.totalSales} ventas. Mejora los títulos y descripciones de tus listados en eBay, Amazon y MercadoLibre agregando keywords relevantes y detalles específicos del producto para mejorar su ranking en búsquedas y aumentar conversiones.`,
        impact: {
          revenue: data.totalRevenue * 0.25,
          time: 2,
          difficulty: 'easy'
        },
        confidence: 75,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a edición de productos', 'Productos publicados en marketplaces'],
        steps: [
          'Revisar productos con menos ventas en el dashboard',
          'Analizar títulos de productos similares exitosos en cada marketplace',
          'Agregar keywords específicos de búsqueda (marca, modelo, características)',
          'Mejorar descripciones con detalles técnicos del producto de AliExpress',
          'Actualizar imágenes de alta calidad desde AliExpress si es necesario',
          'Aplicar cambios en todos los marketplaces donde está publicado'
        ],
        createdAt: new Date().toISOString()
      });
    }

    // ✅ Guardar sugerencias de fallback también
    if (suggestions.length > 0) {
      try {
        await this.saveSuggestions(userId, suggestions);
        logger.info(`AISuggestions: ${suggestions.length} sugerencias de fallback guardadas para usuario ${userId}`);
      } catch (saveError: any) {
        logger.warn('AISuggestions: Error guardando sugerencias de fallback (no crítico)', { error: saveError.message });
      }
    }

    return suggestions;
  }

  /**
   * Guardar sugerencias en BD
   */
  private async saveSuggestions(userId: number, suggestions: AISuggestion[]): Promise<void> {
    try {
      // ✅ Verificar si la tabla existe antes de guardar
      try {
        for (const suggestion of suggestions) {
          // Buscar si ya existe
          const existing = await prisma.aISuggestion.findFirst({
            where: {
              userId,
              title: suggestion.title
            }
          });

          if (existing) {
            await prisma.aISuggestion.update({
              where: { id: existing.id },
              data: {
                type: suggestion.type,
                priority: suggestion.priority,
                description: suggestion.description,
                impactRevenue: suggestion.impact.revenue,
                impactTime: suggestion.impact.time,
                difficulty: suggestion.impact.difficulty,
                confidence: suggestion.confidence,
                estimatedTime: suggestion.estimatedTime,
                requirements: JSON.stringify(suggestion.requirements),
                steps: JSON.stringify(suggestion.steps),
                relatedProducts: suggestion.relatedProducts ? JSON.stringify(suggestion.relatedProducts) : null,
                metrics: suggestion.metrics ? JSON.stringify(suggestion.metrics) : null,
                updatedAt: new Date()
              }
            });
          } else {
            await prisma.aISuggestion.create({
              data: {
                userId,
                type: suggestion.type,
                priority: suggestion.priority,
                title: suggestion.title,
                description: suggestion.description,
                impactRevenue: suggestion.impact.revenue,
                impactTime: suggestion.impact.time,
                difficulty: suggestion.impact.difficulty,
                confidence: suggestion.confidence,
                actionable: suggestion.actionable,
                implemented: suggestion.implemented,
                estimatedTime: suggestion.estimatedTime,
                requirements: JSON.stringify(suggestion.requirements),
                steps: JSON.stringify(suggestion.steps),
                relatedProducts: suggestion.relatedProducts ? JSON.stringify(suggestion.relatedProducts) : null,
                metrics: suggestion.metrics ? JSON.stringify(suggestion.metrics) : null,
                createdAt: new Date()
              }
            });
          }
        }
      } catch (dbError: any) {
        // Si la tabla no existe, solo loguear y continuar
        if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('ai_suggestions')) {
          logger.warn('AISuggestions: Tabla no existe aún, no se pueden guardar sugerencias. Ejecuta la migración.');
          return; // ✅ Salir silenciosamente, no es crítico
        }
        // Para otros errores de DB, loguear pero no lanzar
        logger.warn('AISuggestions: Error de base de datos al guardar (no crítico)', { 
          error: dbError.message, 
          code: dbError.code 
        });
        return; // ✅ No lanzar error, solo loguear
      }
    } catch (error: any) {
      logger.error('AISuggestions: Error guardando sugerencias', { 
        error: error?.message || String(error), 
        userId 
      });
      // ✅ No lanzar error, solo loguear - guardar sugerencias no es crítico
    }
  }

  /**
   * Obtener sugerencias guardadas del usuario
   */
  async getSuggestions(userId: number, filter?: string): Promise<AISuggestion[]> {
    try {
      // ✅ Verificar si la tabla existe antes de consultar
      try {
        const where: any = { userId, implemented: false };
        if (filter && filter !== 'all') {
          where.type = filter;
        }

        const dbSuggestions = await prisma.aISuggestion.findMany({
          where,
          orderBy: [
            { priority: 'desc' },
            { confidence: 'desc' }
          ],
          take: 20
        });

      return dbSuggestions.map(s => ({
        id: String(s.id),
        type: s.type as any,
        priority: s.priority as any,
        title: s.title,
        description: s.description,
        impact: {
          revenue: s.impactRevenue,
          time: s.impactTime,
          difficulty: s.difficulty as any
        },
        confidence: s.confidence,
        actionable: s.actionable,
        implemented: s.implemented,
        estimatedTime: s.estimatedTime,
        requirements: typeof s.requirements === 'string' ? JSON.parse(s.requirements) : (s.requirements || []),
        steps: typeof s.steps === 'string' ? JSON.parse(s.steps) : (s.steps || []),
        relatedProducts: typeof s.relatedProducts === 'string' ? JSON.parse(s.relatedProducts) : (s.relatedProducts || undefined),
        metrics: s.metrics ? (typeof s.metrics === 'string' ? JSON.parse(s.metrics) : (s.metrics as any)) : undefined,
        createdAt: s.createdAt.toISOString()
      }));
      } catch (dbError: any) {
        // Si la tabla no existe (error P2021 o similar), retornar array vacío
        if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('ai_suggestions')) {
          logger.warn('AISuggestions: Tabla no existe aún, retornando array vacío. Ejecuta la migración.');
          return [];
        }
        throw dbError;
      }
    } catch (error) {
      logger.error('AISuggestions: Error obteniendo sugerencias', { error, userId });
      return [];
    }
  }

  /**
   * Marcar sugerencia como implementada
   */
  async implementSuggestion(userId: number, suggestionId: string): Promise<void> {
    try {
      await prisma.aISuggestion.updateMany({
        where: {
          id: parseInt(suggestionId),
          userId
        },
        data: {
          implemented: true,
          implementedAt: new Date()
        }
      });
    } catch (error: any) {
      // Si la tabla no existe, solo loguear
      if (error.code === 'P2021' || error.message?.includes('does not exist') || error.message?.includes('ai_suggestions')) {
        logger.warn('AISuggestions: Tabla no existe aún. Ejecuta la migración.');
        return;
      }
      logger.error('AISuggestions: Error marcando sugerencia como implementada', { error, userId, suggestionId });
      throw error;
    }
  }
}

export const aiSuggestionsService = new AISuggestionsService();

