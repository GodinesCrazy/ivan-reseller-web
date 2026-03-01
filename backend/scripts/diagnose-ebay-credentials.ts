#!/usr/bin/env tsx
/**
 * Diagnóstico de credenciales eBay para publicar
 * Verifica: DB, environment, tokens, workflow config
 *
 * Uso: cd backend && npm run diagnose:ebay
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  console.log('=== Diagnóstico credenciales eBay ===\n');

  const { prisma } = await import('../src/config/database');
  const { decrypt } = await import('../src/utils/encryption');
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');
  const { resolveEnvironment } = await import('../src/utils/environment-resolver');
  const { workflowConfigService } = await import('../src/services/workflow-config.service');

  const userId = 1; // admin por defecto

  // 1. Credenciales eBay en DB
  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', isActive: true },
    select: { id: true, userId: true, environment: true, scope: true, updatedAt: true, credentials: true },
  });

  console.log('[1] Registros api_credentials (ebay, isActive=true):');
  if (rows.length === 0) {
    console.log('    ? No hay registros. OAuth no completado o credenciales desactivadas.\n');
  } else {
    for (const r of rows) {
      let hasToken = false;
      let hasRefresh = false;
      let tokenPreview = '';
      try {
        const dec = decrypt(r.credentials);
        const parsed = JSON.parse(dec) as Record<string, any>;
        hasToken = !!(parsed.token || parsed.authToken || parsed.accessToken) &&
          String(parsed.token || parsed.authToken || parsed.accessToken).trim().length > 0;
        hasRefresh = !!(parsed.refreshToken) && String(parsed.refreshToken).trim().length > 0;
        const t = parsed.token || parsed.authToken || parsed.accessToken || '';
        tokenPreview = t ? `${String(t).slice(0, 8)}...` : '(vacío)';
      } catch (e) {
        tokenPreview = '(error decrypt)';
      }
      console.log(`    - userId=${r.userId} env=${r.environment} scope=${r.scope} updated=${r.updatedAt?.toISOString()}`);
      console.log(`      token: ${hasToken ? 'SÍ' : 'NO'} | refreshToken: ${hasRefresh ? 'SÍ' : 'NO'} | preview: ${tokenPreview}`);
    }
    console.log('');
  }

  // 2. getCredentialEntry para production y sandbox
  console.log('[2] CredentialsManager.getCredentialEntry:');
  for (const env of ['production', 'sandbox'] as const) {
    const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', env);
    const creds = entry?.credentials as Record<string, any> | undefined;
    const hasT = creds && (creds.token || creds.authToken || creds.accessToken) && String(creds.token || creds.authToken || creds.accessToken).trim().length > 0;
    const hasR = creds && creds.refreshToken && String(creds.refreshToken).trim().length > 0;
    console.log(`    ${env}: ${entry ? 'SÍ' : 'NO'} | token: ${hasT ? 'SÍ' : 'NO'} | refresh: ${hasR ? 'SÍ' : 'NO'}`);
  }
  console.log('');

  // 3. resolveEnvironment (mismo flujo que publishProduct)
  const tempProd = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
  const tempSand = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'sandbox');
  const fromCredentials = tempProd ? 'production' : (tempSand ? 'sandbox' : undefined);
  let workflowEnv = 'N/A';
  try {
    const wc = await workflowConfigService.getUserConfig(userId);
    workflowEnv = wc.environment || 'N/A';
  } catch (_) {}
  const resolved = await resolveEnvironment({
    explicit: undefined,
    fromCredentials: fromCredentials as 'sandbox' | 'production' | undefined,
    userId,
    default: 'production',
  });
  console.log('[3] Resolución de environment:');
  console.log(`    fromCredentials: ${fromCredentials ?? 'ninguno'}`);
  console.log(`    workflowConfig.environment: ${workflowEnv}`);
  console.log(`    resolved (usado para publicar): ${resolved}`);
  console.log('');

  // 4. MarketplaceService.getCredentials (flujo real)
  const { default: MarketplaceService } = await import('../src/services/marketplace.service');
  const svc = new MarketplaceService();
  const creds = await svc.getCredentials(userId, 'ebay', undefined);
  console.log('[4] MarketplaceService.getCredentials(userId=1, ebay, env=undefined):');
  if (!creds) {
    console.log('    ? null - no se encontraron credenciales');
  } else {
    const c = creds.credentials as Record<string, any>;
    const hasT = c && (c.token || c.authToken || c.accessToken) && String(c.token || c.authToken || c.accessToken).trim().length > 0;
    const hasR = c && c.refreshToken && String(c.refreshToken).trim().length > 0;
    console.log(`    env: ${creds.environment} | token: ${hasT ? 'SÍ' : 'NO'} | refresh: ${hasR ? 'SÍ' : 'NO'}`);
    if (creds.issues?.length) console.log(`    issues: ${creds.issues.join('; ')}`);
    if (creds.warnings?.length) console.log(`    warnings: ${creds.warnings.join('; ')}`);
  }
  console.log('');

  // 5. Env fallback (Railway)
  const envToken = (process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_TOKEN || '').trim();
  const envRefresh = (process.env.EBAY_REFRESH_TOKEN || '').trim();
  const envAppId = (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
  console.log('[5] Variables de entorno (fallback):');
  console.log(`    EBAY_APP_ID: ${envAppId ? 'SÍ' : 'NO'}`);
  console.log(`    EBAY_OAUTH_TOKEN/EBAY_TOKEN: ${envToken ? 'SÍ' : 'NO'}`);
  console.log(`    EBAY_REFRESH_TOKEN: ${envRefresh ? 'SÍ' : 'NO'}`);
  console.log('');

  // Conclusión
  const canPublish = creds && creds.credentials && (
    ((creds.credentials as any).token && String((creds.credentials as any).token).trim()) ||
    ((creds.credentials as any).refreshToken && String((creds.credentials as any).refreshToken).trim())
  );
  console.log('=== CONCLUSIÓN ===');
  console.log(canPublish ? '? Publicación debería funcionar con estas credenciales.' : '? Publicación fallará: falta token o refreshToken.');
  if (!canPublish && rows.length > 0) {
    console.log('\nPosibles causas:');
    console.log('- Environment mismatch: credenciales en DB para un env, publish usa otro');
    console.log('- Token expirado y refresh falló (reautoriza OAuth)');
    console.log('- Desencriptación fallida (ENCRYPTION_KEY distinta entre local y Railway)');
    const isRailway = /railway|rlwy\.net/i.test(process.env.DATABASE_URL || '');
    if (isRailway) {
      console.log('\nSOLUCIÓN (DB en Railway): Ejecuta el test contra el backend:');
      console.log('  API_URL=https://tu-backend.railway.app INTERNAL_RUN_SECRET=<de Railway> npm run test:search-to-publish');
      console.log('  O copia ENCRYPTION_KEY de Railway Variables a .env.local');
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
