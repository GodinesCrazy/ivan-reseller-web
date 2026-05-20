import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM,
  CJ_SHOPIFY_USA_TRACE_STEP,
  CJ_SHOPIFY_USA_VIDEO_POST_STATUS,
} from '../cj-shopify-usa.constants';
import { cjShopifyUsaContentService } from './cj-shopify-usa-content.service';
import { cjShopifyUsaCreatomateService } from './cj-shopify-usa-creatomate.service';
import { cjShopifyUsaPicoAssetsService } from './cj-shopify-usa-pico-assets.service';
import { cjShopifyUsaPicoSocialPublishService } from './cj-shopify-usa-pico-social-publish.service';

const MAX_VIDEO_ATTEMPTS = 2;
const VIDEO_PLATFORMS = [
  CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.TIKTOK,
  CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.INSTAGRAM,
] as const;

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function safeTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  try {
    await prisma.cjShopifyUsaExecutionTrace.create({ data: { userId, step, message, meta } });
  } catch {
    // non-blocking
  }
}

async function getShopifyImageUrls(userId: number, shopifyProductId: string | null): Promise<string[]> {
  if (!shopifyProductId) return [];
  const { cjShopifyUsaAdminService } = await import('./cj-shopify-usa-admin.service.js');
  const token = await cjShopifyUsaAdminService.getAccessToken(userId);
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
  const numericId = shopifyProductId.includes('gid://')
    ? shopifyProductId.split('/').pop()
    : shopifyProductId;
  if (!numericId) return [];

  const res = await fetch(
    `https://${token.shopDomain}/admin/api/${apiVersion}/products/${numericId}/images.json`,
    { headers: { 'X-Shopify-Access-Token': token.accessToken } },
  );
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { images?: Array<{ src?: string }> };
  return (data.images ?? [])
    .map((img) => String(img.src ?? '').trim())
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 5);
}

async function ensureSharedRender(input: {
  userId: number;
  renderGroupId: string;
  listing: {
    id: number;
    shopifyHandle: string | null;
    shopifyProductId: string | null;
    draftPayload: unknown;
    listedPriceUsd: unknown;
    product: { title: string; images: unknown };
  };
}): Promise<string> {
  const existing = await prisma.cjShopifyUsaVideoPost.findFirst({
    where: {
      userId: input.userId,
      renderGroupId: input.renderGroupId,
      videoUrl: { not: null },
    },
    select: { videoUrl: true },
  });
  if (existing?.videoUrl) return existing.videoUrl;

  const shopifyUrls = await getShopifyImageUrls(input.userId, input.listing.shopifyProductId);
  const imageUrls = cjShopifyUsaPicoAssetsService.collectProductImageUrls({
    draftPayload: input.listing.draftPayload,
    productImages: input.listing.product.images,
    shopifyFallbackUrls: shopifyUrls,
  });

  if (!cjShopifyUsaPicoAssetsService.hasMinimumAssets(imageUrls)) {
    throw new Error(
      `Need at least ${cjShopifyUsaPicoAssetsService.MIN_IMAGES} product images; found ${imageUrls.length}.`,
    );
  }

  await prisma.cjShopifyUsaVideoPost.updateMany({
    where: { userId: input.userId, renderGroupId: input.renderGroupId },
    data: {
      status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERING,
      imageUrls: imageUrls as Prisma.InputJsonValue,
    },
  });

  await safeTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_RENDER, 'pico.video.render.start', {
    renderGroupId: input.renderGroupId,
    listingId: input.listing.id,
    imageCount: imageUrls.length,
  } as Prisma.InputJsonValue);

  const { renderId } = await cjShopifyUsaCreatomateService.createSlideshowRender({
    imageUrls,
    productTitle: input.listing.product.title,
  });

  await prisma.cjShopifyUsaVideoPost.updateMany({
    where: { userId: input.userId, renderGroupId: input.renderGroupId },
    data: { renderId },
  });

  const videoUrl = await cjShopifyUsaCreatomateService.waitForRender(renderId);

  await prisma.cjShopifyUsaVideoPost.updateMany({
    where: { userId: input.userId, renderGroupId: input.renderGroupId },
    data: {
      videoUrl,
      status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERED,
    },
  });

  await safeTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_RENDER, 'pico.video.render.success', {
    renderGroupId: input.renderGroupId,
    renderId,
    videoUrl,
  } as Prisma.InputJsonValue);

  return videoUrl;
}

