#!/usr/bin/env node
/**
 * POST /api/internal/smartwatch-mlc-constrained-cycle
 *
 * Env: INTERNAL_RUN_SECRET, BASE_URL, MLC_USER_ID (optional), MLC_CREDENTIAL_ENV (default production)
 * Args:
 *   --dry-run     → body.dryRun (solo Stage 1–2 + candidatos)
 *   --validate-only → body.validateOnly (pre-publish OK sin publicar)
 *
 * Sin flags: intenta publicar en MLC Chile (Stages 1–8).
 */

const BASE = (process.env.BASE_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(
  /\/+$/,
  ''
);
const SECRET = process.env.INTERNAL_RUN_SECRET || '';
if (!SECRET) {
  console.error('Set INTERNAL_RUN_SECRET');
  process.exit(1);
}

const userId = parseInt(process.env.MLC_USER_ID || process.env.USER_ID || '', 10);
const credEnv = String(process.env.MLC_CREDENTIAL_ENV || 'production').toLowerCase();

const body = {
  dryRun: process.argv.includes('--dry-run'),
  validateOnly: process.argv.includes('--validate-only'),
  ...(Number.isFinite(userId) && userId > 0 ? { userId } : {}),
  ...(credEnv === 'production' || credEnv === 'sandbox' ? { credentialEnvironment: credEnv } : {}),
};

async function main() {
  const url = `${BASE}/api/internal/smartwatch-mlc-constrained-cycle`;
  console.log('POST', url, JSON.stringify(body));
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log('HTTP', r.status);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text.slice(0, 12000));
  }
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
