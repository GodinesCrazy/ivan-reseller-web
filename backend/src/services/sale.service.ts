import { PrismaClient, SaleStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

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
    
    // Obtener tasa de comisión del usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    // Comisión del usuario (basada en su commissionRate)
    const userCommission = grossProfit * user.commissionRate;
    
    // Comisión del admin (2% del gross profit)
    const adminCommission = grossProfit * 0.02;
    
    // Ganancia neta después de comisiones y fees
    const netProfit = grossProfit - userCommission - adminCommission - platformFees;

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
        userCommission,
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

    // Crear comisión pendiente
    await prisma.commission.create({
      data: {
        saleId: sale.id,
        userId,
        amount: userCommission,
        currency: sale.currency,
        status: 'PENDING',
      },
    });

    // Actualizar balance del usuario
    await prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: userCommission,
        },
        totalEarnings: {
          increment: userCommission,
        },
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId,
        type: 'SALE_CREATED',
        description: `Venta registrada: ${sale.orderId} - $${sale.salePrice}`,
        metadata: { saleId: sale.id, orderId: sale.orderId },
      },
    });

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

    const updated = await prisma.sale.update({
      where: { id },
      data: { status },
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
        type: 'SALE_STATUS_CHANGED',
        description: `Estado de venta ${sale.orderId} cambiado a ${status}`,
        metadata: { saleId: id, newStatus: status },
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
