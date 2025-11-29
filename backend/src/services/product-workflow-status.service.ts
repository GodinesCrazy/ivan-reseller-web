import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';
import type {
  ProductWorkflowStatus,
  WorkflowStage,
  StageInfo,
  TimelineEvent,
  StageStatus,
} from '../types/product-workflow.types';
import { workflowConfigService } from './workflow-config.service';

const prisma = new PrismaClient();

export class ProductWorkflowStatusService {
  /**
   * Obtener estado completo del workflow para un producto
   */
  async getProductWorkflowStatus(
    productId: number,
    userId: number
  ): Promise<ProductWorkflowStatus | null> {
    try {
      // Obtener producto con relaciones
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          marketplaceListings: {
            orderBy: { publishedAt: 'desc' },
            take: 1,
          },
          sales: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          purchaseLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!product) {
        return null;
      }

      // Verificar que el producto pertenece al usuario (regla de oro: seguridad)
      if (product.userId !== userId) {
        logger.warn('[ProductWorkflowStatus] Usuario intentando acceder a producto de otro usuario', {
          productId,
          userId,
          productUserId: product.userId,
        });
        return null;
      }

      // Obtener configuración de workflow del usuario
      const workflowConfig = await workflowConfigService.getUserConfig(userId);
      const environment = (workflowConfig.environment as 'sandbox' | 'production') || 'sandbox';

      // Determinar etapa actual
      const currentStage = this.determineCurrentStage(product);

      // Calcular estado de cada etapa
      const stages = {
        scrape: this.getScrapeStage(product, workflowConfig),
        analyze: this.getAnalyzeStage(product, workflowConfig),
        publish: this.getPublishStage(product, workflowConfig),
        purchase: this.getPurchaseStage(product, workflowConfig),
        fulfillment: this.getFulfillmentStage(product, workflowConfig),
        customerService: this.getCustomerServiceStage(product, workflowConfig),
      };

      // Construir timeline
      const timeline = this.buildTimeline(product);

      return {
        productId: product.id,
        productStatus: product.status as any,
        currentStage,
        environment,
        stages,
        timeline,
      };
    } catch (error: any) {
      logger.error('[ProductWorkflowStatus] Error calculando estado del workflow', {
        error: error?.message || String(error),
        productId,
        userId,
        stack: error?.stack,
      });
      // Regla de oro: Si falla, retornar null en lugar de lanzar error
      return null;
    }
  }

  /**
   * Determinar la etapa actual del workflow
   */
  private determineCurrentStage(product: any): WorkflowStage {
    // Si está publicado, puede estar en purchase, fulfillment o customerService
    if (product.isPublished) {
      const latestSale = product.sales?.[0];
      
      if (latestSale) {
        if (latestSale.status === 'DELIVERED') {
          return 'customerService';
        } else if (latestSale.status === 'SHIPPED') {
          return 'fulfillment';
        } else if (['PENDING', 'PROCESSING'].includes(latestSale.status)) {
          // Verificar si hay compra
          const successfulPurchase = product.purchaseLogs?.find(
            (log: any) => log.status === 'SUCCESS'
          );
          if (successfulPurchase) {
            return 'fulfillment';
          }
          return 'purchase';
        }
      }
      
      // Publicado pero sin ventas aún
      return 'publish';
    }

    // Si está aprobado pero no publicado
    if (product.status === 'APPROVED') {
      return 'publish';
    }

    // Si está pendiente
    if (product.status === 'PENDING') {
      return 'analyze';
    }

    // Si está rechazado o inactivo, la etapa actual sigue siendo analyze
    return 'analyze';
  }

  /**
   * Estado de la etapa SCRAPE
   */
  private getScrapeStage(product: any, workflowConfig: any): StageInfo {
    const mode = (workflowConfig.stageScrape as any) || 'automatic';
    
    // SCRAPE siempre está completado si el producto existe
    return {
      status: 'completed',
      mode,
      completedAt: product.createdAt?.toISOString(),
      nextAction: mode === 'automatic' ? undefined : 'Revisar producto encontrado',
    };
  }

  /**
   * Estado de la etapa ANALYZE
   */
  private getAnalyzeStage(product: any, workflowConfig: any): StageInfo {
    const mode = (workflowConfig.stageAnalyze as any) || 'automatic';
    
    // ANALYZE está completado si el producto no está PENDING
    if (product.status !== 'PENDING') {
      // Buscar cuando cambió de PENDING a otro estado
      // Por ahora usamos updatedAt, idealmente deberíamos tener un log de cambios
      const completedAt = product.updatedAt?.toISOString();
      
      let nextAction: string | undefined;
      if (product.status === 'REJECTED') {
        nextAction = 'Producto rechazado - Revisar razones';
      } else if (product.status === 'APPROVED') {
        nextAction = mode === 'automatic' ? 'Listo para publicar' : 'Revisar y publicar';
      }
      
      return {
        status: product.status === 'REJECTED' ? 'failed' : 'completed',
        mode,
        completedAt,
        nextAction,
      };
    }
    
    // Aún está pendiente
    return {
      status: 'in-progress',
      mode,
      nextAction: mode === 'automatic' ? 'Análisis en curso...' : 'Revisar y aprobar',
    };
  }

  /**
   * Estado de la etapa PUBLISH
   */
  private getPublishStage(product: any, workflowConfig: any): StageInfo {
    const mode = (workflowConfig.stagePublish as any) || 'manual';
    const latestListing = product.marketplaceListings?.[0];
    
    if (product.isPublished && latestListing) {
      return {
        status: 'completed',
        mode,
        completedAt: product.publishedAt?.toISOString() || latestListing.publishedAt?.toISOString(),
        listingId: latestListing.listingId,
        marketplace: latestListing.marketplace,
        nextAction: 'Esperando ventas',
      };
    }
    
    if (product.status === 'APPROVED') {
      return {
        status: 'pending',
        mode,
        nextAction: mode === 'automatic' ? 'Publicación pendiente...' : 'Publicar en marketplace',
      };
    }
    
    // No está listo para publicar
    return {
      status: 'skipped',
      mode,
      nextAction: 'Completar etapas anteriores primero',
    };
  }

  /**
   * Estado de la etapa PURCHASE
   */
  private getPurchaseStage(product: any, workflowConfig: any): StageInfo {
    const mode = (workflowConfig.stagePurchase as any) || 'manual';
    const latestSale = product.sales?.[0];
    const latestPurchase = product.purchaseLogs?.[0];
    
    // Si no hay ventas, no se necesita compra aún
    if (!latestSale) {
      return {
        status: 'not-needed',
        mode,
        nextAction: 'Esperando venta',
      };
    }
    
    // Si hay compra exitosa
    if (latestPurchase && latestPurchase.status === 'SUCCESS') {
      return {
        status: 'completed',
        mode,
        completedAt: latestPurchase.completedAt?.toISOString(),
        orderId: latestPurchase.supplierOrderId,
        purchaseLogId: latestPurchase.id,
        nextAction: 'Proceder con envío',
      };
    }
    
    // Si hay venta pero no compra (o compra fallida)
    if (['PENDING', 'PROCESSING'].includes(latestSale.status)) {
      if (latestPurchase && latestPurchase.status === 'FAILED') {
        return {
          status: 'failed',
          mode,
          nextAction: mode === 'automatic' ? 'Revisar error y reintentar' : 'Comprar manualmente',
        };
      }
      
      if (latestPurchase && latestPurchase.status === 'PROCESSING') {
        return {
          status: 'in-progress',
          mode,
          orderId: latestPurchase.supplierOrderId,
          purchaseLogId: latestPurchase.id,
          nextAction: 'Compra en progreso...',
        };
      }
      
      // Venta pendiente pero sin compra iniciada
      return {
        status: 'pending',
        mode,
        nextAction: mode === 'automatic' ? 'Compra automática pendiente...' : 'Iniciar compra manual',
      };
    }
    
    return {
      status: 'not-needed',
      mode,
      nextAction: undefined,
    };
  }

  /**
   * Estado de la etapa FULFILLMENT
   */
  private getFulfillmentStage(product: any, workflowConfig: any): StageInfo {
    const mode = (workflowConfig.stageFulfillment as any) || 'manual';
    const latestSale = product.sales?.[0];
    
    if (!latestSale) {
      return {
        status: 'not-needed',
        mode,
        nextAction: 'Esperando venta y compra',
      };
    }
    
    // Verificar si hay compra exitosa
    const successfulPurchase = product.purchaseLogs?.find((log: any) => log.status === 'SUCCESS');
    if (!successfulPurchase) {
      return {
        status: 'skipped',
        mode,
        nextAction: 'Completar compra primero',
      };
    }
    
    if (latestSale.status === 'DELIVERED') {
      return {
        status: 'completed',
        mode,
        completedAt: latestSale.completedAt?.toISOString(),
        trackingNumber: latestSale.trackingNumber,
        shippedAt: latestSale.updatedAt?.toISOString(), // Aproximación
        nextAction: undefined,
      };
    }
    
    if (latestSale.status === 'SHIPPED') {
      return {
        status: 'in-progress',
        mode,
        trackingNumber: latestSale.trackingNumber,
        shippedAt: latestSale.updatedAt?.toISOString(),
        nextAction: 'Seguir tracking de envío',
      };
    }
    
    if (['PENDING', 'PROCESSING'].includes(latestSale.status)) {
      // Verificar si la compra está completada
      if (successfulPurchase) {
        return {
          status: 'pending',
          mode,
          nextAction: mode === 'automatic' ? 'Procesando envío...' : 'Configurar envío',
        };
      }
    }
    
    return {
      status: 'pending',
      mode,
      nextAction: 'Completar compra primero',
    };
  }

  /**
   * Estado de la etapa CUSTOMER SERVICE
   */
  private getCustomerServiceStage(product: any, workflowConfig: any): StageInfo {
    const mode = (workflowConfig.stageCustomerService as any) || 'manual';
    const latestSale = product.sales?.[0];
    
    if (!latestSale) {
      return {
        status: 'not-needed',
        mode,
        nextAction: 'Esperando venta',
      };
    }
    
    // Por ahora simplificado - en el futuro podríamos tener tabla de tickets
    // Si hay ventas con problemas (cancelled, returned), hay trabajo de customer service
    const hasIssues = latestSale.status === 'CANCELLED' || latestSale.status === 'RETURNED';
    
    if (hasIssues) {
      return {
        status: 'active',
        mode,
        lastInteraction: latestSale.updatedAt?.toISOString(),
        nextAction: 'Resolver issue con cliente',
      };
    }
    
    if (latestSale.status === 'DELIVERED') {
      return {
        status: 'completed',
        mode,
        lastInteraction: latestSale.completedAt?.toISOString() || latestSale.updatedAt?.toISOString(),
        nextAction: 'Ciclo completado',
      };
    }
    
    return {
      status: 'not-needed',
      mode,
      nextAction: 'Esperando entrega',
    };
  }

  /**
   * Construir timeline de eventos
   */
  private buildTimeline(product: any): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];
    
    // Evento: Creación del producto (SCRAPE)
    timeline.push({
      stage: 'scrape',
      action: 'Producto encontrado',
      timestamp: product.createdAt?.toISOString() || new Date().toISOString(),
      status: 'completed',
      actor: 'system',
      details: `Producto: ${product.title}`,
    });
    
    // Evento: Análisis completado
    if (product.status !== 'PENDING') {
      timeline.push({
        stage: 'analyze',
        action: product.status === 'APPROVED' ? 'Producto aprobado' : 'Producto rechazado',
        timestamp: product.updatedAt?.toISOString() || product.createdAt?.toISOString() || new Date().toISOString(),
        status: product.status === 'APPROVED' ? 'completed' : 'failed',
        actor: 'system',
        details: `Estado: ${product.status}`,
      });
    }
    
    // Evento: Publicación
    if (product.isPublished) {
      const latestListing = product.marketplaceListings?.[0];
      timeline.push({
        stage: 'publish',
        action: 'Producto publicado',
        timestamp: product.publishedAt?.toISOString() || latestListing?.publishedAt?.toISOString() || new Date().toISOString(),
        status: 'completed',
        actor: 'system',
        details: latestListing ? `Marketplace: ${latestListing.marketplace}` : undefined,
      });
    }
    
    // Eventos: Ventas
    if (product.sales && product.sales.length > 0) {
      product.sales.forEach((sale: any) => {
        timeline.push({
          stage: 'purchase',
          action: 'Venta recibida',
          timestamp: sale.createdAt?.toISOString() || new Date().toISOString(),
          status: 'completed',
          actor: 'system',
          details: `Orden: ${sale.orderId} - $${sale.salePrice}`,
        });
      });
    }
    
    // Eventos: Compras
    if (product.purchaseLogs && product.purchaseLogs.length > 0) {
      product.purchaseLogs.forEach((log: any) => {
        if (log.status === 'SUCCESS') {
          timeline.push({
            stage: 'purchase',
            action: 'Compra completada',
            timestamp: log.completedAt?.toISOString() || log.createdAt?.toISOString() || new Date().toISOString(),
            status: 'completed',
            actor: 'system',
            details: log.supplierOrderId ? `Orden proveedor: ${log.supplierOrderId}` : undefined,
          });
        } else if (log.status === 'FAILED') {
          timeline.push({
            stage: 'purchase',
            action: 'Compra fallida',
            timestamp: log.createdAt?.toISOString() || new Date().toISOString(),
            status: 'failed',
            actor: 'system',
            details: log.errorMessage || 'Error desconocido',
          });
        }
      });
    }
    
    // Eventos: Envíos
    if (product.sales && product.sales.length > 0) {
      product.sales.forEach((sale: any) => {
        if (sale.status === 'SHIPPED' && sale.trackingNumber) {
          timeline.push({
            stage: 'fulfillment',
            action: 'Producto enviado',
            timestamp: sale.updatedAt?.toISOString() || new Date().toISOString(),
            status: 'completed',
            actor: 'system',
            details: `Tracking: ${sale.trackingNumber}`,
          });
        }
        
        if (sale.status === 'DELIVERED') {
          timeline.push({
            stage: 'fulfillment',
            action: 'Producto entregado',
            timestamp: sale.completedAt?.toISOString() || sale.updatedAt?.toISOString() || new Date().toISOString(),
            status: 'completed',
            actor: 'system',
            details: 'Entrega completada',
          });
        }
      });
    }
    
    // Ordenar por timestamp descendente (más reciente primero)
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return timeline;
  }
}

export const productWorkflowStatusService = new ProductWorkflowStatusService();

