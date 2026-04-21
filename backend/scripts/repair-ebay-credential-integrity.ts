#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

function getArg(flag: string): string | undefined {
  const prefixed = `${flag}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefixed));
  return value ? value.slice(prefixed.length) : undefined;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const userId = Number(getArg('--userId') || '1');
  const environment = (getArg('--environment') || 'production') as 'sandbox' | 'production';

  const { prisma } = await import('../src/config/database');
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');

  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', userId, environment },
    select: {
      id: true,
      userId: true,
      environment: true,
      scope: true,
      isActive: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const report = [];
  for (const row of rows) {
    const integrity = await CredentialsManager.getCredentialIntegrityReport(
      row.userId,
      'ebay',
      row.environment as 'sandbox' | 'production',
      { scope: row.scope as 'user' | 'global' }
    );
    report.push({
      id: row.id,
      userId: row.userId,
      environment: row.environment,
      scope: row.scope,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
      integrityState: integrity.state,
      reasonCode: integrity.reasonCode,
      hasBasicCredentials: integrity.hasBasicCredentials,
      hasAccessToken: integrity.hasAccessToken,
      hasRefreshToken: integrity.hasRefreshToken,
    });
  }

  const invalidIds = report
    .filter((row) => row.integrityState === 'undecryptable' || row.integrityState === 'parse_failed')
    .map((row) => row.id);

  if (execute && invalidIds.length > 0) {
    await prisma.apiCredential.updateMany({
      where: { id: { in: invalidIds } },
      data: { isActive: false },
    });
  }

  console.log(
    JSON.stringify(
      {
        execute,
        userId,
        environment,
        invalidIds,
        deactivatedCount: execute ? invalidIds.length : 0,
        report,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error?.message || error);
  process.exit(1);
});
