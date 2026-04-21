#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const { prisma } = await import('../src/config/database');
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');

  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay' },
    select: {
      id: true,
      userId: true,
      environment: true,
      scope: true,
      isActive: true,
      updatedAt: true,
    },
    orderBy: [{ userId: 'asc' }, { environment: 'asc' }, { updatedAt: 'desc' }],
  });

  const diagnostics = [];
  for (const row of rows) {
    const integrity = await CredentialsManager.getCredentialIntegrityReport(
      row.userId,
      'ebay',
      row.environment as 'sandbox' | 'production',
      { scope: row.scope as 'user' | 'global' }
    );
    diagnostics.push({
      id: row.id,
      userId: row.userId,
      environment: row.environment,
      scope: row.scope,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
      integrityState: integrity.state,
      reasonCode: integrity.reasonCode,
      source: integrity.source,
      hasEncryptedPayload: integrity.hasEncryptedPayload,
      hasBasicCredentials: integrity.hasBasicCredentials,
      hasAccessToken: integrity.hasAccessToken,
      hasRefreshToken: integrity.hasRefreshToken,
      tokenExpired: integrity.tokenExpired,
    });
  }

  console.log(JSON.stringify({ diagnostics }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error?.message || error);
  process.exit(1);
});
