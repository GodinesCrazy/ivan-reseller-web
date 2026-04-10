/**
 * Vercel Serverless Function — ML Bridge health check
 * Path: GET /api/health
 *
 * Used by the backend's ScraperBridgeService to verify the bridge is reachable.
 * This runs on Vercel IPs (not Railway) so MercadoLibre does NOT block it.
 */

export const config = {
  maxDuration: 10,
};

declare const process: {
  env: Record<string, string | undefined>;
};

export default function handler(req: any, res: any): void {
  res.status(200).json({
    status: 'ok',
    service: 'ml-bridge',
    ts: Date.now(),
    region: process.env.VERCEL_REGION || 'unknown',
  });
}
