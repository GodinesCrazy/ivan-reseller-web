/**
 * Sales Agent controller — dashboard, actions, scheduler
 * Extracted from cj-shopify-usa.routes.ts for maintainability.
 */
import { Router, Request, Response, NextFunction } from 'express';
import {
  cjShopifyUsaSalesAgentService,
  type SalesAgentActionType,
} from '../services/cj-shopify-usa-sales-agent.service';

const router = Router();

router.get('/sales-agent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.dashboard(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/sales-agent/actions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const actionType = String(req.body?.actionType || '').trim() as SalesAgentActionType;
    const result = await cjShopifyUsaSalesAgentService.executeAction(userId, {
      actionType,
      limit: Number(req.body?.limit ?? 5),
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Catalog mutation lock is busy')) {
      res.status(200).json({
        ok: false,
        executed: false,
        actionType: String(req.body?.actionType || '').trim(),
        blockedByLock: true,
        message: 'El agente o la automatización ya está modificando el catálogo. Espera a que termine el ciclo activo y vuelve a ejecutar.',
      });
      return;
    }
    next(error);
  }
});

router.get('/sales-agent/scheduler', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.getSchedulerStatus(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.patch('/sales-agent/scheduler/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.updateSchedulerConfig(userId, req.body ?? {});
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/sales-agent/scheduler/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.startScheduler(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/sales-agent/scheduler/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.pauseScheduler(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/sales-agent/scheduler/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.stopScheduler(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/sales-agent/scheduler/run-now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSalesAgentService.runSalesCycle(userId);
    res.json({ ok: true, cycle: result });
  } catch (error) {
    next(error);
  }
});

export default router;
