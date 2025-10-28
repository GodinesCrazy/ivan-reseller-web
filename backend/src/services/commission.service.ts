import { PrismaClient, CommissionStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

export class CommissionService {
  async getCommissions(userId?: string, status?: CommissionStatus) {
    const where: any = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (status) {
      where.status = status;
    }

    return prisma.commission.findMany({
      where,
      include: {
        sale: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getCommissionById(id: string) {
    const commission = await prisma.commission.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    if (!commission) {
      throw new AppError('Comisión no encontrada', 404);
    }

    return commission;
  }

  async scheduleCommission(id: string, scheduledDate: Date) {
    const commission = await this.getCommissionById(id);

    if (commission.status !== 'PENDING') {
      throw new AppError('Solo se pueden programar comisiones pendientes', 400);
    }

    const updated = await prisma.commission.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        scheduledDate,
      },
      include: {
        sale: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId: commission.userId,
        type: 'COMMISSION_SCHEDULED',
        description: `Comisión de $${commission.amount} programada para ${scheduledDate.toLocaleDateString()}`,
        metadata: { commissionId: id },
      },
    });

    return updated;
  }

  async markAsPaid(id: string, paypalTransactionId?: string) {
    const commission = await this.getCommissionById(id);

    if (commission.status === 'PAID') {
      throw new AppError('Esta comisión ya fue pagada', 400);
    }

    const updated = await prisma.commission.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paypalTransactionId,
      },
      include: {
        sale: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId: commission.userId,
        type: 'COMMISSION_PAID',
        description: `Comisión de $${commission.amount} pagada`,
        metadata: { 
          commissionId: id,
          paypalTransactionId,
        },
      },
    });

    return updated;
  }

  async batchPayCommissions(commissionIds: string[], paypalBatchId?: string) {
    const commissions = await Promise.all(
      commissionIds.map(id => this.getCommissionById(id))
    );

    // Verificar que todas estén programadas o pendientes
    const invalidCommissions = commissions.filter(
      c => c.status !== 'SCHEDULED' && c.status !== 'PENDING'
    );

    if (invalidCommissions.length > 0) {
      throw new AppError(
        `${invalidCommissions.length} comisiones no pueden ser pagadas (estado inválido)`,
        400
      );
    }

    // Marcar todas como pagadas
    const results = await Promise.all(
      commissions.map(c =>
        prisma.commission.update({
          where: { id: c.id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            paypalTransactionId: paypalBatchId,
          },
        })
      )
    );

    // Registrar actividades
    await Promise.all(
      commissions.map(c =>
        prisma.activity.create({
          data: {
            userId: c.userId,
            type: 'COMMISSION_PAID',
            description: `Comisión de $${c.amount} pagada (lote)`,
            metadata: { 
              commissionId: c.id,
              paypalBatchId,
            },
          },
        })
      )
    );

    return {
      paid: results.length,
      totalAmount: commissions.reduce((sum, c) => sum + c.amount, 0),
      commissions: results,
    };
  }

  async getCommissionStats(userId?: string) {
    const where = userId ? { userId } : {};

    const [
      total,
      pending,
      scheduled,
      paid,
      totalAmount,
      pendingAmount,
    ] = await Promise.all([
      prisma.commission.count({ where }),
      prisma.commission.count({ where: { ...where, status: 'PENDING' } }),
      prisma.commission.count({ where: { ...where, status: 'SCHEDULED' } }),
      prisma.commission.count({ where: { ...where, status: 'PAID' } }),
      prisma.commission.aggregate({
        where,
        _sum: { amount: true },
      }),
      prisma.commission.aggregate({
        where: { ...where, status: { in: ['PENDING', 'SCHEDULED'] } },
        _sum: { amount: true },
      }),
    ]);

    return {
      total,
      pending,
      scheduled,
      paid,
      totalAmount: totalAmount._sum.amount || 0,
      pendingAmount: pendingAmount._sum.amount || 0,
      paidAmount: (totalAmount._sum.amount || 0) - (pendingAmount._sum.amount || 0),
    };
  }

  async getUserBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        balance: true,
        totalEarnings: true,
        commissionRate: true,
      },
    });

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    const stats = await this.getCommissionStats(userId);

    return {
      balance: user.balance,
      totalEarnings: user.totalEarnings,
      commissionRate: user.commissionRate,
      ...stats,
    };
  }
}

export const commissionService = new CommissionService();
