import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Protect SSE with auth as well
router.use(authenticate);

// Forward SSE logs from Python scraper bridge
router.get('/stream', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const baseURL = process.env.SCRAPER_BRIDGE_URL || 'http://127.0.0.1:8077';
  const sourceUrl = `${baseURL.replace(/\/$/, '')}/api/logs`;

  let cancelled = false;
  const heartbeat = setInterval(() => {
    if (!cancelled) res.write(`: ping\n\n`);
  }, 15000);

  try {
    const response = await axios.get(sourceUrl, {
      responseType: 'stream',
      timeout: 0,
      headers: { Accept: 'text/event-stream' },
    });

    response.data.on('data', (chunk: Buffer) => {
      if (!cancelled) {
        res.write(chunk);
      }
    });
    response.data.on('end', () => {
      if (!cancelled) res.end();
    });
    response.data.on('error', () => {
      if (!cancelled) res.end();
    });
  } catch (_e) {
    // Fallback minimal message
    res.write(`data: ${JSON.stringify({ level: 'warn', message: 'No log source available' })}\n\n`);
  }

  res.on('close', () => {
    cancelled = true;
    clearInterval(heartbeat);
  });
});

export default router;
