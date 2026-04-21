#!/usr/bin/env tsx
/**
 * P60 — Minimal DB connectivity test. Uses connection_limit=1 to minimize slot usage.
 * Run: PRISMA_CONNECTION_LIMIT=1 npx tsx scripts/p60-db-connectivity-test.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(JSON.stringify({ ok: false, error: 'DATABASE_URL missing' }));
    process.exit(1);
  }
  const limit = process.env.PRISMA_CONNECTION_LIMIT?.trim() || '1';
  const sep = url.includes('?') ? '&' : '?';
  const cappedUrl = `${url}${sep}connection_limit=${limit}`;
  const prisma = new PrismaClient({ datasources: { db: { url: cappedUrl } } });
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw<[{ n: number }]>`SELECT 1 as n`;
    console.log(JSON.stringify({ ok: true, result, connectionLimit: limit }));
  } catch (e: any) {
    console.log(JSON.stringify({ ok: false, error: e?.message || String(e), connectionLimit: limit }));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
