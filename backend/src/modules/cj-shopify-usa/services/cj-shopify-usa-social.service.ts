import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM,
  CJ_SHOPIFY_USA_SOCIAL_POST_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';

const PINTEREST_API_URL = 'https://api.pinterest.com/v5/pins';
const STORE_BASE_URL = 'https://shop.ivanreseller.com';
const MAX_RETRIES = 3;
const MAX_DESCRIPTION_LENGTH = 500;
const DEFAULT_BACKLOG_LIMIT = 25;
// Exponential base delay: 10s, 20s, 40s between attempts 1→2, 2→3, 3→fail
const BASE_RETRY_DELAY_MS = 10_000;

async function safeTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  try {
    await prisma.cjShopifyUsaExecutionTrace.create({ data: { userId, step, message, meta } });
  } catch {
    // trace failures must never propagate or block the caller
  }
}

function buildDescription(draftPayload: unknown): string {
  const payload = draftPayload as Record<string, unknown> | null;
  const raw = String(payload?.description ?? payload?.descriptionHtml ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (raw.length <= MAX_DESCRIPTION_LENGTH) return raw;
  return raw.slice(0, MAX_DESCRIPTION_LENGTH - 1) + '…';
}

function extractFirstImageUrl(draftPayload: unknown): string | null {
  const payload = draftPayload as Record<string, unknown> | null;
  const images = payload?.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0] as Record<string, unknown> | null;
  return String(first?.url ?? first?.src ?? '').trim() || null;
}

async function getShopifyProductImage(userId: number, shopifyProductId?: string | null): Promise<string | null> {
  const rawId = String(shopifyProductId ?? '').trim();
  if (!rawId) return null;

  const numericId = rawId.includes('gid://')
    ? rawId.split('/').pop()
    : rawId;
  if (!numericId) return null;

  const { cjShopifyUsaAdminService } = await import('./cj-shopify-usa-admin.service.js');
  const token = await cjShopifyUsaAdminService.getAccessToken(userId);
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
  const res = await fetch(
    `https://${token.shopDomain}/admin/api/${apiVersion}/products/${numericId}/images.json`,
    { headers: { 'X-Shopify-Access-Token': token.accessToken } },
  );
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as { images?: Array<{ src?: string | null }> };
  return String(data.images?.[0]?.src ?? '').trim() || null;
}

