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
      price: p.price || 0,
      sales: p.sales.length,
      profit: p.sales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0)
    }));

    // Oportunidades recientes (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOpportunities = await prisma.opportunity.count({
      where: {
        userId,
        generatedAt: {
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
      } catch (credError: any) {
        logger.warn('AISuggestions: Error obteniendo credenciales GROQ', { error: credError.message });
        // Continuar sin GROQ, usar fallback
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
        response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: groqCredentials.model || 'llama-3.3-70b-versatile',
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
              'Authorization': `Bearer ${groqCredentials.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
      } catch (apiError: any) {
        logger.error('AISuggestions: Error llamando a GROQ API', { 
          error: apiError.message, 
          status: apiError.response?.status,
          userId 
        });
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

      // Guardar sugerencias en BD (no crítico si falla)
      try {
        await this.saveSuggestions(userId, suggestions);
      } catch (saveError: any) {
        logger.warn('AISuggestions: Error guardando sugerencias (no crítico)', { error: saveError.message });
        // Continuar y retornar sugerencias de todos modos
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
    return `Analiza los siguientes datos de un negocio de dropshipping y genera sugerencias inteligentes y accionables.

DATOS DEL NEGOCIO:
- Ventas totales: ${data.totalSales}
- Ingresos totales: $${data.totalRevenue.toFixed(2)}
- Ganancia total: $${data.totalProfit.toFixed(2)}
- Productos activos: ${data.activeProducts}
- Margen de ganancia promedio: ${data.averageProfitMargin.toFixed(1)}%
- Mejor categoría: ${data.bestCategory}
- Categoría con menor rendimiento: ${data.worstCategory}
- Oportunidades recientes: ${data.recentOpportunities}

${category ? `FILTRO: Genera solo sugerencias de tipo "${category}"` : 'GENERA SUGERENCIAS EN TODAS LAS CATEGORÍAS'}

Genera entre 5-8 sugerencias en formato JSON:
{
  "suggestions": [
    {
      "type": "pricing|inventory|marketing|listing|optimization|automation",
      "priority": "high|medium|low",
      "title": "Título claro y accionable",
      "description": "Descripción detallada de la sugerencia",
      "impactRevenue": número_estimado,
      "impactTime": número_horas_ahorradas,
      "difficulty": "easy|medium|hard",
      "confidence": número_0_100,
      "estimatedTime": "X minutos/horas",
      "requirements": ["requisito1", "requisito2"],
      "steps": ["paso1", "paso2", "paso3"],
      "relatedProducts": ["producto1", "producto2"] (opcional),
      "metrics": {
        "currentValue": número,
        "targetValue": número,
        "unit": "USD|%|unidades"
      } (opcional)
    }
  ]
}

Las sugerencias deben ser:
- Específicas y accionables
- Basadas en los datos reales proporcionados
- Con impacto medible (revenue, time)
- Con pasos claros para implementar
- Priorizadas según impacto potencial`;
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

    // Sugerencia de pricing
    if (data.averageProfitMargin < 30) {
      suggestions.push({
        id: `fallback_${Date.now()}_1`,
        type: 'pricing',
        priority: 'high',
        title: 'Optimizar precios para mejorar margen de ganancia',
        description: `Tu margen promedio es ${data.averageProfitMargin.toFixed(1)}%. Considera ajustar precios para alcanzar al menos 40% de margen.`,
        impact: {
          revenue: data.totalRevenue * 0.1,
          time: 2,
          difficulty: 'easy'
        },
        confidence: 85,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a configuración de precios', 'Análisis de competencia'],
        steps: [
          'Revisar precios de productos con menor margen',
          'Analizar precios de competencia en marketplaces',
          'Ajustar precios incrementando 10-15%',
          'Monitorear impacto en ventas'
        ],
        metrics: {
          currentValue: data.averageProfitMargin,
          targetValue: 40,
          unit: '%'
        },
        createdAt: new Date().toISOString()
      });
    }

    // Sugerencia de inventory
    if (data.activeProducts < 10) {
      suggestions.push({
        id: `fallback_${Date.now()}_2`,
        type: 'inventory',
        priority: 'medium',
        title: 'Expandir catálogo de productos',
        description: `Tienes ${data.activeProducts} productos activos. Considera agregar más productos en categorías exitosas como ${data.bestCategory}.`,
        impact: {
          revenue: data.totalRevenue * 0.2,
          time: 5,
          difficulty: 'medium'
        },
        confidence: 75,
        actionable: true,
        implemented: false,
        estimatedTime: '2-3 horas',
        requirements: ['Acceso a búsqueda de oportunidades', 'Tiempo para investigación'],
        steps: [
          'Buscar oportunidades en categoría exitosa',
          'Evaluar margen y competencia',
          'Crear productos desde oportunidades seleccionadas',
          'Publicar en marketplaces'
        ],
        createdAt: new Date().toISOString()
      });
    }

    // Sugerencia de marketing
    if (data.totalSales > 0 && data.totalSales < 20) {
      suggestions.push({
        id: `fallback_${Date.now()}_3`,
        type: 'marketing',
        priority: 'medium',
        title: 'Mejorar visibilidad de productos',
        description: 'Optimiza títulos y descripciones de productos para mejorar su visibilidad en búsquedas.',
        impact: {
          revenue: data.totalRevenue * 0.15,
          time: 3,
          difficulty: 'easy'
        },
        confidence: 70,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a edición de productos'],
        steps: [
          'Revisar títulos de productos más vendidos',
          'Agregar palabras clave relevantes',
          'Mejorar descripciones con detalles del producto',
          'Actualizar imágenes si es necesario'
        ],
        createdAt: new Date().toISOString()
      });
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
        metrics: s.metrics ? (typeof s.metrics === 'string' ? JSON.parse(s.metrics) : {
          currentValue: s.metrics.currentValue,
          targetValue: s.metrics.targetValue,
          unit: s.metrics.unit
        }) : undefined,
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

