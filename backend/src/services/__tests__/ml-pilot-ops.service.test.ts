import { AppError } from '../../middleware/error.middleware';
import { MlPilotOpsService } from '../ml-pilot-ops.service';
import { prisma } from '../../config/database';

jest.mock('../../config/database', () => ({
  prisma: {
    pilotLaunchApproval: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    pilotDecisionLedger: {
      create: jest.fn(),
    },
  },
}));

describe('MlPilotOpsService (Phase 3B)', () => {
  const service = new MlPilotOpsService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consumes a valid approval once and invalidates further consumption', async () => {
    (prisma.pilotLaunchApproval.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.pilotLaunchApproval.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'apr-valid-1',
      decision: 'consumed',
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const consumed = await service.consumePilotApproval({
      approvalId: 'apr-valid-1',
      actor: 'qa_operator',
      evidenceSnapshot: { source: 'unit_test' },
    });

    expect(consumed?.id).toBe('apr-valid-1');
    expect(prisma.pilotLaunchApproval.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.pilotLaunchApproval.findUnique).toHaveBeenCalledTimes(1);

    (prisma.pilotLaunchApproval.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.pilotLaunchApproval.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'apr-valid-1',
      decision: 'consumed',
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      service.consumePilotApproval({
        approvalId: 'apr-valid-1',
        actor: 'qa_operator',
      })
    ).rejects.toMatchObject({
      message: 'Pilot approval already consumed',
    } as Partial<AppError>);
  });

  it('stores pilot decision ledger with assessment snapshots', async () => {
    (prisma.pilotDecisionLedger.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 777,
      ...data,
      createdAt: new Date(),
    }));

    const row = await service.appendPilotDecisionLedger({
      userId: 99,
      productId: 1234,
      marketplace: 'mercadolibre',
      publishIntent: 'pilot',
      requestedMode: 'international',
      modeResolved: 'international',
      result: 'enqueued',
      approvalId: 'apr-777',
      blockers: [],
      warnings: ['pilot_mode:dry_run_no_publication'],
      programVerificationSnapshot: { programResolved: 'foreign_seller_verified' },
      pilotReadinessSnapshot: { pilotAllowed: true },
      evidenceSnapshot: { jobId: 'job-1' },
      reason: 'pilot_publish_job_enqueued',
    });

    expect(prisma.pilotDecisionLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 99,
          productId: 1234,
          marketplace: 'mercadolibre',
          publishIntent: 'pilot',
          requestedMode: 'international',
          modeResolved: 'international',
          result: 'enqueued',
          approvalId: 'apr-777',
        }),
      })
    );
    expect(row.id).toBe(777);
  });
});

