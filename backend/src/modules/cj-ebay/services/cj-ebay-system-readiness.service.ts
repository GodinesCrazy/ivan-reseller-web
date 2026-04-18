/**
 * FASE 3E.4 — Preparación operativa: DB, migraciones CJ-eBay, flags y credenciales **sin** llamar APIs CJ/eBay.
 */

import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import { CredentialsManager } from '../../../services/credentials-manager.service';
import { CJ_EBAY_API_CREDENTIAL_NAME } from '../cj-ebay.constants';

/** Nombres de carpeta Prisma esperados para la vertical (evita ambigüedad phase3e vs phase3e3). */
export const EXPECTED_CJ_EBAY_MIGRATION_NAMES = [
  '20260412180000_cj_ebay_phase3a',
  '20260413153000_cj_ebay_phase3c_pricing_settings',
  '20260414203000_cj_ebay_phase3d_listing_draft',
  '20260415120000_cj_ebay_phase3e_orders',
  '20260416120000_cj_ebay_phase3e3_checkout',
  '20260416240000_cj_ebay_phase3g_opportunity_discovery',
  '20260417100000_cj_ebay_phase3g1_market_reality',
] as const;

export type CjEbayReadinessCheck = {
  id: string;
  ok: boolean;
  detail: string;
  hint?: string;
};

function ebayEntryLooksUsable(creds: Record<string, unknown> | null | undefined): boolean {
  if (!creds) return false;
  const appId = String(creds.appId || creds.clientId || '').trim();
  const certId = String(creds.certId || creds.clientSecret || '').trim();
  const token = String(creds.token || creds.accessToken || creds.authToken || '').trim();
  const refresh = String(creds.refreshToken || '').trim();
  return Boolean(appId && certId && (token || refresh));
}

export const cjEbaySystemReadinessService = {
  async evaluateForUser(userId: number): Promise<{ ready: boolean; checks: CjEbayReadinessCheck[] }> {
    const checks: CjEbayReadinessCheck[] = [];

    const moduleEnabled = env.ENABLE_CJ_EBAY_MODULE === true;
    checks.push({
      id: 'env.enable_cj_ebay_module',
      ok: moduleEnabled,
      detail: moduleEnabled
        ? 'ENABLE_CJ_EBAY_MODULE is true'
        : 'ENABLE_CJ_EBAY_MODULE is false (routes return 404 CJ_EBAY_MODULE_DISABLED except system-readiness)',
      hint: moduleEnabled ? undefined : 'Set ENABLE_CJ_EBAY_MODULE=true in backend .env and restart',
    });

    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1 as n`;
      dbOk = true;
      checks.push({
        id: 'database.connection',
        ok: true,
        detail: 'Prisma connected; SELECT 1 succeeded',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({
        id: 'database.connection',
        ok: false,
        detail: `Database unreachable: ${msg.slice(0, 200)}`,
        hint: 'Verify DATABASE_URL and network; run prisma migrate deploy after DB is up',
      });
    }

    let ordersTableOk = false;
    if (dbOk) {
      try {
        const reg = await prisma.$queryRaw<[{ reg: string | null }]>`
          SELECT to_regclass('public.cj_ebay_orders')::text as reg
        `;
        ordersTableOk = Boolean(reg[0]?.reg);
        checks.push({
          id: 'schema.cj_ebay_orders',
          ok: ordersTableOk,
          detail: ordersTableOk
            ? 'Table public.cj_ebay_orders exists'
            : 'Table public.cj_ebay_orders missing — CJ-eBay migrations likely not applied',
          hint: ordersTableOk ? undefined : 'Run scripts/run-cj-ebay-migrations.ts (or cd backend && npx prisma migrate deploy)',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({
          id: 'schema.cj_ebay_orders',
          ok: false,
          detail: `Could not verify table: ${msg.slice(0, 200)}`,
        });
      }
    }

    let migrationsOk = false;
    if (dbOk) {
      try {
        const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
          SELECT migration_name FROM _prisma_migrations
          WHERE migration_name LIKE '%cj_ebay%'
        `;
        const names = new Set(applied.map((r) => r.migration_name));
        const missing = EXPECTED_CJ_EBAY_MIGRATION_NAMES.filter((m) => !names.has(m));
        migrationsOk = missing.length === 0;
        checks.push({
          id: 'migrations.cj_ebay_applied',
          ok: migrationsOk,
          detail: migrationsOk
            ? `All ${EXPECTED_CJ_EBAY_MIGRATION_NAMES.length} expected CJ-eBay migrations applied`
            : `Missing migration(s): ${missing.join(', ')}`,
          hint: migrationsOk
            ? undefined
            : 'Deploy migrations (non-destructive: prisma migrate deploy applies pending only)',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({
          id: 'migrations.cj_ebay_applied',
          ok: false,
          detail: `Could not read _prisma_migrations: ${msg.slice(0, 200)}`,
        });
      }
    }

    let cjCredOk = false;
    try {
      const cj = await CredentialsManager.getCredentials(userId, CJ_EBAY_API_CREDENTIAL_NAME, 'production');
      const apiKey = String(cj?.apiKey || '').trim();
      cjCredOk = apiKey.length > 0;
      checks.push({
        id: 'credentials.cj_dropshipping',
        ok: cjCredOk,
        detail: cjCredOk
          ? 'CJ apiKey present (DB user/global/env CJ_DROPSHIPPING_API_KEY) — value not shown'
          : 'No CJ apiKey for this user (cj-dropshipping production)',
        hint: cjCredOk
          ? undefined
          : 'Save ApiCredential apiName cj-dropshipping or set CJ_API_KEY (or CJ_DROPSHIPPING_API_KEY) in backend/.env',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({
        id: 'credentials.cj_dropshipping',
        ok: false,
        detail: `Credential read failed: ${msg.slice(0, 200)}`,
      });
    }

    let ebayCredOk = false;
    try {
      const prod = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
      const sand = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'sandbox');
      const entry = ebayEntryLooksUsable(prod?.credentials ?? null)
        ? prod
        : ebayEntryLooksUsable(sand?.credentials ?? null)
          ? sand
          : null;
      ebayCredOk = entry != null;
      checks.push({
        id: 'credentials.ebay_oauth',
        ok: ebayCredOk,
        detail: ebayCredOk
          ? `eBay OAuth shape OK (appId+certId+token|refreshToken); entry scope ${entry?.scope ?? 'unknown'} — secrets not shown`
          : 'No usable eBay credentials (production or sandbox) for order import / tracking submit',
        hint: ebayCredOk ? undefined : 'Connect eBay in API Settings (OAuth) for this user',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({
        id: 'credentials.ebay_oauth',
        ok: false,
        detail: `eBay credential read failed: ${msg.slice(0, 200)}`,
      });
    }

    checks.push({
      id: 'http.cj_api_policy',
      ok: true,
      detail:
        'Readiness does not call CJ or eBay HTTP (by design). Use manual 3E.4 corrida for live API proof.',
    });

    const criticalOk =
      moduleEnabled &&
      dbOk &&
      ordersTableOk &&
      migrationsOk &&
      cjCredOk &&
      ebayCredOk;

    return { ready: criticalOk, checks };
  },
};
