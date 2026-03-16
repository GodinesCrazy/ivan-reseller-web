/**
 * Injects BACKEND_URL or VITE_API_URL into frontend/vercel.json at build time
 * so the /api rewrite points to the correct Railway URL.
 * Run before build on Vercel (e.g. "node scripts/inject-vercel-backend.mjs && vite build").
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vercelPath = join(__dirname, '..', 'vercel.json');

const backendUrl = (process.env.BACKEND_URL || process.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const defaultUrl = 'https://ivan-reseller-backend-production.up.railway.app';

const targetUrl = backendUrl || defaultUrl;

try {
  const data = JSON.parse(readFileSync(vercelPath, 'utf8'));
  if (Array.isArray(data.rewrites) && data.rewrites.length > 0) {
    const apiRewrite = data.rewrites.find((r) => r.source && r.source.startsWith('/api'));
    if (apiRewrite && apiRewrite.destination) {
      apiRewrite.destination = `${targetUrl}/api/:path*`;
      writeFileSync(vercelPath, JSON.stringify(data, null, 2) + '\n');
      console.log('[inject-vercel-backend] Rewrite destination set to', apiRewrite.destination);
    }
  }
} catch (e) {
  console.warn('[inject-vercel-backend]', e.message);
}
