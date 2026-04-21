/**
 * Mercado Libre webhook readiness diagnostic.
 * - Reads public /api/webhooks/status from target backend
 * - Reads DB evidence (webhook ledger + proof row)
 * - Optional synthetic signed probe (for controlled diagnostics only)
 *
 * Usage:
 *   npx tsx scripts/check-ml-webhook-readiness.ts
 *   npx tsx scripts/check-ml-webhook-readiness.ts --base-url=https://... --send-probe
 */
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

import { prisma } from '../src/config/database';

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const token = raw.slice(2);
    const eq = token.indexOf('=');
    if (eq === -1) out[token] = true;
    else out[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return out;
}

async function readWebhookStatus(baseUrl: string): Promise<any> {
  try {
    const res = await fetch(`${baseUrl}/api/webhooks/status`, { method: 'GET' });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, ok: res.ok, body };
  } catch (error: any) {
    return {
      status: null,
      ok: false,
      body: null,
      error: error?.message || String(error),
    };
  }
}

async function runOptionalProbe(baseUrl: string): Promise<Record<string, unknown> | null> {
  const secret = String(process.env.WEBHOOK_SECRET_MERCADOLIBRE || '').trim();
  if (!secret) {
    return {
      skipped: true,
      reason: 'WEBHOOK_SECRET_MERCADOLIBRE_not_set_locally',
    };
  }

  const payload = {
    _id: `probe-${Date.now()}`,
    topic: 'orders_v2',
    resource: '/orders/probe',
    user_id: 1,
    data: { id: `probe-${Date.now()}` },
    source: 'webhook-readiness-probe',
  };
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const res = await fetch(`${baseUrl}/api/webhooks/mercadolibre`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': `sha256=${signature},user_id=1`,
    },
    body,
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return {
    skipped: false,
    requestPayload: payload,
    responseStatus: res.status,
    responseBody: parsed,
  };
}

async function readDbEvidence() {
  const counts = await prisma.$queryRawUnsafe<Array<{ status: string; count: number }>>(`
    SELECT status, COUNT(*)::int AS count
    FROM "mercado_libre_webhook_events"
    GROUP BY status
    ORDER BY status
  `);

  const latest = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT id, status, topic, resource, "createdAt", "processedAt", "errorMessage"
    FROM "mercado_libre_webhook_events"
    ORDER BY "createdAt" DESC
    LIMIT 10
  `);

  const proof = await prisma.systemConfig.findUnique({
    where: { key: 'webhook_event_proof:mercadolibre' },
    select: { key: true, value: true, updatedAt: true },
  });

  let parsedProof: Record<string, unknown> | null = null;
  if (proof?.value) {
    try {
      parsedProof = JSON.parse(String(proof.value));
    } catch {
      parsedProof = { parseError: 'invalid_json' };
    }
  }

  return {
    ledgerCounts: counts,
    latestEvents: latest,
    proof: proof
      ? {
          key: proof.key,
          updatedAt: proof.updatedAt,
          parsed: parsedProof,
        }
      : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl =
    String(args['base-url'] || process.env.BACKEND_URL || process.env.API_URL || '')
      .trim()
      .replace(/\/+$/, '') || 'https://ivan-reseller-backend-production.up.railway.app';
  const sendProbe = args['send-probe'] === true;

  const before = await readWebhookStatus(baseUrl);
  const probe = sendProbe ? await runOptionalProbe(baseUrl) : null;
  const after = await readWebhookStatus(baseUrl);
  const db = await readDbEvidence();

  const ml = (after.body && typeof after.body === 'object' ? after.body.mercadolibre : null) as
    | Record<string, unknown>
    | null;
  const summary = {
    configured: ml?.configured === true,
    eventFlowReady: ml?.eventFlowReady === true,
    inboundEventSeen: ml?.inboundEventSeen === true,
    proofLevel: ml?.proofLevel || null,
  };

  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        baseUrl,
        sendProbe,
        beforeStatus: before,
        probe,
        afterStatus: after,
        summary,
        db,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
