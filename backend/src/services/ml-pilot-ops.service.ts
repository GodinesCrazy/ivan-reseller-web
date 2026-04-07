import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';

export type PilotApprovalDecision = 'approved' | 'rejected' | 'expired' | 'consumed';
export type PilotControlStateValue = 'ready' | 'aborted' | 'rollback_requested' | 'rollback_completed';
export type PilotLedgerResult =
  | 'assessment_only'
  | 'blocked'
  | 'enqueued'
  | 'published'
  | 'aborted'
  | 'failed'
  | 'rollback_requested'
  | 'rollback_completed';

export interface CreatePilotApprovalInput {
  userId: number;
  productId: number;
  marketplace?: string;
  requestedMode: 'local' | 'international';
  approvedBy: string;
  reason?: string;
  decision?: PilotApprovalDecision;
  expiresAt?: Date;
  evidenceSnapshot?: Record<string, unknown>;
}

function normalizeMarketplace(value: unknown): string {
  return String(value || 'mercadolibre').trim().toLowerCase() || 'mercadolibre';
}

function normalizeSiteId(value: unknown): string {
  return String(value || 'MLC').trim().toUpperCase() || 'MLC';
}

export function normalizePilotCategoryKey(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-.]/g, '');
  return normalized.length > 0 ? normalized : null;
}

export class MlPilotOpsService {
  async expireStaleApprovals(params: {
    userId?: number;
    productId?: number;
    marketplace?: string;
  }): Promise<number> {
    const where: Record<string, unknown> = {
      decision: 'approved',
      consumedAt: null,
      expiresAt: { lt: new Date() },
    };
    if (typeof params.userId === 'number') where.userId = params.userId;
    if (typeof params.productId === 'number') where.productId = params.productId;
    if (params.marketplace) where.marketplace = normalizeMarketplace(params.marketplace);

    const updated = await prisma.pilotLaunchApproval.updateMany({
      where: where as any,
      data: {
        decision: 'expired',
      },
    });
    return updated.count;
  }

  async createPilotLaunchApproval(input: CreatePilotApprovalInput) {
    const marketplace = normalizeMarketplace(input.marketplace);
    const expiresAt =
      input.expiresAt || new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      throw new AppError('Pilot approval expiresAt must be in the future', 400);
    }

    await this.expireStaleApprovals({
      userId: input.userId,
      productId: input.productId,
      marketplace,
    });

