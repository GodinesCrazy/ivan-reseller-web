import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import fxService from '../../../services/fx.service';

export const cjMlChileSystemReadinessService = {
  async check(userId: number) {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    // CJ credentials
    try {
      const cjCred = await prisma.apiCredential.findFirst({ where: { userId, apiName: 'cj-dropshipping' } });
      checks.cjCredentials = { ok: Boolean(cjCred), detail: cjCred ? 'Configured in DB' : (env.CJ_API_KEY ? 'Env fallback' : 'Missing') };
      if (!cjCred && env.CJ_API_KEY) checks.cjCredentials.ok = true;
    } catch (e) { checks.cjCredentials = { ok: false, detail: String(e) }; }

    // ML credentials
    try {
      const mlCred = await prisma.apiCredential.findFirst({ where: { userId, apiName: 'mercadolibre' } });
      const hasEnvToken = Boolean(env.MERCADOLIBRE_ACCESS_TOKEN);
      checks.mlCredentials = { ok: Boolean(mlCred) || hasEnvToken, detail: mlCred ? 'OAuth token in DB' : (hasEnvToken ? 'Env fallback token' : 'Not connected') };
    } catch (e) { checks.mlCredentials = { ok: false, detail: String(e) }; }

    // FX service
    try {
      const rate = fxService.convert(1, 'USD', 'CLP');
      checks.fxService = { ok: Number.isFinite(rate) && rate > 0, detail: `CLP/USD = ${rate}` };
    } catch (e) { checks.fxService = { ok: false, detail: String(e) }; }

    // DB migration
    try {
      await prisma.cjMlChileAccountSettings.count();
      checks.dbMigrated = { ok: true, detail: 'cj_ml_chile_* tables present' };
    } catch (e) { checks.dbMigrated = { ok: false, detail: `Migration pending: ${e instanceof Error ? e.message : String(e)}` }; }

    // Module flag
    checks.moduleEnabled = { ok: env.ENABLE_CJ_ML_CHILE_MODULE, detail: env.ENABLE_CJ_ML_CHILE_MODULE ? 'ENABLE_CJ_ML_CHILE_MODULE=true' : 'Set ENABLE_CJ_ML_CHILE_MODULE=true' };

    const allOk = Object.values(checks).every((c) => c.ok);
    return { ok: allOk, checks };
  },
};
