import { prisma } from '../../../config/database';

export const cjMlChileAlertsService = {
  async create(userId: number, data: { type: string; severity?: string; payload?: unknown }) {
    return prisma.cjMlChileAlert.create({
      data: {
        userId,
        type: data.type,
        severity: data.severity ?? 'warning',
        payload: data.payload !== undefined ? (data.payload as object) : undefined,
      },
    });
  },

  async list(userId: number, status?: string) {
    return prisma.cjMlChileAlert.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async acknowledge(userId: number, alertId: number) {
    const alert = await prisma.cjMlChileAlert.findFirst({ where: { id: alertId, userId } });
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    return prisma.cjMlChileAlert.update({
      where: { id: alertId },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
  },

  async resolve(userId: number, alertId: number) {
    const alert = await prisma.cjMlChileAlert.findFirst({ where: { id: alertId, userId } });
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    return prisma.cjMlChileAlert.update({
      where: { id: alertId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  },
};
