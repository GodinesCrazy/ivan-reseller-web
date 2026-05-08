/**
 * Shared helpers used across CJ-Shopify USA route controllers.
 * Extracted from the monolithic cj-shopify-usa.routes.ts to avoid duplication.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';

export async function recordTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step,
      message,
      meta,
    },
  });
}

export function pctFromCounts(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function safeRate(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 0;
}

export function normalizeCountMap(rows: Array<{ status: string; _count: { status: number } }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count.status;
    return acc;
  }, {});
}

export function sumStatuses(counts: Record<string, number>, statuses: string[]): number {
  return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}
