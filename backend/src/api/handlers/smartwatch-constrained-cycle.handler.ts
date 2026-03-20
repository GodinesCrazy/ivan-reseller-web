/**
 * POST /api/internal/smartwatch-mlc-constrained-cycle
 * Pipeline real: tendencias → research smartwatch → validación estricta CL → publicar MLC.
 */

import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { runSmartwatchMlcConstrainedCycle } from '../../services/smartwatch-constrained-cycle.service';
import { logger } from '../../config/logger';

export async function runSmartwatchConstrainedCycleHandler(req: Request, res: Response): Promise<void> {
  const start = Date.now();
  try {
    const requestedUserId = Number(req.body?.userId);
    const user = Number.isFinite(requestedUserId) && requestedUserId > 0
      ? await prisma.user.findUnique({
          where: { id: requestedUserId },
          select: { id: true, isActive: true },
        })
      : await prisma.user.findFirst({
          where: { isActive: true },
          select: { id: true, isActive: true },
        });

    if (!user?.id) {
      res.status(400).json({ success: false, error: 'No hay usuario activo.' });
      return;
    }
    if (!user.isActive) {
      res.status(400).json({ success: false, error: `userId=${user.id} inactivo.` });
      return;
    }

    const credentialEnvironmentRaw = String(req.body?.credentialEnvironment ?? '').toLowerCase();
    const credentialEnvironment =
      credentialEnvironmentRaw === 'production' || credentialEnvironmentRaw === 'sandbox'
        ? credentialEnvironmentRaw
        : undefined;

    const result = await runSmartwatchMlcConstrainedCycle({
      userId: user.id,
      dryRun: req.body?.dryRun === true,
      validateOnly: req.body?.validateOnly === true,
      credentialEnvironment,
    });

    const status = result.success ? 200 : result.stoppedAt === 'stage1' || result.stoppedAt === 'stage2' ? 422 : 500;
    res.status(status).json({
      success: result.success,
      ...result,
      handlerDurationMs: Date.now() - start,
    });
  } catch (e: any) {
    logger.error('[INTERNAL] smartwatch-mlc-constrained-cycle failed', { error: e?.message });
    res.status(500).json({
      success: false,
      error: e?.message || String(e),
      durationMs: Date.now() - start,
    });
  }
}
