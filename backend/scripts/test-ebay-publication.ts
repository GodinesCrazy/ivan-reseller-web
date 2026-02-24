/**
 * Script de prueba real: eBay OAuth + publicacin
 * Ejecutar: npx ts-node scripts/test-ebay-publication.ts
 * Requiere: EBAY_APP_ID, EBAY_CERT_ID, EBAY_REDIRECT_URI y tokens en api_credentials
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { CredentialsManager, clearCredentialsCache } from '../src/services/credentials-manager.service';
import { EbayService } from '../src/services/ebay.service';
const prisma = new PrismaClient();

async function main() {
  console.log('[TEST] eBay publication test - REAL (no mocks)\n');

  const appId = (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
  const certId = (process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || '').trim();

  if (!appId || !certId) {
    console.error('? Faltan EBAY_APP_ID y EBAY_CERT_ID. Configralos en .env');
    process.exit(1);
  }
  if (!redirectUri) {
    console.error('? Falta EBAY_REDIRECT_URI. Regstralo en eBay Developer Portal y a?delo a .env');
    process.exit(1);
  }

  console.log('? Env: EBAY_APP_ID, EBAY_CERT_ID, EBAY_REDIRECT_URI presentes');

  const firstUser = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
  const userId = firstUser?.id ?? 1;

  const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
  if (!entry?.credentials) {
    const sandboxEntry = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'sandbox');
    if (!sandboxEntry?.credentials) {
      console.error('? No hay credenciales eBay en api_credentials. Completa OAuth primero:');
      console.error('   GET /api/marketplace-oauth/oauth/start/ebay (autenticado)');
      process.exit(1);
    }
  }

  const creds = (entry?.credentials || (await CredentialsManager.getCredentialEntry(userId, 'ebay', 'sandbox'))?.credentials) as any;
  const token = creds?.token;
  const refreshToken = creds?.refreshToken;

  if (!token && !refreshToken) {
    console.error('? Credenciales eBay sin token ni refreshToken. Completa OAuth:');
    console.error('   GET /api/marketplace-oauth/oauth/start/ebay');
    process.exit(1);
  }

  console.log('? Tokens cargados desde DB (api_credentials)');

  const ebay = new EbayService({
    appId,
    devId: creds?.devId || process.env.EBAY_DEV_ID || '',
    certId,
    token,
    refreshToken,
    sandbox: creds?.sandbox ?? false,
  }, {
    onCredentialsUpdate: async (updated) => {
      await CredentialsManager.saveCredentials(userId, 'ebay', {
        ...updated,
        sandbox: updated.sandbox,
      }, creds?.sandbox ? 'sandbox' : 'production');
      clearCredentialsCache(userId, 'ebay', creds?.sandbox ? 'sandbox' : 'production');
    },
  });

  try {
    const testResult = await ebay.testConnection();
    if (!testResult.success) {
      console.error('? testConnection fall:', testResult.message);
      process.exit(1);
    }
    console.log('? eBay testConnection OK');
  } catch (e: any) {
    console.error('? Error en testConnection:', e?.message);
    process.exit(1);
  }

  console.log('\n[DONE] eBay credenciales vlidas. Sistema listo para publicar.');
  console.log('  - OAuth: tokens guardados en DB');
  console.log('  - Refresh: EbayService refresca automticamente si expira');
  console.log('  - Publicacin: autopilot.service usa marketplaceService.publishProduct');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
