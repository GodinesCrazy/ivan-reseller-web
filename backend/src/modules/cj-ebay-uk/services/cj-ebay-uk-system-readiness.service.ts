/**
 * CJ → eBay UK — system readiness checks.
 * Mirrors cj-ebay-system-readiness.service.ts; checks UK-specific migrations.
 */

import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import { CredentialsManager } from '../../../services/credentials-manager.service';
import { CJ_EBAY_UK_API_CREDENTIAL_NAME } from '../cj-ebay-uk.constants';

export const EXPECTED_CJ_EBAY_UK_MIGRATION_NAMES = [
  '20260418100000_cj_ebay_uk_phase1',
] as const;

export type CjEbayUkReadinessCheck = {
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

export const cjEbayUkSystemReadinessService = {
  async evaluateForUser(userId: number): Promise<{ ready: boolean; checks: CjEbayUkReadinessCheck[] }> {
    const checks: CjEbayUkReadinessCheck[] = [];

    const moduleEnabled = env.ENABLE_CJ_EBAY_UK_MODULE === true;
    checks.push({
      id: 'env.enable_cj_ebay_uk_module',
      ok: moduleEnabled,
      detail: moduleEnabled
        ? 'ENABLE_CJ_EBAY_UK_MODULE is true'
        : 'ENABLE_CJ_EBAY_UK_MODULE is false (routes return 404 CJ_EBAY_UK_MODULE_DISABLED)',
      hint: moduleEnabled ? undefined : 'Set ENABLE_CJ_EBAY_UK_MODULE=true in backend .env and restart',
    });

    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1 as n`;
      dbOk = true;
      checks.push({ id: 'database.connection', ok: true, detail: 'Prisma connected; SELECT 1 succeeded' });
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
          SELECT to_regclass('public.cj_ebay_uk_orders')::text as reg
        `;
        ordersTableOk = Boolean(reg[0]?.reg);
        checks.push({
          id: 'schema.cj_ebay_uk_orders',
          ok: ordersTableOk,
          detail: ordersTableOk
            ? 'Table public.cj_ebay_uk_orders exists'
            : 'Table public.cj_ebay_uk_orders missing — CJ-eBay UK migrations likely not applied',
          hint: ordersTableOk ? undefined : 'Run: cd backend && npx prisma migrate deploy',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({ id: 'schema.cj_ebay_uk_orders', ok: false, detail: `Could not verify table: ${msg.slice(0, 200)}` });
      }
    }

    let migrationsOk = false;
    if (dbOk) {
      try {
        const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
          SELECT migration_name FROM _prisma_migrations
          WHERE migration_name LIKE '%cj_ebay_uk%'
        `;
        const names = new Set(applied.map((r) => r.migration_name));
        const missing = EXPECTED_CJ_EBAY_UK_MIGRATION_NAMES.filter((m) => !names.has(m));
        migrationsOk = missing.length === 0;
        checks.push({
          id: 'migrations.cj_ebay_uk_applied',
          ok: migrationsOk,
          detail: migrationsOk
            ? `All ${EXPECTED_CJ_EBAY_UK_MIGRATION_NAMES.length} expected CJ-eBay UK migrations applied`
            : `Missing migration(s): ${missing.join(', ')}`,
          hint: migrationsOk ? undefined : 'Deploy migrations: cd backend && npx prisma migrate deploy',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({ id: 'migrations.cj_ebay_uk_applied', ok: false, detail: `Could not read _prisma_migrations: ${msg.slice(0, 200)}` });
      }
    }

    let cjCredOk = false;
    try {
      const cj = await CredentialsManager.getCredentials(userId, CJ_EBAY_UK_API_CREDENTIAL_NAME, 'production');
      const apiKey = String(cj?.apiKey || '').trim();
      cjCredOk = apiKey.length > 0;
      checks.push({
        id: 'credentials.cj_dropshipping',
        ok: cjCredOk,
        detail: cjCredOk
          ? 'CJ apiKey present — shared with USA vertical (same CJ account)'
          : 'No CJ apiKey found (cj-dropshipping production)',
        hint: cjCredOk ? undefined : 'Save ApiCredential apiName cj-dropshipping or set CJ_API_KEY in backend/.env',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({ id: 'credentials.cj_dropshipping', ok: false, detail: `Credential read failed: ${msg.slice(0, 200)}` });
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
          ? `eBay OAuth credentials found — note: ensure these are for an eBay UK (ebay.co.uk) seller account`
          : 'No usable eBay credentials found',
        hint: ebayCredOk
          ? undefined
          : 'Connect eBay UK seller account in API Settings (OAuth) — ensure siteId=3 / EBAY_GB scope',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({ id: 'credentials.ebay_oauth', ok: false, detail: `eBay credential read failed: ${msg.slice(0, 200)}` });
    }

    checks.push({
      id: 'uk.vat_note',
      ok: true,
      detail:
        'UK VAT: eBay UK acts as marketplace facilitator for B2C orders ≤ £135 (effective Jan 2021). ' +
        'VAT (20%) is deducted from seller payout automatically. No UK VAT registration required for orders in this range. ' +
        'HEURISTIC: Verify with a UK tax advisor for orders >£135.',
    });

    const criticalOk = moduleEnabled && dbOk && ordersTableOk && migrationsOk && cjCredOk && ebayCredOk;
    return { ready: criticalOk, checks };
  },
};
