#!/usr/bin/env tsx
import 'dotenv/config';
import logger from '../src/config/logger';
import { prisma } from '../src/config/database';
import { CredentialsManager } from '../src/services/credentials-manager.service';

async function main(): Promise<void> {
  const appKey = String(process.env.ALIEXPRESS_AFFILIATE_APP_KEY || '').trim();
  const appSecret = String(process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || '').trim();
  const nodeEnv = String(process.env.NODE_ENV || 'development').trim();
  const userId = Number(process.env.AFFILIATE_REPAIR_USER_ID || '1');
  const provider = 'aliexpress-affiliate';
  const environment: 'production' = 'production';

  if (!appKey || !appSecret) {
    throw new Error('Missing required env vars: ALIEXPRESS_AFFILIATE_APP_KEY and/or ALIEXPRESS_AFFILIATE_APP_SECRET');
  }

  if (nodeEnv !== 'production') {
    logger.warn('[affiliate-repair] Running outside production environment', { nodeEnv });
  }

  const existingEntry = await prisma.apiCredential.findFirst({
    where: {
      userId,
      apiName: provider,
      environment,
      scope: 'user',
    },
    select: { id: true },
  });

  const currentCredentials = await CredentialsManager.getCredentials(userId, provider, environment);
  const nextCredentials = {
    ...(currentCredentials || {}),
    appKey,
    appSecret,
    sandbox: false,
    updatedAt: new Date().toISOString(),
  };

  await CredentialsManager.saveCredentials(userId, provider, nextCredentials, environment, { scope: 'user' });
  await CredentialsManager.toggleCredentials(userId, provider, environment, 'user', true);

  const persistedEntry = await CredentialsManager.getCredentialEntry(userId, provider, environment);
  const persistedAppKey = String((persistedEntry?.credentials as any)?.appKey || '').trim();
  const persistedAppSecret = String((persistedEntry?.credentials as any)?.appSecret || '').trim();
  const persistedActive = !!persistedEntry?.isActive;

  if (!persistedAppKey || !persistedAppSecret || !persistedActive) {
    throw new Error('Affiliate credentials persistence validation failed (appKey/appSecret/isActive)');
  }

  const logPayload = {
    event: 'affiliate_repair_completed',
    provider,
    environment,
    hasAppKey: true,
    hasAppSecret: true,
    isActive: true,
    operation: existingEntry ? 'updated' : 'created',
    userId,
  };
  logger.info('[affiliate-repair] Completed successfully', logPayload);
  console.log(JSON.stringify(logPayload, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: any) => {
    const message = error?.message || String(error);
    logger.error('[affiliate-repair] Failed', { error: message });
    console.error(message);
    await prisma.$disconnect();
    process.exit(1);
  });
