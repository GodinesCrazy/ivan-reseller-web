/**
 * Comprueba si eBay OAuth es utilizable con la ruta real de credenciales.
 * Uso: cd backend && npx tsx scripts/check-ebay-oauth.ts
 */
async function main() {
  const { prisma } = await import('../src/config/database');
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');
  const { MarketplaceService } = await import('../src/services/marketplace.service');

  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', isActive: true },
    select: { userId: true, environment: true, scope: true, updatedAt: true },
    orderBy: [{ userId: 'asc' }, { environment: 'asc' }, { updatedAt: 'desc' }],
  });

  if (rows.length === 0) {
    console.log('eBay: NO autorizado (no hay credenciales ebay activas en api_credentials).');
    process.exit(1);
  }

  const marketplaceService = new MarketplaceService();
  let usable = false;

  for (const row of rows) {
    const integrity = await CredentialsManager.getCredentialIntegrityReport(
      row.userId,
      'ebay',
      row.environment,
      { scope: row.scope }
    );
    const credentialsResult = await marketplaceService.getCredentials(
      row.userId,
      'ebay',
      row.environment
    );

    const hasToken = !!String((credentialsResult && credentialsResult.credentials && credentialsResult.credentials.token) || '').trim();
    const hasRefreshToken = !!String((credentialsResult && credentialsResult.credentials && credentialsResult.credentials.refreshToken) || '').trim();
    const usableNow = !!(credentialsResult && credentialsResult.isActive) && (hasToken || hasRefreshToken);
    if (usableNow) usable = true;

    console.log(
      'eBay (userId=' + row.userId + ', env=' + row.environment + ', scope=' + row.scope + '): ' +
      'integrity=' + integrity.state + ' ' +
      'reason=' + integrity.reasonCode + ' ' +
      'token=' + (hasToken ? 'SI' : 'NO') + ' ' +
      'refresh=' + (hasRefreshToken ? 'SI' : 'NO') + ' ' +
      'usable=' + (usableNow ? 'SI' : 'NO')
    );
  }

  process.exit(usable ? 0 : 1);
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
