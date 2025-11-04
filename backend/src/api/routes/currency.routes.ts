import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import fxService from '../../services/fx.service';

const router = Router();

router.use(authenticate);

router.get('/rates', (_req, res) => {
  return res.json({ success: true, ...fxService.getRates() });
});

router.post('/rates', authorize('ADMIN'), (req, res) => {
  try {
    const rates = req.body?.rates || {};
    fxService.setRates(rates);
    return res.json({ success: true, ...fxService.getRates() });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e.message || 'Invalid rates' });
  }
});

router.post('/convert', (req, res) => {
  const { amount, from, to } = req.body || {};
  if (typeof amount !== 'number' || !from || !to) {
    return res.status(400).json({ success: false, error: 'amount, from, to required' });
  }
  const result = fxService.convert(amount, from, to);
  return res.json({ success: true, amount, from, to, result });
});

export default router;

