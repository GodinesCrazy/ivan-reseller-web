/**
 * E2E — Rank recent VALIDATED_READY products for a Mercado Libre Chile canary publish (same user as ML credentials).
 */
import { prisma } from '../config/database';
import { buildMercadoLibrePublishPreflight } from './mercadolibre-publish-preflight.service';

export type MercadoLibreCanaryCandidateRow = {
  productId: number;
  title: string | null;
  publishAllowed: boolean;
  overallState: string;
  canaryTier: string;
  canaryScore: number;
  topBlockers: string[];
};

export async function listMercadoLibreCanaryCandidatesForUser(params: {
  userId: number;
  isAdmin: boolean;
  environment?: 'sandbox' | 'production';
  /** Max products to run full preflight on (cost control). */
  scanCap?: number;
  /** Max rows returned after sort. */
  resultLimit?: number;
}): Promise<{ candidates: MercadoLibreCanaryCandidateRow[]; scanned: number }> {
  const scanCap = Math.min(36, Math.max(4, params.scanCap ?? 20));
  const resultLimit = Math.min(15, Math.max(1, params.resultLimit ?? 8));

  const rows = await prisma.product.findMany({
    where: {
      userId: params.userId,
      status: 'VALIDATED_READY',
      aliexpressUrl: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    take: scanCap,
    select: { id: true, title: true },
  });

  const candidates: MercadoLibreCanaryCandidateRow[] = [];

  for (const r of rows) {
    try {
      const data = await buildMercadoLibrePublishPreflight({
        userId: params.userId,
        productId: r.id,
        isAdmin: params.isAdmin,
        environment: params.environment,
      });
      candidates.push({
        productId: r.id,
        title: r.title,
        publishAllowed: data.publishAllowed,
        overallState: data.overallState,
        canaryTier: data.canary.tier,
        canaryScore: data.canary.score,
        topBlockers: data.blockers.slice(0, 5),
      });
    } catch {
      candidates.push({
        productId: r.id,
        title: r.title,
        publishAllowed: false,
        overallState: 'blocked_missing_source_data',
        canaryTier: 'blocked',
        canaryScore: 0,
        topBlockers: ['preflight_threw'],
      });
    }
  }

  candidates.sort((a, b) => b.canaryScore - a.canaryScore);

  return {
    candidates: candidates.slice(0, resultLimit),
    scanned: rows.length,
  };
}
