import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

export class CommissionService {
  async getCommissions(userId?: number, status?: string) {
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

  /**
   * Get commission by ID with optional ownership validation
   * @param id - Commission ID
   * @param userId - Optional user ID to validate ownership (if provided, non-admin users can only see their own commissions)
   * @param isAdmin - Whether the requesting user is an admin (admins can see all commissions)
   */
  async getCommissionById(id: number, userId?: number, isAdmin: boolean = false) {
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

    // ✅ P0.1: Validar ownership - usuarios no-admin solo pueden ver sus propias comisiones
    if (userId && !isAdmin && commission.userId !== userId) {
      throw new AppError('No tienes permiso para ver esta comisión', 403);
    }

    return commission;
  }

  async scheduleCommission(id: number, scheduledDate: Date, userId?: number, isAdmin: boolean = false) {
    // ✅ P0.1: Validar ownership antes de programar
    const commission = await this.getCommissionById(id, userId, isAdmin);

    if (commission.status !== 'PENDING') {
      throw new AppError('Solo se pueden programar comisiones pendientes', 400);
    }

    const updated = await prisma.commission.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        scheduledAt: scheduledDate,
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
        action: 'COMMISSION_SCHEDULED',
        description: `Comisión de $${commission.amount} programada para ${scheduledDate.toLocaleDateString()}`,
        metadata: JSON.stringify({ commissionId: id }),
      },
    });

    return updated;
  }

  async markAsPaid(id: number, paypalTransactionId?: string, userId?: number, isAdmin: boolean = false) {
    // ✅ P0.1: Validar ownership antes de marcar como pagada
    const commission = await this.getCommissionById(id, userId, isAdmin);

    if (commission.status === 'PAID') {
      throw new AppError('Esta comisión ya fue pagada', 400);
    }

    const updated = await prisma.commission.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        // paypalTransactionId se guarda en metadata de Activity
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
        action: 'COMMISSION_PAID',
        description: `Comisión de $${commission.amount} pagada`,
        metadata: JSON.stringify({ 
          commissionId: id,
          paypalTransactionId: paypalTransactionId || null,
        }),
      },
    });

    return updated;
  }

  async batchPayCommissions(commissionIds: number[], paypalBatchId?: string, userId?: number, isAdmin: boolean = false) {
    // ✅ P0.1: Validar ownership para cada comisión antes de pagar en lote
    const commissions = await Promise.all(
      commissionIds.map(id => this.getCommissionById(id, userId, isAdmin))
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
            // paypalBatchId se guarda en metadata de Activity
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
            action: 'COMMISSION_PAID',
            description: `Comisión de $${c.amount} pagada (lote)`,
            metadata: JSON.stringify({ 
              commissionId: c.id,
              paypalBatchId: paypalBatchId || null,
            }),
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

  async getCommissionStats(userId?: string | number) {
    // Convertir userId a number si es string (Prisma espera number)
    const userIdNumber = userId ? (typeof userId === 'string' ? parseInt(userId, 10) : userId) : undefined;
    const where = userIdNumber ? { userId: userIdNumber } : {};

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

  async getUserBalance(userId: number) {
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