async function callPinterestCreatePin(opts: {
  accessToken: string;
  boardId: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
}): Promise<string> {
  const res = await fetch(PINTEREST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      board_id: opts.boardId,
      title: opts.title,
      description: opts.description,
      link: opts.link,
      media_source: { source_type: 'image_url', url: opts.imageUrl },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pinterest API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Pinterest API returned a response without a pin ID');
  return data.id;
}

async function executeAttempt(postId: number, userId: number): Promise<void> {
  const post = await prisma.cjShopifyUsaSocialPost.findUnique({
    where: { id: postId },
    include: { listing: true },
  });

  if (!post) return;
  if (post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS) return;

  const attemptNumber = post.attempts + 1;

  if (post.attempts >= MAX_RETRIES) {
    await prisma.cjShopifyUsaSocialPost.update({
      where: { id: postId },
      data: { status: CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED },
    });
    return;
  }

  const accessToken = process.env.PINTEREST_ACCESS_TOKEN ?? '';
  const boardId = process.env.PINTEREST_BOARD_ID ?? '';

  if (!accessToken || !boardId) {
    await prisma.cjShopifyUsaSocialPost.update({
      where: { id: postId },
      data: {
        status: CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED,
        errorMsg: 'PINTEREST_ACCESS_TOKEN or PINTEREST_BOARD_ID env vars are not configured',
      },
    });
    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.SOCIAL_POST_ERROR, 'social.post.error', {
      postId,
      platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
      error: 'Missing Pinterest credentials in environment',
    } as Prisma.InputJsonValue);
    return;
  }

  const { listing } = post;
  const imageUrl =
    extractFirstImageUrl(listing.draftPayload) ||
    (await getShopifyProductImage(userId, listing.shopifyProductId).catch(() => null));

  if (!imageUrl) {
    await prisma.cjShopifyUsaSocialPost.update({
      where: { id: postId },
      data: {
        status: CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED,
        attempts: { increment: 1 },
        errorMsg: 'No image URL found in listing draftPayload',
      },
    });
    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.SOCIAL_POST_ERROR, 'social.post.error', {
      postId,
      platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
      listingId: listing.id,
      error: 'No image URL found in draftPayload',
    } as Prisma.InputJsonValue);
    return;
  }

  await prisma.cjShopifyUsaSocialPost.update({
    where: { id: postId },
    data: {
      status: CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.RETRYING,
      attempts: { increment: 1 },
    },
  });

  await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.SOCIAL_POST_START, 'social.post.start', {
    postId,
    platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
    listingId: listing.id,
    attempt: attemptNumber,
  } as Prisma.InputJsonValue);

  try {
    const pinId = await callPinterestCreatePin({
      accessToken,
      boardId,
      title: post.title,
      description: buildDescription(listing.draftPayload),
      link: `${STORE_BASE_URL}/products/${listing.shopifyHandle}`,
      imageUrl,
    });

    const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;

    await prisma.cjShopifyUsaSocialPost.update({
      where: { id: postId },
      data: {
        status: CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS,
        externalId: pinId,
        url: pinUrl,
        errorMsg: null,
      },
    });

    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.SOCIAL_POST_SUCCESS, 'social.post.success', {
      postId,
      platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
      listingId: listing.id,
      pinId,
      pinUrl,
    } as Prisma.InputJsonValue);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isLastAttempt = attemptNumber >= MAX_RETRIES;

    await prisma.cjShopifyUsaSocialPost.update({
      where: { id: postId },
      data: {
        status: isLastAttempt
          ? CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED
          : CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.RETRYING,
        errorMsg,
      },
    });

    await safeTrace(
      userId,
      isLastAttempt ? CJ_SHOPIFY_USA_TRACE_STEP.SOCIAL_POST_ERROR : CJ_SHOPIFY_USA_TRACE_STEP.SOCIAL_POST_RETRY,
      isLastAttempt ? 'social.post.error' : 'social.post.retry',
      {
        postId,
        platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
        listingId: listing.id,
        attempt: attemptNumber,
        isLastAttempt,
        error: errorMsg,
      } as Prisma.InputJsonValue,
    );

    if (!isLastAttempt) {
      // Exponential backoff: 10s → 20s → 40s
      const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attemptNumber - 1);
      setTimeout(() => {
        executeAttempt(postId, userId).catch(() => {});
      }, delayMs);
    }
  }
}

export const cjShopifyUsaSocialService = {
  /**
   * Creates a social post record and fires the first Pinterest pin attempt
   * asynchronously. Never throws — all errors are captured in the DB record
   * and trace log.
   */
  schedulePost(input: { userId: number; listingId: number; title: string }): void {
    prisma.cjShopifyUsaSocialPost
      .create({
        data: {
          userId: input.userId,
          listingId: input.listingId,
          platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
          status: CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.PENDING,
          title: input.title,
        },
      })
      .then((post) => {
        setImmediate(() => {
          executeAttempt(post.id, input.userId).catch(() => {});
        });
      })
      .catch(() => {});
  },

  async processBacklog(userId: number, limit = DEFAULT_BACKLOG_LIMIT): Promise<{ queued: number }> {
    const posts = await prisma.cjShopifyUsaSocialPost.findMany({
      where: {
        userId,
        platform: CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.PINTEREST,
        status: {
          in: [
            CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.PENDING,
            CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED,
            CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.RETRYING,
          ],
        },
        attempts: { lt: MAX_RETRIES },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: { id: true },
    });

    for (const post of posts) {
      setImmediate(() => {
        executeAttempt(post.id, userId).catch(() => {});
      });
    }

    return { queued: posts.length };
  },
};
