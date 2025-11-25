import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';

const router = Router();

// Require authentication and admin role
router.use(authenticate);
router.use(authorize('ADMIN'));

// ✅ GET /api/admin/commissions - Obtener comisiones del admin por usuarios creados
router.get('/commissions', async (req: Request, res: Response, next) => {
  try {
    const adminId = req.user?.userId;
    if (!adminId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const status = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const where: any = {
      adminId
    };

    if (status) {
      where.status = status;
    }

    const [commissions, total] = await Promise.all([
      prisma.adminCommission.findMany({
        where,
        include: {
          sale: {
            include: {
              product: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.adminCommission.count({ where })
    ]);

    // Calcular totales
    const totals = await prisma.adminCommission.aggregate({
      where: { adminId },
      _sum: { amount: true }
    });

    const byStatus = await prisma.adminCommission.groupBy({
      by: ['status'],
      where: { adminId },
      _sum: { amount: true },
      _count: true
    });

    res.json({
      success: true,
      commissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      totals: {
        totalAmount: totals._sum.amount ? Number(totals._sum.amount) : 0,
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = {
            count: item._count,
            amount: item._sum.amount ? Number(item._sum.amount) : 0
          };
          return acc;
        }, {} as Record<string, { count: number; amount: number }>)
      }
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/admin/commissions/stats - Estadísticas de comisiones del admin
router.get('/commissions/stats', async (req: Request, res: Response, next) => {
  try {
    const adminId = req.user?.userId;
    if (!adminId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const [total, pending, paid, totalAmount, pendingAmount, paidAmount] = await Promise.all([
      prisma.adminCommission.count({ where: { adminId } }),
      prisma.adminCommission.count({ where: { adminId, status: 'PENDING' } }),
      prisma.adminCommission.count({ where: { adminId, status: 'PAID' } }),
      prisma.adminCommission.aggregate({
        where: { adminId },
        _sum: { amount: true }
      }),
      prisma.adminCommission.aggregate({
        where: { adminId, status: 'PENDING' },
        _sum: { amount: true }
      }),
      prisma.adminCommission.aggregate({
        where: { adminId, status: 'PAID' },
        _sum: { amount: true }
      })
    ]);

    res.json({
      success: true,
      stats: {
        total,
        pending,
        paid,
        totalAmount: totalAmount._sum.amount || 0,
        pendingAmount: pendingAmount._sum.amount || 0,
        paidAmount: paidAmount._sum.amount || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

