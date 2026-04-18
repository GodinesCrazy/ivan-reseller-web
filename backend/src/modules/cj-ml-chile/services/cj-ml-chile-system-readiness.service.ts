/**
 * CJ → ML Chile — System readiness checks (PARITY with CJ → eBay USA).
 *
 * Evaluates all prerequisites: module flag, DB, migrations, CJ credentials,
 * ML credentials, FX service. Does NOT call external APIs by design.
 */

import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import { CredentialsManager } from '../../../services/credentials-manager.service';
import fxService from '../../../services/fx.service';
import { CJ_ML_CHILE_API_CREDENTIAL_NAME } from '../cj-ml-chile.constants';

export type CjMlChileReadinessCheck = {
  id: string;
  ok: boolean;
  detail: string;
  hint?: string;
};

function mlCredLooksUsable(creds: Record<string, unknown> | null | undefined): boolean {
  if (!creds) return false;
  const token = String(creds.accessToken || creds.access_token || creds.token || '').trim();
  const refresh = String(creds.refreshToken || creds.refresh_token || '').trim();
  return Boolean(token || refresh);
}

export const cjMlChileSystemReadinessService = {
  async check(userId: number): Promise<{ ok: boolean; checks: CjMlChileReadinessCheck[] }> {
    const checks: CjMlChileReadinessCheck[] = [];

    // Module enabled
    const moduleEnabled = (env as any).ENABLE_CJ_ML_CHILE_MODULE === true;
    checks.push({
      id: 'env.enable_cj_ml_chile_module',
      ok: moduleEnabled,
      detail: moduleEnabled
        ? 'ENABLE_CJ_ML_CHILE_MODULE is true'
        : 'ENABLE_CJ_ML_CHILE_MODULE is false — module routes return 404',
      hint: moduleEnabled ? undefined : 'Set ENABLE_CJ_ML_CHILE_MODULE=true in backend .env and restart',
    });

    // Database connection
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

    // ML Chile tables
    let tablesOk = false;
    if (dbOk) {
      try {
        const reg = await prisma.$queryRaw<[{ reg: string | null }]>`
          SELECT to_regclass('public.cj_ml_chile_orders')::text as reg
        `;
        tablesOk = Boolean(reg[0]?.reg);
        checks.push({
          id: 'schema.cj_ml_chile_tables',
          ok: tablesOk,
          detail: tablesOk
            ? 'Table public.cj_ml_chile_orders exists'
            : 'Table public.cj_ml_chile_orders missing — ML Chile migrations likely not applied',
          hint: tablesOk ? undefined : 'Run prisma migrate deploy',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({
          id: 'schema.cj_ml_chile_tables',
          ok: false,
          detail: `Could not verify table: ${msg.slice(0, 200)}`,
        });
      }
    }

    // Account settings table
    if (dbOk) {
      try {
        await prisma.cjMlChileAccountSettings.count();
        checks.push({
          id: 'schema.cj_ml_chile_settings',
          ok: true,
          detail: 'cj_ml_chile_account_settings table accessible',
        });
      } catch (e) {
        checks.push({
          id: 'schema.cj_ml_chile_settings',
          ok: false,
          detail: `Settings table not accessible: ${e instanceof Error ? e.message : String(e)}`,
          hint: 'Run prisma migrate deploy to apply pending migrations',
        });
      }
    }

    // CJ credentials
    let cjCredOk = false;
    try {
      const cj = await CredentialsManager.getCredentials(userId, CJ_ML_CHILE_API_CREDENTIAL_NAME, 'production');
      const apiKey = String(cj?.apiKey || '').trim();
      cjCredOk = apiKey.length > 0;
      if (!cjCredOk && (env as any).CJ_API_KEY) cjCredOk = true;
      checks.push({
        id: 'credentials.cj_dropshipping',
        ok: cjCredOk,
        detail: cjCredOk
          ? 'CJ apiKey present (DB/env fallback) — value not shown'
          : 'No CJ apiKey found for this user',
        hint: cjCredOk
          ? undefined
          : 'Save ApiCredential apiName cj-dropshipping or set CJ_API_KEY in backend/.env',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({
        id: 'credentials.cj_dropshipping',
        ok: false,
        detail: `Credential read failed: ${msg.slice(0, 200)}`,
      });
    }

    // ML credentials
    let mlCredOk = false;
    try {
      const mlCred = await CredentialsManager.getCredentialEntry(userId, 'mercadolibre', 'production');
      const hasEnvToken = Boolean((env as any).MERCADOLIBRE_ACCESS_TOKEN);
      mlCredOk = mlCredLooksUsable(mlCred?.credentials ?? null) || hasEnvToken;
      checks.push({
        id: 'credentials.mercadolibre_oauth',
        ok: mlCredOk,
        detail: mlCredOk
          ? `ML OAuth credentials present (${mlCred ? 'DB' : 'env fallback'}) — secrets not shown`
          : 'No usable Mercado Libre credentials found',
        hint: mlCredOk ? undefined : 'Connect Mercado Libre in API Settings (OAuth) for this user',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push({
        id: 'credentials.mercadolibre_oauth',
        ok: false,
        detail: `ML credential read failed: ${msg.slice(0, 200)}`,
      });
    }

    // FX service
    let fxOk = false;
    try {
      const rate = fxService.convert(1, 'USD', 'CLP');
      fxOk = Number.isFinite(rate) && rate > 0;
      checks.push({
        id: 'fx_service.usd_clp',
        ok: fxOk,
        detail: fxOk ? `CLP/USD = ${rate.toFixed(0)} — FX service operational` : 'FX rate invalid or zero',
        hint: fxOk ? undefined : 'FX service may need a restart or external API may be down',
      });
    } catch (e) {
      checks.push({
        id: 'fx_service.usd_clp',
        ok: false,
        detail: `FX service error: ${e instanceof Error ? e.message : String(e)}`,
        hint: 'Check FX service configuration and external provider status',
      });
    }

    // HTTP policy note
    checks.push({
      id: 'http.api_policy',
      ok: true,
      detail:
        'Readiness does not call CJ or ML HTTP (by design). Use manual corrida for live API proof.',
    });

    const criticalOk =
      moduleEnabled &&
      dbOk &&
      tablesOk &&
      cjCredOk &&
      mlCredOk &&
      fxOk;

    return { ok: criticalOk, checks };
  },
};