async function publishPlatformPost(postId: number, userId: number): Promise<void> {
  const post = await prisma.cjShopifyUsaVideoPost.findUnique({
    where: { id: postId },
    include: { listing: { include: { product: true } } },
  });
  if (!post || post.status === CJ_SHOPIFY_USA_VIDEO_POST_STATUS.SUCCESS) return;

  if (post.attempts >= MAX_VIDEO_ATTEMPTS) {
    await prisma.cjShopifyUsaVideoPost.update({
      where: { id: postId },
      data: { status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.FAILED },
    });
    return;
  }

  await prisma.cjShopifyUsaVideoPost.update({
    where: { id: postId },
    data: {
      attempts: { increment: 1 },
      status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PUBLISHING,
    },
  });

  try {
    const videoUrl =
      post.videoUrl ??
      (await ensureSharedRender({
        userId,
        renderGroupId: post.renderGroupId,
        listing: post.listing,
      }));

    const captionBase = post.caption || post.title;
    const tags = post.hashtags ? ` ${post.hashtags}` : '';
    const fullCaption = `${captionBase}${tags}`.trim();
    const productUrl = cjShopifyUsaPicoSocialPublishService.buildProductUrl(post.listing.shopifyHandle);

    let result: { externalId: string; publishUrl?: string };

    if (post.platform === CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.TIKTOK) {
      result = await cjShopifyUsaPicoSocialPublishService.publishTikTok({
        videoUrl,
        caption: fullCaption,
        productUrl,
      });
    } else if (post.platform === CJ_SHOPIFY_USA_SOCIAL_POST_PLATFORM.INSTAGRAM) {
      result = await cjShopifyUsaPicoSocialPublishService.publishInstagramReel({
        videoUrl,
        caption: fullCaption,
      });
    } else {
      throw new Error(`Unsupported video platform: ${post.platform}`);
    }

    await prisma.cjShopifyUsaVideoPost.update({
      where: { id: postId },
      data: {
        status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.SUCCESS,
        videoUrl,
        externalId: result.externalId,
        publishUrl: result.publishUrl ?? null,
        publishedAt: new Date(),
        errorMsg: null,
      },
    });

    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_SUCCESS, 'pico.video.publish.success', {
      postId,
      platform: post.platform,
      listingId: post.listingId,
      externalId: result.externalId,
    } as Prisma.InputJsonValue);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isLast = post.attempts + 1 >= MAX_VIDEO_ATTEMPTS;

    await prisma.cjShopifyUsaVideoPost.update({
      where: { id: postId },
      data: {
        status: isLast ? CJ_SHOPIFY_USA_VIDEO_POST_STATUS.FAILED : CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RETRYING,
        errorMsg,
      },
    });

    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_ERROR, 'pico.video.publish.error', {
      postId,
      platform: post.platform,
      listingId: post.listingId,
      error: errorMsg,
      isLast,
    } as Prisma.InputJsonValue);

    if (!isLast) {
      setTimeout(() => {
        publishPlatformPost(postId, userId).catch(() => undefined);
      }, 15_000);
    }
  }
}

async function prepareRenderGroup(input: {
  userId: number;
  listingId: number;
  title: string;
  priceUsd: number;
  handle: string | null;
}): Promise<string> {
  const renderGroupId = randomUUID();

  const copy = await cjShopifyUsaContentService.generateVideoSocialCopy({
    userId: input.userId,
    title: input.title,
    priceUsd: input.priceUsd,
    handle: input.handle,
  });

  for (const platform of VIDEO_PLATFORMS) {
    await prisma.cjShopifyUsaVideoPost.create({
      data: {
        userId: input.userId,
        listingId: input.listingId,
        renderGroupId,
        platform,
        status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PENDING,
        title: input.title,
        caption: copy.caption,
        hashtags: copy.hashtags.join(' '),
      },
    });
  }

  return renderGroupId;
}

