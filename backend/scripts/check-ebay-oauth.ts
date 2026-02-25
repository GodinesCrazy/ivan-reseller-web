/**
 * Comprueba si eBay OAuth estù autorizado (accessToken en api_credentials).
 * Uso: cd backend && npx tsx scripts/check-ebay-oauth.ts
 */
async function main() {
  const { prisma } = await import('../src/config/database');
  const { decrypt } = await import('../src/utils/encryption');

  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', isActive: true },
    select: { userId: true, environment: true, credentials: true, updatedAt: true },
  });

  if (rows.length === 0) {
    console.log('eBay: NO autorizado (no hay credenciales ebay activas en api_credentials).');
    process.exit(1);
  }

  for (const row of rows) {
    let parsed: Record<string, any> = {};
    const raw = row.credentials;
    try {
      const decrypted = raw.includes(':') && /^[0-9a-f]+:/i.test(raw) ? decrypt(raw) : raw;
      parsed = JSON.parse(decrypted) || {};
    } catch {
      console.log(`eBay (userId=${row.userId}, env=${row.environment}): error al descifrar/parsear.`);
      continue;
    }
    const accessToken = parsed.accessToken && String(parsed.accessToken).trim();
    const refreshToken = parsed.refreshToken != null ? String(parsed.refreshToken).trim() : '';
    const expAt = parsed.accessTokenExpiresAt ? new Date(parsed.accessTokenExpiresAt).getTime() : 0;
    const notExpired = !expAt || expAt > Date.now();

    if (accessToken && notExpired) {
      console.log(`eBay (userId=${row.userId}, env=${row.environment}): Sù autorizado (accessToken presente, no expirado).`);
      process.exit(0);
    }
    console.log(`eBay (userId=${row.userId}, env=${row.environment}): NO autorizado (${!accessToken ? 'falta accessToken' : 'token expirado'}).`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
