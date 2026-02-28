import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
import { prisma } from '../src/config/database';
import { decrypt } from '../src/utils/encryption';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main(): Promise<void> {
  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', isActive: true },
    select: {
      id: true,
      userId: true,
      environment: true,
      scope: true,
      credentials: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  for (const row of rows) {
    let parseOk = false;
    let hasToken = false;
    let hasRefreshToken = false;
    let sandbox: string | boolean = 'unknown';
    let appId = false;
    let certId = false;

    try {
      const payload = row.credentials.includes(':') ? decrypt(row.credentials) : row.credentials;
      const parsed = JSON.parse(payload);
      parseOk = true;
      hasToken = !!String(parsed?.token || '').trim();
      hasRefreshToken = !!String(parsed?.refreshToken || '').trim();
      sandbox = parsed?.sandbox;
      appId = !!String(parsed?.appId || '').trim();
      certId = !!String(parsed?.certId || '').trim();
    } catch {
      // ignore parse errors
    }

    console.log(
      JSON.stringify({
        id: row.id,
        userId: row.userId,
        environment: row.environment,
        scope: row.scope,
        parseOk,
        appId,
        certId,
        hasToken,
        hasRefreshToken,
        sandbox,
        updatedAt: row.updatedAt,
      })
    );
  }
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