    return prisma.pilotLaunchApproval.create({
      data: {
        userId: input.userId,
        productId: input.productId,
        marketplace,
        requestedMode: input.requestedMode,
        decision: input.decision || 'approved',
        approvedBy: input.approvedBy,
        reason: input.reason || null,
        expiresAt,
        evidenceSnapshot: (input.evidenceSnapshot as any) || null,
      },
    });
  }

  async listPilotApprovals(params: {
    userId: number;
    marketplace?: string;
    productId?: number;
    decision?: PilotApprovalDecision;
    limit?: number;
  }) {
    await this.expireStaleApprovals({
      userId: params.userId,
      productId: params.productId,
      marketplace: params.marketplace,
    });

    return prisma.pilotLaunchApproval.findMany({
      where: {
        userId: params.userId,
        marketplace: normalizeMarketplace(params.marketplace),
        ...(typeof params.productId === 'number' ? { productId: params.productId } : {}),
        ...(params.decision ? { decision: params.decision } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(params.limit || 50, 200)),
    });
  }

  async getPilotApprovalById(userId: number, approvalId: string) {
    const approval = await prisma.pilotLaunchApproval.findFirst({
      where: { id: approvalId, userId },
    });
    if (!approval) {
      throw new AppError('Pilot approval not found', 404);
    }
    if (
      approval.decision === 'approved' &&
      approval.consumedAt == null &&
      approval.expiresAt.getTime() <= Date.now()
    ) {
      await prisma.pilotLaunchApproval.update({
        where: { id: approval.id },
        data: { decision: 'expired' },
      });
      return {
        ...approval,
        decision: 'expired',
      };
    }
    return approval;
  }

  async findValidPilotApproval(params: {
    userId: number;
    productId: number;
    marketplace?: string;
    requestedMode?: 'local' | 'international';
  }) {
    await this.expireStaleApprovals({
      userId: params.userId,
      productId: params.productId,
      marketplace: params.marketplace,
    });

    return prisma.pilotLaunchApproval.findFirst({
      where: {
        userId: params.userId,
        productId: params.productId,
        marketplace: normalizeMarketplace(params.marketplace),
        decision: 'approved',
        consumedAt: null,
        expiresAt: { gt: new Date() },
        ...(params.requestedMode ? { requestedMode: params.requestedMode } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async consumePilotApproval(params: {
    approvalId: string;
    actor: string;
    evidenceSnapshot?: Record<string, unknown>;
  }) {
    const now = new Date();
    const updated = await prisma.pilotLaunchApproval.updateMany({
      where: {
        id: params.approvalId,
        decision: 'approved',
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        decision: 'consumed',
        consumedAt: now,
        evidenceSnapshot: (params.evidenceSnapshot as any) || undefined,
        approvedBy: params.actor,
      },
    });

    if (updated.count === 0) {
      const existing = await prisma.pilotLaunchApproval.findUnique({
        where: { id: params.approvalId },
      });
      if (!existing) {
        throw new AppError('Pilot approval not found', 404);
      }
      if (existing.consumedAt) {
        throw new AppError('Pilot approval already consumed', 409);
      }
      if (existing.expiresAt.getTime() <= Date.now()) {
        await prisma.pilotLaunchApproval.update({
          where: { id: existing.id },
          data: { decision: 'expired' },
        });
        throw new AppError('Pilot approval expired', 409);
      }
      throw new AppError('Pilot approval is not valid for consumption', 409);
    }

    return prisma.pilotLaunchApproval.findUnique({
      where: { id: params.approvalId },
    });
  }

  async upsertPilotCategoryAllowlistEntry(input: {
    marketplace?: string;
    siteId?: string;
    categoryKey: string;
    enabled: boolean;
    notes?: string;
    createdBy?: string;
  }) {
    const marketplace = normalizeMarketplace(input.marketplace);
    const siteId = normalizeSiteId(input.siteId);
    const categoryKey = normalizePilotCategoryKey(input.categoryKey);
    if (!categoryKey) {
      throw new AppError('categoryKey is required for pilot allowlist', 400);
    }

    return prisma.pilotCategoryAllowlist.upsert({
      where: {
        marketplace_siteId_categoryKey: {
          marketplace,
          siteId,
          categoryKey,
        },
      },
      create: {
        marketplace,
        siteId,
        categoryKey,
        enabled: input.enabled === true,
        notes: input.notes || null,
        createdBy: input.createdBy || null,
      },
      update: {
        enabled: input.enabled === true,
        notes: input.notes || null,
        createdBy: input.createdBy || null,
      },
    });
  }

  async listPilotCategoryAllowlist(params: {
    marketplace?: string;
    siteId?: string;
    enabled?: boolean;
    limit?: number;
  }) {
    return prisma.pilotCategoryAllowlist.findMany({
      where: {
        marketplace: normalizeMarketplace(params.marketplace),
        siteId: normalizeSiteId(params.siteId),
        ...(typeof params.enabled === 'boolean' ? { enabled: params.enabled } : {}),
      },
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(1, Math.min(params.limit || 200, 500)),
    });
  }

  async getPilotCategoryAllowlistEntry(params: {
    marketplace?: string;
    siteId?: string;
    categoryKey: string;
  }) {
    const categoryKey = normalizePilotCategoryKey(params.categoryKey);
    if (!categoryKey) return null;
    return prisma.pilotCategoryAllowlist.findUnique({
      where: {
        marketplace_siteId_categoryKey: {
          marketplace: normalizeMarketplace(params.marketplace),
          siteId: normalizeSiteId(params.siteId),
          categoryKey,
        },
      },
    });
  }

  async isPilotCategoryAllowlisted(params: {
    marketplace?: string;
    siteId?: string;
    categoryKey: string;
  }): Promise<{ allowed: boolean; entry: any | null }> {
    const entry = await this.getPilotCategoryAllowlistEntry(params);
    return {
      allowed: entry?.enabled === true,
      entry,
    };
  }

  async getPilotControlState(params: {
    userId: number;
    productId: number;
    marketplace?: string;
  }) {
    return prisma.pilotControlState.findUnique({
      where: {
        userId_marketplace_productId: {
          userId: params.userId,
          productId: params.productId,
          marketplace: normalizeMarketplace(params.marketplace),
        },
      },
    });
  }

  async setPilotControlState(params: {
    userId: number;
    productId: number;
    marketplace?: string;
    state: PilotControlStateValue;
    reason?: string;
    createdBy?: string;
    evidenceSnapshot?: Record<string, unknown>;
  }) {
    return prisma.pilotControlState.upsert({
      where: {
        userId_marketplace_productId: {
          userId: params.userId,
          productId: params.productId,
          marketplace: normalizeMarketplace(params.marketplace),
        },
      },
      create: {
        userId: params.userId,
        productId: params.productId,
        marketplace: normalizeMarketplace(params.marketplace),
        state: params.state,
        reason: params.reason || null,
        createdBy: params.createdBy || null,
        evidenceSnapshot: (params.evidenceSnapshot as any) || null,
      },
      update: {
        state: params.state,
        reason: params.reason || null,
        createdBy: params.createdBy || null,
        evidenceSnapshot: (params.evidenceSnapshot as any) || null,
      },
    });
  }

  async appendPilotDecisionLedger(input: {
    userId: number;
    productId: number;
    marketplace?: string;
    publishIntent: 'dry_run' | 'pilot' | 'production';
    requestedMode: 'local' | 'international';
    modeResolved: 'local' | 'international';
    result: PilotLedgerResult;
    approvalId?: string | null;
    blockers?: string[];
    warnings?: string[];
    programVerificationSnapshot?: Record<string, unknown>;
    pilotReadinessSnapshot?: Record<string, unknown>;
    evidenceSnapshot?: Record<string, unknown>;
    reason?: string;
  }) {
    return prisma.pilotDecisionLedger.create({
      data: {
        userId: input.userId,
        productId: input.productId,
        marketplace: normalizeMarketplace(input.marketplace),
        publishIntent: input.publishIntent,
        requestedMode: input.requestedMode,
        modeResolved: input.modeResolved,
        result: input.result,
        approvalId: input.approvalId || null,
        blockers: (input.blockers as any) || null,
        warnings: (input.warnings as any) || null,
        programVerificationSnapshot: (input.programVerificationSnapshot as any) || null,
        pilotReadinessSnapshot: (input.pilotReadinessSnapshot as any) || null,
        evidenceSnapshot: (input.evidenceSnapshot as any) || null,
        reason: input.reason || null,
      },
    });
  }

  async listPilotDecisionLedger(params: {
    userId: number;
    productId?: number;
    marketplace?: string;
    limit?: number;
  }) {
    return prisma.pilotDecisionLedger.findMany({
      where: {
        userId: params.userId,
        marketplace: normalizeMarketplace(params.marketplace),
        ...(typeof params.productId === 'number' ? { productId: params.productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(params.limit || 100, 500)),
    });
  }

  async getPilotPostPublishStatus(params: {
    userId: number;
    productId: number;
    marketplace?: string;
  }) {
    const marketplace = normalizeMarketplace(params.marketplace);
    const [control, latestLedger, listing] = await Promise.all([
      this.getPilotControlState({
        userId: params.userId,
        productId: params.productId,
        marketplace,
      }),
      prisma.pilotDecisionLedger.findFirst({
        where: {
          userId: params.userId,
          productId: params.productId,
          marketplace,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.marketplaceListing.findFirst({
        where: {
          userId: params.userId,
          productId: params.productId,
          marketplace,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const listingObserved = Boolean(listing);
    const firstSyncCompleted = Boolean(listing?.lastReconciledAt);
    const pilotPostPublishChecklistGenerated = Boolean(latestLedger);
    const postPublishMonitoringRequired = listingObserved && !firstSyncCompleted;
    const abortRecommended =
      control?.state === 'aborted' ||
      control?.state === 'rollback_requested' ||
      listing?.status === 'failed_publish' ||
      listing?.status === 'not_found';

    const manualChecks: string[] = [];
    if (!listingObserved) {
      manualChecks.push('verify_listing_creation_in_mercadolibre');
    }
    if (listingObserved && !firstSyncCompleted) {
      manualChecks.push('run_first_listing_sync');
    }
    if (abortRecommended) {
      manualChecks.push('execute_abort_or_rollback_runbook');
    }

    return {
      pilotPostPublishChecklistGenerated,
      listingObserved,
      firstSyncCompleted,
      postPublishMonitoringRequired,
      abortRecommended,
      controlState: control?.state || 'ready',
      latestLedgerResult: latestLedger?.result || null,
      listingStatus: listing?.status || null,
      listingId: listing?.listingId || null,
      listingUrl: listing?.listingUrl || null,
      requiredManualChecks: manualChecks,
      evidence: {
        controlState: control,
        latestLedger,
        listing,
      },
    };
  }
}

export const mlPilotOpsService = new MlPilotOpsService();