export type PicoVideoCandidate = {
  listingId: number;
  title: string;
  handle: string | null;
  score: number;
  imageCount: number;
};

export const cjShopifyUsaPicoVideoService = {
  isVideoPipelineReady(): boolean {
    return cjShopifyUsaCreatomateService.isConfigured();
  },

  async getVideoCandidates(userId: number, limit = 5): Promise<PicoVideoCandidate[]> {
    const blockedListingIds = new Set(
      (
        await prisma.cjShopifyUsaVideoPost.findMany({
          where: {
            userId,
            status: {
              in: [
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PENDING,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERING,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERED,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PUBLISHING,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.SUCCESS,
              ],
            },
          },
          select: { listingId: true },
        })
      ).map((row) => row.listingId),
    );

    const listings = await prisma.cjShopifyUsaListing.findMany({
      where: {
        userId,
        status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
        shopifyHandle: { not: null },
      },
      include: { product: true, evaluation: true },
      take: 200,
    });

    return listings
      .filter((listing) => !blockedListingIds.has(listing.id))
      .map((listing) => {
        const imageUrls = cjShopifyUsaPicoAssetsService.collectProductImageUrls({
          draftPayload: listing.draftPayload,
          productImages: listing.product.images,
        });
        const marginPct = n(listing.evaluation?.estimatedMarginPct);
        const score = 40 + Math.min(25, marginPct) + Math.min(20, imageUrls.length * 4);
        return {
          listingId: listing.id,
          title: listing.product.title,
          handle: listing.shopifyHandle,
          score: Math.round(score),
          imageCount: imageUrls.length,
        };
      })
      .filter((row) => row.imageCount >= cjShopifyUsaPicoAssetsService.MIN_IMAGES && row.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  scheduleVideoPromotion(input: { userId: number; listingId: number; title: string; priceUsd: number; handle: string | null }): void {
    if (!cjShopifyUsaCreatomateService.isConfigured()) return;

    setImmediate(() => {
      this.runVideoPipeline(input).catch(() => undefined);
    });
  },

  async runVideoPipeline(input: {
    userId: number;
    listingId: number;
    title: string;
    priceUsd: number;
    handle: string | null;
  }): Promise<void> {
    const renderGroupId = await prepareRenderGroup(input);
    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: { userId: input.userId, id: input.listingId },
      include: { product: true },
    });
    if (!listing) return;

    await safeTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_START, 'pico.video.pipeline.start', {
      listingId: input.listingId,
      renderGroupId,
    } as Prisma.InputJsonValue);

    const videoUrl = await ensureSharedRender({
      userId: input.userId,
      renderGroupId,
      listing,
    });

    const posts = await prisma.cjShopifyUsaVideoPost.findMany({
      where: { userId: input.userId, renderGroupId },
      orderBy: { platform: 'asc' },
    });

    for (const post of posts) {
      await prisma.cjShopifyUsaVideoPost.update({
        where: { id: post.id },
        data: { videoUrl, status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERED },
      });
      await publishPlatformPost(post.id, input.userId);
    }
  },

  async renderVideoOnly(userId: number, limit = 1) {
    if (!cjShopifyUsaCreatomateService.isConfigured()) {
      await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_ERROR, 'pico.video.skipped', {
        reason: 'CREATOMATE_API_KEY not configured',
        mode: 'render_only',
      } as Prisma.InputJsonValue);
      return {
        ok: false,
        executed: false,
        skipped: true,
        rendered: 0,
        failed: 0,
        results: [],
        message: 'Video PICO render-only omitido: CREATOMATE_API_KEY no configurada.',
      };
    }

    const candidates = await this.getVideoCandidates(userId, Math.max(1, Math.min(1, limit)));
    const results: Array<{
      listingId: number;
      ok: boolean;
      title: string;
      renderGroupId?: string;
      videoUrl?: string;
      error?: string;
    }> = [];

    for (const candidate of candidates) {
      try {
        const listing = await prisma.cjShopifyUsaListing.findFirst({
          where: { userId, id: candidate.listingId },
          include: { product: true },
        });
        if (!listing) throw new Error(`Listing ${candidate.listingId} not found.`);

        const renderGroupId = await prepareRenderGroup({
          userId,
          listingId: candidate.listingId,
          title: candidate.title,
          priceUsd: n(listing.listedPriceUsd),
          handle: candidate.handle,
        });

        await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_START, 'pico.video.pipeline.start', {
          listingId: candidate.listingId,
          renderGroupId,
          mode: 'render_only',
        } as Prisma.InputJsonValue);

        const videoUrl = await ensureSharedRender({
          userId,
          renderGroupId,
          listing,
        });

        results.push({
          listingId: candidate.listingId,
          ok: true,
          title: candidate.title,
          renderGroupId,
          videoUrl,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          listingId: candidate.listingId,
          ok: false,
          title: candidate.title,
          error: errorMsg,
        });
        await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_ERROR, 'pico.video.render.error', {
          listingId: candidate.listingId,
          mode: 'render_only',
          error: errorMsg,
        } as Prisma.InputJsonValue);
      }
    }

    const rendered = results.filter((row) => row.ok).length;
    const failed = results.filter((row) => !row.ok).length;

    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION, 'pico.video.controlled_render', {
      ok: rendered > 0,
      requested: candidates.length,
      rendered,
      failed,
      results,
    } as Prisma.InputJsonValue);

    return {
      ok: rendered > 0,
      executed: candidates.length > 0,
      skipped: false,
      rendered,
      failed,
      results,
      message: `Video PICO controlado: ${rendered} renderizado(s), ${failed} fallido(s), sin publicacion social automatica.`,
    };
  },

  async promoteViaVideo(userId: number, limit = 1) {
    if (!cjShopifyUsaCreatomateService.isConfigured()) {
      await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.PICO_VIDEO_ERROR, 'pico.video.skipped', {
        reason: 'CREATOMATE_API_KEY not configured',
      } as Prisma.InputJsonValue);
      return {
        ok: false,
        executed: false,
        skipped: true,
        queued: 0,
        message: 'Video PICO omitido: CREATOMATE_API_KEY no configurada.',
      };
    }

    const candidates = await this.getVideoCandidates(userId, limit);
    let queued = 0;

    for (const candidate of candidates) {
      const listing = await prisma.cjShopifyUsaListing.findFirst({
        where: { userId, id: candidate.listingId },
        select: { listedPriceUsd: true },
      });
      this.scheduleVideoPromotion({
        userId,
        listingId: candidate.listingId,
        title: candidate.title,
        priceUsd: n(listing?.listedPriceUsd),
        handle: candidate.handle,
      });
      queued++;
    }

    await safeTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION, 'sales_agent.action.promote_via_video', {
      ok: queued > 0,
      queued,
      candidates: candidates.map((c) => c.listingId),
    } as Prisma.InputJsonValue);

    return {
      ok: queued > 0,
      executed: true,
      queued,
      message: `Video multi-canal: ${queued} renders encolados (TikTok + Instagram por producto).`,
    };
  },

  async processBacklog(userId: number, limit = 10): Promise<{ processed: number }> {
    const posts = await prisma.cjShopifyUsaVideoPost.findMany({
      where: {
        userId,
        status: {
          in: [
            CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PENDING,
            CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERED,
            CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RETRYING,
          ],
        },
        attempts: { lt: MAX_VIDEO_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    for (const post of posts) {
      setImmediate(() => {
        publishPlatformPost(post.id, userId).catch(() => undefined);
      });
    }

    return { processed: posts.length };
  },
};
