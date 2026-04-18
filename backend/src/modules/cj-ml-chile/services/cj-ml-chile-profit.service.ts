import { prisma } from '../../../config/database';
import fxService from '../../../services/fx.service';

export const cjMlChileProfitService = {
  async getSummary(userId: number) {
    const [listings, orders, snapshots] = await Promise.all([
      prisma.cjMlChileListing.findMany({ where: { userId, status: 'ACTIVE' }, select: { listedPriceCLP: true, listedPriceUsd: true } }),
      prisma.cjMlChileOrder.findMany({ where: { userId, status: 'COMPLETED' }, select: { totalCLP: true, totalUsd: true } }),
      prisma.cjMlChileProfitSnapshot.findMany({ where: { userId }, orderBy: { snapshotDate: 'desc' }, take: 30 }),
    ]);

    const totalRevenueCLP = orders.reduce((s, o) => s + (o.totalCLP ? Number(o.totalCLP) : 0), 0);
    const totalRevenueUsd = orders.reduce((s, o) => s + (o.totalUsd ? Number(o.totalUsd) : 0), 0);
    const listingsActive = listings.length;

    // Profit from snapshots (aggregate)
    const totalProfitUsd = snapshots.reduce((s, sn) => s + Number(sn.estimatedProfitUsd), 0);

    let fxRate: number | null = null;
    try { fxRate = fxService.convert(1, 'USD', 'CLP'); } catch { /* ignore */ }

    return {
      totalRevenueCLP,
      totalRevenueUsd,
      totalProfitUsd,
      listingsActive,
      fxRateCLPperUSD: fxRate,
      snapshots: snapshots.map((s) => ({
        date: s.snapshotDate,
        revenueCLP: Number(s.estimatedRevenueCLP),
        revenueUsd: Number(s.estimatedRevenueUsd),
        profitUsd: Number(s.estimatedProfitUsd),
        fxRate: s.fxRateUsed ? Number(s.fxRateUsed) : null,
      })),
    };
  },
};
