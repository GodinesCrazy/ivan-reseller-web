import { PrismaClient, SaleStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../config/logger';

const prisma = new PrismaClient();

export interface CreateSaleDto {
  orderId: string;
  productId: string;
  marketplace: string;
  salePrice: number;
  costPrice: number;
  platformFees?: number;
  currency?: string;
  buyerEmail?: string;
  shippingAddress?: string;
}

export class SaleService {
  async createSale(userId: string, data: CreateSaleDto) {
    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      include: { user: true },
    });

    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Calcular ganancias y comisiones
    const grossProfit = data.salePrice - data.costPrice;
    const platformFees = data.platformFees || 0;
    
    // ✅ Obtener usuario con información de creador para calcular comisión admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        commissionRate: true,
        createdBy: true
      }
    });

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    // ✅ COMISIÓN DEL ADMIN: 20% de la utilidad bruta (gross profit)
    // El commissionRate del usuario ES la comisión que el admin cobra
    const adminCommission = grossProfit * user.commissionRate; // Ej: 0.20 = 20%
    const adminId = user.createdBy || null; // Admin que creó el usuario (si aplica)
    
    // Ganancia neta del USUARIO después de comisiones y fees
    // El usuario se queda con: grossProfit - adminCommission - platformFees
    const netProfit = grossProfit - adminCommission - platformFees;

    // Crear la venta
    const sale = await prisma.sale.create({
      data: {
        orderId: data.orderId,
        productId: data.productId,
        userId,
        marketplace: data.marketplace,
        salePrice: data.salePrice,
        costPrice: data.costPrice,
        grossProfit,
        userCommission: 0, // Deprecated: la comisión ahora es del admin
        commissionAmount: adminCommission, // Comisión del admin (20% por defecto)
        adminCommission,
        platformFees,
        netProfit,
        currency: data.currency || 'USD',
        buyerEmail: data.buyerEmail,
        shippingAddress: data.shippingAddress,
        status: 'PENDING',
      },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // ✅ Crear registro de comisión del ADMIN (20% de gross profit)
    // Esta es la comisión que el admin cobra por la operación exitosa
    await prisma.commission.create({
      data: {
        saleId: sale.id,
        userId, // Usuario que generó la venta
        amount: adminCommission, // Comisión del admin (20% de gross profit)
        currency: sale.currency || 'USD',
        status: 'PENDING',
      },
    });

    // ✅ Crear comisión adicional del admin si el usuario fue creado por otro admin
    // Esto permite tracking de comisiones cuando un admin crea usuarios para otro admin
    if (adminId && user.createdBy && adminId !== parseInt(userId)) {
      await prisma.adminCommission.create({
        data: {
          adminId,
          userId: parseInt(userId),
          saleId: sale.id,
          amount: adminCommission,
          commissionType: 'user_sale',
          status: 'PENDING'
        }
      });

      // Actualizar balance del admin
      await prisma.user.update({
        where: { id: adminId },
        data: {
          balance: {
            increment: adminCommission
          },
          totalEarnings: {
            increment: adminCommission
          }
        }
      });
    }

    // Actualizar balance del USUARIO con su ganancia neta
    await prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: netProfit, // Usuario recibe su ganancia neta (después de comisiones)
        },
        totalEarnings: {
          increment: netProfit,
        },
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId,
        action: 'SALE_CREATED',
        description: `Venta registrada: ${sale.orderId} - $${sale.salePrice}`,
        metadata: JSON.stringify({ saleId: sale.id, orderId: sale.orderId }),
      },
    });

    // ✅ NOTIFICAR AL USUARIO DE LA VENTA
    try {
      const { notificationService } = await import('./notifications.service');
      await notificationService.sendSaleNotification({
        orderId: sale.orderId,
        product: sale.product.title,
        customer: data.buyerEmail || 'Cliente',
        amount: sale.salePrice,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error sending sale notification', { error, saleId: sale.id });
    }

    // ✅ VERIFICAR MODO DE COMPRA (AUTO o MANUAL) y EJECUTAR FLUJO
    try {
      const purchaseMode = await import('./workflow-config.service').then(m => 
        m.workflowConfigService.getStageMode(parseInt(userId), 'purchase')
      );

      if (purchaseMode === 'automatic') {
        // ✅ COMPRA AUTOMÁTICA - Ejecutar flujo automatizado
        const { AutomationService } = await import('./automation.service');
        const automationService = new AutomationService();
        
        await automationService.executeAutomatedFlow({
          id: sale.orderId,
          opportunityId: sale.product.id.toString(),
          customerId: sale.userId.toString(),
          customerInfo: {
            name: data.buyerEmail || 'Cliente',
            email: data.buyerEmail,
            address: data.shippingAddress ? {
              street: typeof data.shippingAddress === 'string' ? data.shippingAddress : (data.shippingAddress as any).street || '',
              city: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).city || '',
              state: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).state || '',
              zipCode: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).zipCode || '',
              country: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).country || ''
            } : undefined
          },
          orderDetails: {
            quantity: 1,
            totalAmount: sale.salePrice,
            productId: sale.productId.toString()
          }
        });

        logger.info('Automatic purchase flow executed', { saleId: sale.id, orderId: sale.orderId });
      } else {
        // ✅ MODO MANUAL - Notificar y esperar confirmación
        const { notificationService } = await import('./notifications.service');
        await notificationService.sendAlert({
          type: 'action_required',
          title: 'Venta requiere compra manual',
          message: `Venta ${sale.orderId} por $${sale.salePrice} requiere procesamiento manual. ¿Desea proceder con la compra?`,
          priority: 'HIGH',
          data: { 
            saleId: sale.id, 
            orderId: sale.orderId,
            stage: 'purchase',
            userId: parseInt(userId)
          },
          actions: [
            { 
              id: 'confirm_purchase', 
              label: 'Confirmar Compra', 
              action: 'confirm_purchase', 
              variant: 'primary' 
            }
          ]
        });

        logger.info('Purchase requires manual confirmation', { saleId: sale.id, orderId: sale.orderId });
      }
    } catch (error) {
      logger.error('Error processing purchase flow', { error, saleId: sale.id });
    }

    return sale;
  }

  async getSales(userId?: string, status?: SaleStatus) {
    const where: any = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (status) {
      where.status = status;
    }

    return prisma.sale.findMany({
      where,
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        commission: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getSaleById(id: string) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        commission: true,
      },
    });

    if (!sale) {
      throw new AppError('Venta no encontrada', 404);
    }

    return sale;
  }

  async updateSaleStatus(id: string, status: SaleStatus) {
    const sale = await this.getSaleById(id);

    const updateData: any = { status };

    // ✅ Si se marca como DELIVERED, verificar si puede marcarse como ciclo completo
    if (status === 'DELIVERED' && !sale.isCompleteCycle) {
      const { successfulOperationService } = await import('./successful-operation.service');
      
      if (await successfulOperationService.canMarkAsSuccessful(parseInt(id))) {
        // Marcar como ciclo completo (sin devoluciones ni problemas por defecto)
        updateData.isCompleteCycle = true;
        updateData.completedAt = new Date();

        // ✅ Crear registro de operación exitosa
        try {
          const operation = await successfulOperationService.markAsSuccessful({
            userId: sale.userId,
            productId: sale.productId,
            saleId: parseInt(id),
            startDate: sale.createdAt,
            completionDate: new Date(),
            totalProfit: sale.netProfit,
            expectedProfit: sale.grossProfit,
            hadReturns: false,
            hadIssues: false
          });

          // ✅ Aprender de la operación exitosa
          try {
            const { aiLearningSystem } = await import('./ai-learning.service');
            if (aiLearningSystem) {
              await aiLearningSystem.learnFromSale({
                sku: sale.productId.toString(),
                price: sale.salePrice,
                profit: sale.netProfit,
                aiScore: 0.8, // TODO: Obtener score real de la predicción original
                sold: true,
                category: sale.product.category || undefined,
                marketplace: sale.marketplace,
                daysToSell: Math.ceil(
                  (new Date().getTime() - sale.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                ),
                isCompleteCycle: true,
                hadReturns: false,
                hadIssues: false
              });
            }
          } catch (learningError) {
            logger.error('Error learning from successful operation', { error: learningError, saleId: id });
          }
        } catch (error) {
          logger.error('Error marking sale as successful operation', { error, saleId: id });
        }
      }
    }

    const updated = await prisma.sale.update({
      where: { id },
      data: updateData,
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        commission: true,
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId: sale.userId,
        action: 'SALE_STATUS_CHANGED',
        description: `Estado de venta ${sale.orderId} cambiado a ${status}`,
        metadata: JSON.stringify({ saleId: id, newStatus: status }),
      },
    });

    // Si la venta se completa, actualizar estado de comisión
    if (status === 'COMPLETED' && sale.commission) {
      await prisma.commission.update({
        where: { id: sale.commission.id },
        data: { status: 'SCHEDULED' },
      });
    }

    // Si la venta se cancela, revertir comisión
    if (status === 'CANCELLED' && sale.commission) {
      await prisma.commission.update({
        where: { id: sale.commission.id },
        data: { status: 'CANCELLED' },
      });

      // Revertir balance del usuario
      await prisma.user.update({
        where: { id: sale.userId },
        data: {
          balance: {
            decrement: sale.userCommission,
          },
          totalEarnings: {
            decrement: sale.userCommission,
          },
        },
      });
    }

    return updated;
  }

  async getSalesStats(userId?: string) {
    const where = userId ? { userId } : {};

    const [
      totalSales,
      pendingSales,
      completedSales,
      cancelledSales,
      totalRevenue,
      totalCommissions,
    ] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.count({ where: { ...where, status: SaleStatus.PENDING } }),
      prisma.sale.count({ where: { ...where, status: SaleStatus.COMPLETED } }),
      prisma.sale.count({ where: { ...where, status: SaleStatus.CANCELLED } }),
      prisma.sale.aggregate({
        where: { ...where, status: SaleStatus.COMPLETED as any },
        _sum: { salePrice: true },
      }),
      prisma.sale.aggregate({
        where: { ...where, status: SaleStatus.COMPLETED as any },
        _sum: { userCommission: true },
      }),
    ]);

    return {
      totalSales,
      pendingSales,
      completedSales,
      cancelledSales,
      totalRevenue: totalRevenue._sum.salePrice || 0,
      totalCommissions: totalCommissions._sum.userCommission || 0,
    };
  }
}

export const saleService = new SaleService();
