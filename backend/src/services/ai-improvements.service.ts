import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

/**
 * AI Improvements Service
 * Análisis de productos exitosos, recomendaciones personalizadas, optimización de IA
 */
export class AIImprovementsService {
  /**
   * Analizar productos más exitosos por categoría
   */
  async analyzeSuccessfulProducts(userId?: number, category?: string): Promise<Array<{
    productId: number;
    title: string;
    category: string;
    successRate: number;
    totalSales: number;
    averageProfit: number;
    totalProfit: number;
    averageDaysToSale: number;
    keyFeatures: string[];
  }>> {
    try {
      const successfulOperations = await prisma.successfulOperation.findMany({
        where: {
          ...(userId && { userId }),
          hadReturns: false,
          hadIssues: false
        },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              category: true
            }
          },
          sale: {
            select: {
              salePrice: true,
              grossProfit: true,
              createdAt: true
            }
          }
        }
      });

      // Agrupar por producto
      const productStats = new Map<number, {
        productId: number;
        title: string;
        category: string;
        sales: number;
        totalProfit: number;
        daysToSale: number[];
        features: Set<string>;
      }>();

      for (const operation of successfulOperations) {
        if (!operation.product) continue;

        const productId = operation.product.id;
        const categoryName = operation.product.category || 'unknown';
        
        // Filtrar por categoría si se especifica
        if (category && categoryName.toLowerCase() !== category.toLowerCase()) {
          continue;
        }

        if (!productStats.has(productId)) {
          productStats.set(productId, {
            productId,
            title: operation.product.title,
            category: categoryName,
            sales: 0,
            totalProfit: 0,
            daysToSale: [],
            features: new Set()
          });
        }

        const stats = productStats.get(productId)!;
        stats.sales++;
        stats.totalProfit += toNumber(operation.totalProfit);
        stats.daysToSale.push(operation.daysToComplete);
      }

      // Calcular métricas y ordenar
      const results = Array.from(productStats.values())
        .map(stats => ({
          productId: stats.productId,
          title: stats.title,
          category: stats.category,
          successRate: stats.sales > 0 ? 100 : 0, // 100% si llegó aquí es exitoso
          totalSales: stats.sales,
          averageProfit: stats.totalProfit / stats.sales,
          totalProfit: stats.totalProfit,
          averageDaysToSale: stats.daysToSale.length > 0
            ? Math.round(stats.daysToSale.reduce((a, b) => a + b, 0) / stats.daysToSale.length)
            : 0,
          keyFeatures: Array.from(stats.features)
        }))
        .sort((a, b) => b.totalProfit - a.totalProfit);

      return results;
    } catch (error) {
      logger.error('AI Improvements: Error analyzing successful products', { error, userId, category });
      throw error;
    }
  }

  /**
   * Generar recomendaciones personalizadas para usuario
   */
  async getPersonalizedRecommendations(userId: number): Promise<{
    recommendedCategories: Array<{
      category: string;
      successRate: number;
      averageProfit: number;
      recommendationScore: number;
      reason: string;
    }>;
    recommendedProducts: Array<{
      productId: number;
      title: string;
      category: string;
      estimatedProfit: number;
      confidence: number;
      reason: string;
    }>;
    pricingSuggestions: Array<{
      productId: number;
      currentPrice: number;
      suggestedPrice: number;
      expectedProfit: number;
      reason: string;
    }>;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          products: {
            where: {
              status: 'APPROVED'
            },
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
        throw new Error('Usuario no encontrado');
      }

      // Analizar categorías exitosas del usuario
      const categoryStats = new Map<string, {
        sales: number;
        totalProfit: number;
        products: number;
      }>();

      for (const sale of user.sales) {
        const category = sale.product?.category || 'unknown';
        if (!categoryStats.has(category)) {
          categoryStats.set(category, {
            sales: 0,
            totalProfit: 0,
            products: 0
          });
        }

        const stats = categoryStats.get(category)!;
        stats.sales++;
        stats.totalProfit += toNumber(sale.netProfit || sale.grossProfit || 0);
      }

      // Generar recomendaciones de categorías
      const recommendedCategories = Array.from(categoryStats.entries())
        .map(([category, stats]) => {
          const successRate = stats.products > 0 ? (stats.sales / stats.products) * 100 : 0;
          const averageProfit = stats.sales > 0 ? stats.totalProfit / stats.sales : 0;
          const recommendationScore = (successRate * 0.4) + (averageProfit * 0.6);

          return {
            category,
            successRate: Math.round(successRate * 100) / 100,
            averageProfit: Math.round(averageProfit * 100) / 100,
            recommendationScore: Math.round(recommendationScore * 100) / 100,
            reason: `Has tenido ${stats.sales} ventas exitosas en esta categoría con ganancia promedio de $${averageProfit.toFixed(2)}`
          };
        })
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .slice(0, 5);

      // Analizar productos similares exitosos globalmente
      const topGlobalProducts = await this.analyzeSuccessfulProducts();
      const recommendedProducts = topGlobalProducts
        .filter(p => !user.products.some(up => up.id === p.productId))
        .slice(0, 10)
        .map(product => ({
          productId: product.productId,
          title: product.title,
          category: product.category,
          estimatedProfit: product.averageProfit,
          confidence: Math.min(95, 60 + (product.totalSales * 5)),
          reason: `${product.totalSales} ventas exitosas con ganancia promedio de $${product.averageProfit.toFixed(2)}`
        }));

      // Sugerencias de precios para productos existentes
      const pricingSuggestions: Array<{
        productId: number;
        currentPrice: number;
        suggestedPrice: number;
        expectedProfit: number;
        reason: string;
      }> = [];

      for (const product of user.products) {
        if (product.sales.length === 0) continue;

        const avgSalePrice = product.sales.reduce((sum, s) => sum + toNumber(s.salePrice), 0) / product.sales.length;
        const avgProfit = product.sales.reduce((sum, s) => sum + toNumber(s.netProfit || s.grossProfit || 0), 0) / product.sales.length;

        // Si el margen es bajo, sugerir aumento de precio
        const margin = avgSalePrice > 0 ? (avgProfit / avgSalePrice) * 100 : 0;
        
        if (margin < 20 && avgSalePrice > 0) {
          const suggestedPrice = avgSalePrice * 1.15; // Aumentar 15%
          const expectedProfit = suggestedPrice - (avgSalePrice - avgProfit);

          pricingSuggestions.push({
            productId: product.id,
            currentPrice: avgSalePrice,
            suggestedPrice: Math.round(suggestedPrice * 100) / 100,
            expectedProfit: Math.round(expectedProfit * 100) / 100,
            reason: `Margen actual bajo (${margin.toFixed(1)}%). Aumentar precio podría mejorar ganancias.`
          });
        }
      }

      return {
        recommendedCategories,
        recommendedProducts,
        pricingSuggestions
      };
    } catch (error) {
      logger.error('AI Improvements: Error getting personalized recommendations', { error, userId });
      throw error;
    }
  }

  /**
   * Optimizar precios dinámicamente basado en competencia
   */
  async optimizePricing(productId: number): Promise<{
    currentPrice: number;
    suggestedPrice: number;
    competitorRange: {
      min: number;
      max: number;
      average: number;
    };
    expectedImpact: {
      salesChange: number; // % de cambio esperado
      profitChange: number; // % de cambio esperado
    };
    confidence: number;
  }> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          sales: {
            where: {
              status: 'DELIVERED'
            }
          }
        }
      });

      if (!product) {
        throw new Error('Producto no encontrado');
      }

      const currentPrice = toNumber(product.suggestedPrice || product.aliexpressPrice) * 2;
      
      // Simular análisis de competencia (en producción, esto vendría de scraping de marketplaces)
      const competitorRange = {
        min: currentPrice * 0.85,
        max: currentPrice * 1.25,
        average: currentPrice * 1.05
      };

      // Calcular precio sugerido (promedio de competencia con margen)
      const suggestedPrice = competitorRange.average * 0.95; // 5% por debajo del promedio

      // Estimar impacto basado en historial
      const salesCount = product.sales.length;
      const priceDifference = ((suggestedPrice - currentPrice) / currentPrice) * 100;

      // Si el precio es más bajo, esperar más ventas pero menos ganancia por venta
      let salesChange = 0;
      let profitChange = 0;

      if (priceDifference < -5) {
        // Precio más bajo: más ventas, menos ganancia por venta
        salesChange = Math.abs(priceDifference) * 2;
        profitChange = priceDifference;
      } else if (priceDifference > 5) {
        // Precio más alto: menos ventas, más ganancia por venta
        salesChange = -priceDifference;
        profitChange = priceDifference * 1.5;
      }

      const confidence = Math.min(90, 50 + (salesCount * 5));

      return {
        currentPrice: Math.round(currentPrice * 100) / 100,
        suggestedPrice: Math.round(suggestedPrice * 100) / 100,
        competitorRange: {
          min: Math.round(competitorRange.min * 100) / 100,
          max: Math.round(competitorRange.max * 100) / 100,
          average: Math.round(competitorRange.average * 100) / 100
        },
        expectedImpact: {
          salesChange: Math.round(salesChange * 100) / 100,
          profitChange: Math.round(profitChange * 100) / 100
        },
        confidence: Math.round(confidence * 100) / 100
      };
    } catch (error) {
      logger.error('AI Improvements: Error optimizing pricing', { error, productId });
      throw error;
    }
  }

  /**
   * Predecir demanda de producto
   */
  async predictDemand(productId: number): Promise<{
    productId: number;
    predictedSales: {
      nextWeek: number;
      nextMonth: number;
      nextQuarter: number;
    };
    confidence: number;
    factors: Array<{
      factor: string;
      impact: 'positive' | 'negative' | 'neutral';
      weight: number;
    }>;
  }> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          sales: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 30
          }
        }
      });

      if (!product) {
        throw new Error('Producto no encontrado');
      }

      // Analizar tendencia de ventas
      const sales = product.sales;
      const salesCount = sales.length;

      if (salesCount === 0) {
        return {
          productId,
          predictedSales: {
            nextWeek: 0,
            nextMonth: 0,
            nextQuarter: 0
          },
          confidence: 20,
          factors: [
            {
              factor: 'Sin historial de ventas',
              impact: 'neutral',
              weight: 1.0
            }
          ]
        };
      }

      // Calcular promedio de ventas por semana
      const firstSale = sales[sales.length - 1];
      const lastSale = sales[0];
      const daysSinceFirst = Math.max(1, Math.floor(
        (lastSale.createdAt.getTime() - firstSale.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      ));
      const weeklyAverage = (salesCount / daysSinceFirst) * 7;

      // Factores de predicción
      const factors: Array<{
        factor: string;
        impact: 'positive' | 'negative' | 'neutral';
        weight: number;
      }> = [];

      // Factor: Tendencia reciente
      const recentSales = sales.slice(0, 7).length;
      const olderSales = sales.slice(7, 14).length;
      if (recentSales > olderSales) {
        factors.push({
          factor: 'Tendencia de crecimiento',
          impact: 'positive',
          weight: 0.3
        });
      } else if (recentSales < olderSales) {
        factors.push({
          factor: 'Tendencia de declive',
          impact: 'negative',
          weight: 0.3
        });
      }

      // Factor: Estacionalidad (simplificado)
      factors.push({
        factor: 'Patrón estacional',
        impact: 'neutral',
        weight: 0.2
      });

      // Factor: Categoría popular
      if (product.category) {
        factors.push({
          factor: `Categoría: ${product.category}`,
          impact: 'positive',
          weight: 0.2
        });
      }

      // Calcular predicciones
      const basePrediction = weeklyAverage;
      const positiveFactors = factors.filter(f => f.impact === 'positive').reduce((sum, f) => sum + f.weight, 0);
      const negativeFactors = factors.filter(f => f.impact === 'negative').reduce((sum, f) => sum + f.weight, 0);
      const multiplier = 1 + (positiveFactors * 0.2) - (negativeFactors * 0.2);

      const predictedSales = {
        nextWeek: Math.max(0, Math.round(basePrediction * multiplier)),
        nextMonth: Math.max(0, Math.round(basePrediction * multiplier * 4)),
        nextQuarter: Math.max(0, Math.round(basePrediction * multiplier * 12))
      };

      const confidence = Math.min(85, 40 + (salesCount * 3) + (positiveFactors * 20));

      return {
        productId,
        predictedSales,
        confidence: Math.round(confidence * 100) / 100,
        factors
      };
    } catch (error) {
      logger.error('AI Improvements: Error predicting demand', { error, productId });
      throw error;
    }
  }
}

export const aiImprovementsService = new AIImprovementsService();

