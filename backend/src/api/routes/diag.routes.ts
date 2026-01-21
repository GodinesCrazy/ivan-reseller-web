/**
 * ? FIX STABILITY: Endpoint de diagnóstico /api/diag/ping
 * Responde 200 siempre para detectar si el backend está vivo
 */

import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/diag/ping - Health check simple que siempre responde 200
router.get('/ping', async (req: Request, res: Response) => {
  const memory = process.memoryUsage();
  const uptime = process.uptime();

  res.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
    mem: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024),
      unit: 'MB',
    },
    uptime: Math.round(uptime),
    uptimeFormatted: `${Math.round(uptime / 60)}m ${Math.round(uptime % 60)}s`,
  });
});

export default router;
