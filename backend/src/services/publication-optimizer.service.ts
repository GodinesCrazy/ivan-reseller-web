import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { workflowConfigService } from './workflow-config.service';

/**
 * ✅ Servicio para optimizar tiempo de publicación basado en capital de trabajo
 * El sistema calcula cuánto tiempo debe estar publicado un producto basado en:
 * - Capital de trabajo disponible
 * - Tasa de rotación de productos
 * - Performance histórica
 * - Optimización de capital
 */
export class PublicationOptimizerService {
  /**
   * ✅ Calcular tiempo óptimo de publicación (en días) basado en capital de trabajo
   */
  async calculateOptimalPublicationDuration(
    userId: number,
    productCost: number,
    expectedProfit: number
  ): Promise<{
    durationDays: number;
    reasoning: string[];
    confidence: number;
  }> {
    try {
      // Obtener capital de trabajo del usuario
      const workingCapital = await workflowConfigService.getWorkingCapital(userId);
      
      // Obtener productos publicados activos del usuario
      const activeProducts = await prisma.product.findMany({
        where: {
          userId,
          isPublished: true,
          status: 'PUBLISHED'
        },
        include: {
          sales: {
            where: {
              status: {
                in: ['DELIVERED', 'COMPLETED']
              }
            }
          }
        }
      });

      // Calcular capital comprometido en productos activos
      const { toNumber } = require('../utils/decimal.utils');
      const committedCapital = activeProducts.reduce(
        (sum, product) => sum + toNumber(product.aliexpressPrice || 0),
        0
      );

      // Capital disponible para nuevas publicaciones
      const availableCapital = workingCapital - committedCapital;

      // Obtener estadísticas de ventas del usuario
      const salesStats = await prisma.sale.groupBy({
        by: ['status'],
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Últimos 30 días
          }
        },
        _count: true
      });

      const deliveredSales = salesStats.find(s => s.status === 'DELIVERED');
      const totalSales = salesStats.reduce((sum, s) => sum + s._count, 0);
      
      // Calcular tasa de conversión promedio
      const conversionRate = totalSales > 0 
        ? (deliveredSales?._count || 0) / totalSales 
        : 0.1; // Default 10% si no hay datos

      // Calcular tiempo promedio de venta (días desde publicación hasta venta)
      const salesWithDates = await prisma.sale.findMany({
        where: {
          userId,
          status: 'DELIVERED',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        include: {
          product: true
        }
      });

      let avgDaysToSell = 7; // Default 7 días
      if (salesWithDates.length > 0) {
        const daysToSell = salesWithDates.map(sale => {
          if (sale.product.publishedAt) {
            const days = Math.ceil(
              (sale.createdAt.getTime() - sale.product.publishedAt.getTime()) / 
              (1000 * 60 * 60 * 24)
            );
            return days;
          }
          return 7;
        });
        avgDaysToSell = daysToSell.reduce((sum, d) => sum + d, 0) / daysToSell.length;
      }

      // ✅ LÓGICA DE OPTIMIZACIÓN:
      // 1. Si el capital disponible es bajo, reducir tiempo de publicación
      // 2. Si la tasa de conversión es alta, aumentar tiempo de publicación
      // 3. Si el producto es costoso, reducir tiempo para liberar capital más rápido

      const reasoning: string[] = [];
      let durationDays = 30; // Default 30 días

      // Factor 1: Capital disponible
      const capitalUtilization = committedCapital / workingCapital;
      if (capitalUtilization > 0.8) {
        // Capital muy comprometido - reducir tiempo de publicación
        durationDays = Math.max(7, durationDays * 0.5);
        reasoning.push(`Capital comprometido al ${(capitalUtilization * 100).toFixed(0)}% - reducir tiempo de publicación a ${durationDays} días`);
      } else if (capitalUtilization < 0.3) {
        // Capital disponible - aumentar tiempo de publicación
        durationDays = Math.min(60, durationDays * 1.5);
        reasoning.push(`Capital disponible al ${((1 - capitalUtilization) * 100).toFixed(0)}% - aumentar tiempo de publicación a ${durationDays} días`);
      }

      // Factor 2: Tasa de conversión
      if (conversionRate > 0.15) {
        // Alta conversión - mantener o aumentar tiempo
        durationDays = Math.min(60, durationDays * 1.2);
        reasoning.push(`Tasa de conversión alta (${(conversionRate * 100).toFixed(1)}%) - mantener publicación más tiempo`);
      } else if (conversionRate < 0.05) {
        // Baja conversión - reducir tiempo
        durationDays = Math.max(7, durationDays * 0.7);
        reasoning.push(`Tasa de conversión baja (${(conversionRate * 100).toFixed(1)}%) - reducir tiempo de publicación`);
      }

      // Factor 3: Costo del producto vs capital disponible
      if (productCost > availableCapital * 0.3) {
        // Producto costoso - reducir tiempo para liberar capital
        durationDays = Math.max(7, durationDays * 0.6);
        reasoning.push(`Producto costoso ($${productCost.toFixed(2)}) - reducir tiempo para optimizar capital`);
      }

      // Factor 4: Tiempo promedio de venta
      if (avgDaysToSell < 5) {
        // Productos se venden rápido - mantener publicación
        durationDays = Math.max(durationDays, avgDaysToSell * 3);
        reasoning.push(`Tiempo promedio de venta rápido (${avgDaysToSell.toFixed(1)} días) - mantener publicación`);
      } else if (avgDaysToSell > 14) {
        // Productos se venden lento - reducir tiempo
        durationDays = Math.max(7, Math.min(durationDays, avgDaysToSell));
        reasoning.push(`Tiempo promedio de venta lento (${avgDaysToSell.toFixed(1)} días) - reducir tiempo de publicación`);
      }

      // Asegurar límites razonables (7-60 días)
      durationDays = Math.max(7, Math.min(60, Math.round(durationDays)));

      // Calcular confianza basada en cantidad de datos
      const confidence = Math.min(
        0.95,
        0.5 + (salesWithDates.length * 0.05) + (conversionRate * 0.3)
      );

      if (reasoning.length === 0) {
        reasoning.push(`Tiempo estándar de ${durationDays} días basado en configuración por defecto`);
      }

      logger.info('Publication Optimizer: Calculated optimal duration', {
        userId,
        productCost,
        durationDays,
        confidence
      });

      return {
        durationDays,
        reasoning,
        confidence
      };

    } catch (error) {
      logger.error('Publication Optimizer: Error calculating duration', { error, userId });
      // Retornar valores por defecto en caso de error
      return {
        durationDays: 30,
        reasoning: ['Error al calcular - usando tiempo por defecto de 30 días'],
        confidence: 0.5
      };
    }
  }

  /**
   * ✅ Programar despublicación automática basada en tiempo óptimo
   */
  async scheduleAutoUnpublish(
    userId: number,
    productId: number,
    durationDays: number
  ): Promise<void> {
    try {
      const unpublishDate = new Date();
      unpublishDate.setDate(unpublishDate.getDate() + durationDays);

      // TODO: Implementar job scheduler para despublicar automáticamente
      // Por ahora, actualizar producto con fecha de despublicación programada
      await prisma.product.update({
        where: { id: productId },
        data: {
          // Agregar campo para fecha de despublicación programada
          // Esto se puede usar por un job scheduler
        }
      });

      logger.info('Publication Optimizer: Scheduled auto-unpublish', {
        userId,
        productId,
        unpublishDate
      });

    } catch (error) {
      logger.error('Publication Optimizer: Error scheduling unpublish', { error, userId, productId });
    }
  }
}

export const publicationOptimizerService = new PublicationOptimizerService();

