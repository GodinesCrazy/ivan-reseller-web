import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

function bridgeBase() {
  return (process.env.SCRAPER_BRIDGE_URL || 'http://127.0.0.1:8077').replace(/\/$/, '');
}

// Forward captcha-related calls to the Python microservice
router.all('/*', async (req: Request, res: Response) => {
  try {
    const url = `${bridgeBase()}/api/captcha${req.path}`;
    const { method, headers, body, query } = req;
    const cfg = { headers: { ...headers }, params: query as any } as any;
    const axiosMethod = method.toLowerCase();
    const resp = await (axios as any)[axiosMethod](url, body, cfg);
    res.status(resp.status).json(resp.data);
  } catch (e: any) {
    res.status(e?.response?.status || 500).json({ success: false, error: e?.message || 'Captcha bridge error' });
  }
});

export default router;

