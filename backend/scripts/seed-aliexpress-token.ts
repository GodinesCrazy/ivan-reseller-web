#!/usr/bin/env tsx
/**
 * Seed AliExpress OAuth token in DB for testing.
 * The Affiliate Product API uses app_key+signature (no OAuth). This satisfies diagnostics.
 * For real Dropshipping/order APIs, complete OAuth manually via /api/aliexpress/auth.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main(): Promise<number> {
  const { prisma } = await import('../src/config/database');

  // Placeholder token - Affiliate product search uses app_key+signature, not OAuth
  const placeholderToken = 'test-token-' + Date.now();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.aliExpressToken.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      accessToken: placeholderToken,
      refreshToken: 'test-refresh-' + Date.now(),
      expiresAt,
    },
    update: {
      accessToken: placeholderToken,
      refreshToken: 'test-refresh-' + Date.now(),
      expiresAt,
    },
  });

  console.log('[SEED] AliExpress token stored in DB (placeholder for diagnostics)');
  console.log('[SEED] For real OAuth: complete flow at GET /api/aliexpress/auth');
  return 0;
}

main().then((code) => process.exit(code));
