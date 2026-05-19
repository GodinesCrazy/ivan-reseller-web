import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS,
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
  CJ_SHOPIFY_USA_VIDEO_POST_STATUS,
} from '../cj-shopify-usa.constants';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { cjShopifyUsaContentService } from './cj-shopify-usa-content.service';
import { cjShopifyUsaCreatomateService } from './cj-shopify-usa-creatomate.service';
import { cjShopifyUsaPicoVideoService, type PicoVideoCandidate } from './cj-shopify-usa-pico-video.service';

const STAGNANT_DAYS = 30;
const PAID_ORDER_STATUSES = new Set([
  'CJ_ORDER_CREATED',
  'CJ_PAYMENT_COMPLETED',
  'CJ_FULFILLING',
  'CJ_SHIPPED',
  'TRACKING_ON_SHOPIFY',
  'COMPLETED',
]);

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function draftRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function extractImageCount(draftPayload: unknown): number {
  const images = draftRecord(draftPayload).images;
  return Array.isArray(images) ? images.length : 0;
}

function plainDescription(listing: { draftPayload: unknown; product: { description: string | null } }): string {
  const draft = draftRecord(listing.draftPayload);
  return String(draft.descriptionHtml || draft.description || listing.product.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function safeTrace(userId: number, message: string, meta?: Prisma.InputJsonValue) {
  try {
    await prisma.cjShopifyUsaExecutionTrace.create({
      data: { userId, step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION, message, meta },
    });
  } catch {
    // trace failures must not block PICO actions
  }
}

export type PicoBlogCandidate = {
  listingId: number;
  productId: number;
  title: string;
  handle: string | null;
  score: number;
  marginPct: number;
};

export type PicoStagnantCandidate = {
  listingId: number;
  productId: number;
  title: string;
  shopifyProductId: string;
  daysListed: number;
  lastSeoUpdate: string | null;
};

export const cjShopifyUsaPicoService = {
  STAGNANT_DAYS,

  async getBlogCandidates(userId: number, limit = 5): Promise<PicoBlogCandidate[]> {
    const existing = await prisma.cjShopifyUsaBlogEntry.findMany({
      where: {
        userId,
        status: {
          in: [
            CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.PENDING,
            CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.GENERATING,
            CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.PUBLISHED,
          ],
        },
      },
      select: { productId: true },
    });
    const blockedProductIds = new Set(existing.map((row) => row.productId));

    const listings = await prisma.cjShopifyUsaListing.findMany({
      where: {
        userId,
        status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
        shopifyHandle: { not: null },
      },
      include: { product: true, evaluation: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 250,
    });

    return listings
      .filter((listing) => !blockedProductIds.has(listing.productId))
      .map((listing) => {
        const marginPct = n(listing.evaluation?.estimatedMarginPct);
        const imageCount = extractImageCount(listing.draftPayload);
        const score =
          35 +
          Math.min(30, marginPct) +
          Math.min(15, imageCount * 3) +
          (listing.shippingQuoteId ? 10 : 0) +
          (n(listing.listedPriceUsd) > 0 ? 5 : 0);
        return {
          listingId: listing.id,
          productId: listing.productId,
          title: listing.product.title,
          handle: listing.shopifyHandle,
          score: Math.round(score),
          marginPct,
          imageCount,
        };
      })
      .filter((row) => row.score >= 72 && row.marginPct >= 18 && row.imageCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  async getStagnantCandidates(userId: number, limit = 5): Promise<PicoStagnantCandidate[]> {
    const cutoff = new Date(Date.now() - STAGNANT_DAYS * 24 * 60 * 60 * 1000);
    const listings = await prisma.cjShopifyUsaListing.findMany({
      where: {
        userId,
        status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
        shopifyProductId: { not: null },
      },
      include: {
        product: true,
        orders: {
          where: { createdAt: { gte: cutoff } },
          select: { id: true, status: true, totalUsd: true },
        },
      },
      orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });

    const rows: PicoStagnantCandidate[] = [];
    for (const listing of listings) {
      const listedAt = listing.publishedAt ?? listing.createdAt;
      if (listedAt > cutoff) continue;

      const paidOrders = listing.orders.filter((order) => PAID_ORDER_STATUSES.has(order.status));
      if (paidOrders.length > 0) continue;

      if (listing.lastSeoUpdate && listing.lastSeoUpdate > cutoff) continue;

      const daysListed = Math.floor((Date.now() - listedAt.getTime()) / (24 * 60 * 60 * 1000));
      rows.push({
        listingId: listing.id,
        productId: listing.productId,
        title: listing.product.title,
        shopifyProductId: String(listing.shopifyProductId),
        daysListed,
        lastSeoUpdate: listing.lastSeoUpdate?.toISOString() ?? null,
      });
    }

    return rows.sort((a, b) => b.daysListed - a.daysListed).slice(0, limit);
  },

  async promoteViaBlog(userId: number, limit = 2) {
    const candidates = await this.getBlogCandidates(userId, limit);
    const results: Array<{
      listingId: number;
      productId: number;
      ok: boolean;
      articleId?: string;
      keyword?: string;
      error?: string;
    }> = [];

    for (const candidate of candidates) {
      const listing = await prisma.cjShopifyUsaListing.findFirst({
        where: { userId, id: candidate.listingId },
        include: { product: true },
      });
      if (!listing) continue;

      const description = plainDescription(listing);
      let entryId: number | null = null;

      try {
        const entry = await prisma.cjShopifyUsaBlogEntry.create({
          data: {
            userId,
            productId: candidate.productId,
            keyword: 'pending',
            title: candidate.title,
            contentHtml: '',
            status: CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.GENERATING,
          },
        });
        entryId = entry.id;

        const generated = await cjShopifyUsaContentService.generateBlogArticle(candidate.title, description);
        const articleId = await cjShopifyUsaAdminService.createBlogArticle(
          userId,
          generated.title,
          generated.contentHtml,
          candidate.title,
        );

        await prisma.cjShopifyUsaBlogEntry.update({
          where: { id: entry.id },
          data: {
            shopifyArticleId: articleId,
            keyword: generated.keyword,
            title: generated.title,
            contentHtml: generated.contentHtml,
            status: CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.PUBLISHED,
            publishedAt: new Date(),
            error: null,
          },
        });

        results.push({
          listingId: candidate.listingId,
          productId: candidate.productId,
          ok: true,
          articleId,
          keyword: generated.keyword,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (entryId) {
          await prisma.cjShopifyUsaBlogEntry.update({
            where: { id: entryId },
            data: { status: CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.FAILED, error: message },
          }).catch(() => undefined);
        }
        results.push({
          listingId: candidate.listingId,
          productId: candidate.productId,
          ok: false,
          error: message,
        });
      }
    }

    await safeTrace(userId, 'sales_agent.action.promote_via_blog', {
      ok: results.every((row) => row.ok) || results.length === 0,
      requested: candidates.length,
      published: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      results,
    } as Prisma.InputJsonValue);

    return {
      ok: results.length === 0 || results.some((row) => row.ok),
      executed: true,
      published: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      results,
      message: `Blog SEO: ${results.filter((row) => row.ok).length} articulos publicados, ${results.filter((row) => !row.ok).length} fallidos.`,
    };
  },

  async evaluateStagnantListings(userId: number, limit = 3) {
    const candidates = await this.getStagnantCandidates(userId, limit);
    const results: Array<{
      listingId: number;
      ok: boolean;
      beforeTitle?: string;
      afterTitle?: string;
      intent?: string;
      error?: string;
    }> = [];

    for (const candidate of candidates) {
      try {
        const listing = await prisma.cjShopifyUsaListing.findFirst({
          where: { userId, id: candidate.listingId },
          include: { product: true },
        });
        if (!listing?.shopifyProductId) throw new Error('Listing has no Shopify product id.');

        const beforeTitle = listing.product.title;
        const description = plainDescription(listing);
        const refreshed = await cjShopifyUsaContentService.generateSeoRefresh(beforeTitle, description);

        await cjShopifyUsaAdminService.updateProductDetails({
          userId,
          productId: listing.shopifyProductId,
          title: refreshed.title,
          descriptionHtml: refreshed.descriptionHtml,
        });

        const draft = draftRecord(listing.draftPayload);
        await prisma.cjShopifyUsaListing.update({
          where: { id: listing.id },
          data: {
            lastSeoUpdate: new Date(),
            draftPayload: {
              ...draft,
              title: refreshed.title,
              descriptionHtml: refreshed.descriptionHtml,
              picoSeoRefresh: {
                refreshedAt: new Date().toISOString(),
                intent: refreshed.intent,
                beforeTitle,
              },
            } as Prisma.InputJsonValue,
          },
        });

        results.push({
          listingId: candidate.listingId,
          ok: true,
          beforeTitle,
          afterTitle: refreshed.title,
          intent: refreshed.intent,
        });
      } catch (error) {
        results.push({
          listingId: candidate.listingId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await safeTrace(userId, 'sales_agent.action.evaluate_stagnant_listings', {
      ok: results.every((row) => row.ok) || results.length === 0,
      requested: candidates.length,
      updated: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      results,
    } as Prisma.InputJsonValue);

    return {
      ok: results.length === 0 || results.some((row) => row.ok),
      executed: true,
      updated: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      results,
      message: `SEO evolutivo: ${results.filter((row) => row.ok).length} fichas actualizadas, ${results.filter((row) => !row.ok).length} fallidas.`,
    };
  },

  async promoteViaVideo(userId: number, limit = 1) {
    return cjShopifyUsaPicoVideoService.promoteViaVideo(userId, limit);
  },

  getVideoCandidates(userId: number, limit = 5) {
    return cjShopifyUsaPicoVideoService.getVideoCandidates(userId, limit);
  },

  async processVideoBacklog(userId: number, limit = 10) {
    return cjShopifyUsaPicoVideoService.processBacklog(userId, limit);
  },

  async getDashboardSummary(
    userId: number,
    candidates: {
      blog: PicoBlogCandidate[];
      stagnant: PicoStagnantCandidate[];
      video: PicoVideoCandidate[];
    },
  ) {
    const [blogPublished, blogFailed, videoSuccess, videoFailed, videoPending, seoRefreshedListings] =
      await Promise.all([
        prisma.cjShopifyUsaBlogEntry.count({
          where: { userId, status: CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.PUBLISHED },
        }),
        prisma.cjShopifyUsaBlogEntry.count({
          where: { userId, status: CJ_SHOPIFY_USA_BLOG_ENTRY_STATUS.FAILED },
        }),
        prisma.cjShopifyUsaVideoPost.count({
          where: { userId, status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.SUCCESS },
        }),
        prisma.cjShopifyUsaVideoPost.count({
          where: { userId, status: CJ_SHOPIFY_USA_VIDEO_POST_STATUS.FAILED },
        }),
        prisma.cjShopifyUsaVideoPost.count({
          where: {
            userId,
            status: {
              in: [
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PENDING,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERING,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RENDERED,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.PUBLISHING,
                CJ_SHOPIFY_USA_VIDEO_POST_STATUS.RETRYING,
              ],
            },
          },
        }),
        prisma.cjShopifyUsaListing.count({
          where: { userId, lastSeoUpdate: { not: null } },
        }),
      ]);

    const recentTraces = await prisma.cjShopifyUsaExecutionTrace.findMany({
      where: {
        userId,
        message: {
          in: [
            'sales_agent.action.promote_via_blog',
            'sales_agent.action.evaluate_stagnant_listings',
            'sales_agent.action.promote_via_video',
            'pico.video.render.success',
            'pico.video.publish.success',
            'pico.video.publish.error',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, message: true, createdAt: true, meta: true },
    });

    return {
      generatedAt: new Date().toISOString(),
      readiness: {
        openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
        creatomate: cjShopifyUsaCreatomateService.isConfigured(),
        tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim()),
        instagram: Boolean(
          process.env.INSTAGRAM_ACCESS_TOKEN?.trim() && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim(),
        ),
        pinterest: Boolean(process.env.PINTEREST_ACCESS_TOKEN?.trim() && process.env.PINTEREST_BOARD_ID?.trim()),
      },
      stats: {
        blogsPublished: blogPublished,
        blogsFailed: blogFailed,
        videosPublished: videoSuccess,
        videosFailed: videoFailed,
        videosInProgress: videoPending,
        listingsSeoRefreshed: seoRefreshedListings,
      },
      candidates: {
        blog: candidates.blog.length,
        stagnantSeo: candidates.stagnant.length,
        video: candidates.video.length,
      },
      recentActivity: recentTraces.map((trace) => ({
        id: trace.id,
        message: trace.message,
        createdAt: trace.createdAt.toISOString(),
        meta: trace.meta,
      })),
    };
  },
};
