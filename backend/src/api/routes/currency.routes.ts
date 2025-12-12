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
    const base = typeof req.body?.base === 'string' ? req.body.base : undefined;
    fxService.setRates(rates, { base, replace: req.body?.replace !== false });
    return res.json({ success: true, ...fxService.getRates() });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e.message || 'Invalid rates' });
  }
});

router.post('/rates/refresh', authorize('ADMIN'), async (_req, res) => {
  try {
    await fxService.refreshRates();
    return res.json({ success: true, ...fxService.getRates() });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Unable to refresh rates' });
  }
});

router.post('/convert', (req, res) => {
  const { amount, from, to } = req.body || {};
  if (typeof amount !== 'number' || !from || !to) {
    return res.status(400).json({ success: false, error: 'amount, from, to required' });
  }
  try {
    const result = fxService.convert(amount, from, to);
    return res.json({ success: true, amount, from, to, result });
  } catch (error: any) {
    const rates = fxService.getRates();
    return res.status(400).json({ 
      success: false, 
      error: error?.message || 'Conversion failed',
      details: {
        from,
        to,
        amount,
        availableRates: Object.keys(rates.rates).slice(0, 20),
        baseCurrency: rates.base
      }
    });
  }
});

export default router;

