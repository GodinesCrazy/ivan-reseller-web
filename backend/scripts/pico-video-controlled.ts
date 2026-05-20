#!/usr/bin/env tsx
/**
 * Controlled PICO video smoke test.
 *
 * Renders exactly one eligible video through Creatomate and leaves the generated
 * TikTok/Instagram rows in RENDERED state. It intentionally does not publish to
 * social networks, so OAuth tokens can remain missing during first validation.
 *
 * Env:
 *   PICO_USER_ID        default 1
 *
 * Usage:
 *   npm run pico:video:controlled
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

async function main(): Promise<void> {
  await import('../src/config/env');
  const { prisma } = await import('../src/config/database');
  const { cjShopifyUsaPicoVideoService } = await import(
    '../src/modules/cj-shopify-usa/services/cj-shopify-usa-pico-video.service'
  );

  const userId = Number(process.env.PICO_USER_ID || '1');
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('PICO_USER_ID must be a positive integer.');
  }

  console.log('PICO controlled video smoke');
  console.log(`  userId: ${userId}`);
  console.log(`  creatomate: ${process.env.CREATOMATE_API_KEY?.trim() ? 'configured' : 'missing'}`);
  console.log(`  tiktok: ${process.env.TIKTOK_ACCESS_TOKEN?.trim() ? 'configured' : 'missing'}`);
  console.log(
    `  instagram: ${
      process.env.INSTAGRAM_ACCESS_TOKEN?.trim() && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()
        ? 'configured'
        : 'missing'
    }`,
  );

  if (!process.env.CREATOMATE_API_KEY?.trim()) {
    console.log('\nCannot run controlled render: CREATOMATE_API_KEY is not configured.');
    console.log('Set CREATOMATE_API_KEY in Railway/backend env, then rerun: npm run pico:video:controlled');
    process.exit(3);
  }

  const candidates = await cjShopifyUsaPicoVideoService.getVideoCandidates(userId, 1);
  console.log(`  candidates: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('\nNo eligible PICO video candidates found.');
    process.exit(2);
  }

  const result = await cjShopifyUsaPicoVideoService.renderVideoOnly(userId, 1);
  console.log('\nResult');
  console.log(`  ok: ${result.ok}`);
  console.log(`  rendered: ${result.rendered}`);
  console.log(`  failed: ${result.failed}`);
  console.log(`  message: ${result.message}`);

  for (const row of result.results) {
    console.log(
      `  listing=${row.listingId} ok=${row.ok} renderGroupId=${row.renderGroupId ?? 'n/a'} videoUrl=${
        row.videoUrl ? 'yes' : 'no'
      }${row.error ? ` error=${row.error}` : ''}`,
    );
  }

  const renderGroupIds = result.results
    .map((row) => row.renderGroupId)
    .filter((value): value is string => Boolean(value));
  if (renderGroupIds.length > 0) {
    const posts = await prisma.cjShopifyUsaVideoPost.findMany({
      where: { userId, renderGroupId: { in: renderGroupIds } },
      select: { id: true, listingId: true, platform: true, status: true, videoUrl: true },
      orderBy: [{ renderGroupId: 'asc' }, { platform: 'asc' }],
    });
    console.log('\nVideo posts');
    for (const post of posts) {
      console.log(
        `  id=${post.id} listing=${post.listingId} platform=${post.platform} status=${post.status} videoUrl=${
          post.videoUrl ? 'yes' : 'no'
        }`,
      );
    }
  }

  process.exit(result.ok ? 0 : 1);
}

main()
  .catch((error) => {
    console.error('[pico:video:controlled] Fatal:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/config/database');
    await prisma.$disconnect().catch(() => undefined);
  });
