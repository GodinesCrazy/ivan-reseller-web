/**
 * Onboarding routes ? JWT protected.
 * GET /api/onboarding/status
 * POST /api/onboarding/paypal
 * POST /api/onboarding/connect-marketplace
 * POST /api/onboarding/complete-step
 * POST /api/onboarding/finish
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { onboardingService } from '../../services/onboarding.service';
import type { MarketplaceType } from '../../services/onboarding.service';

const router = Router();
router.use(authenticate);

router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const status = await onboardingService.getStatus(userId);
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post('/paypal', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const email = req.body?.email ?? req.body?.paypalPayoutEmail ?? '';
    await onboardingService.setPaypal(userId, String(email));
    const status = await onboardingService.getStatus(userId);
    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/connect-marketplace', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const marketplace = (req.body?.marketplace || 'ebay') as MarketplaceType;
    if (!['ebay', 'amazon', 'mercadolibre'].includes(marketplace)) {
      return res.status(400).json({ error: 'Invalid marketplace' });
    }
    const credentialsId = req.body?.credentialsId != null ? Number(req.body.credentialsId) : undefined;
    await onboardingService.connectMarketplace(userId, marketplace, credentialsId);
    const status = await onboardingService.getStatus(userId);
    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/complete-step', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const step = Number(req.body?.step ?? 0);
    await onboardingService.completeStep(userId, step);
    const status = await onboardingService.getStatus(userId);
    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/finish', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await onboardingService.finishOnboarding(userId);
    const status = await onboardingService.getStatus(userId);
    res.json({ success: true, onboardingCompleted: status.onboardingCompleted, status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

export default router;
