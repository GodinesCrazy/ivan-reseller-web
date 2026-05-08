/**
 * Analytics controller — funnel, checkout-readiness, profit-guard, social-autopilot
 * Extracted from cj-shopify-usa.routes.ts for maintainability.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../config/database';
import { cjShopifyUsaAdminService } from '../services/cj-shopify-usa-admin.service';
import { cjShopifyUsaProfitGuardService } from '../services/cj-shopify-usa-profit-guard.service';
import { CJ_SHOPIFY_USA_LISTING_STATUS } from '../cj-shopify-usa.constants';
import { pctFromCounts, safeRate } from './route-helpers';

const router = Router();

// ── GET /analytics/funnel ─────────────────────────────────────────────────────
router.get('/analytics/funnel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const latest = await prisma.cjShopifyUsaExecutionTrace.findFirst({
      where: {
        userId,
        step: 'analytics.checkout_funnel',
        message: 'analytics.checkout_funnel.snapshot',
      },
      orderBy: { createdAt: 'desc' },
    });
    const meta = (latest?.meta || {}) as Record<string, any>;
    const visitors = Math.max(0, Number(meta.visitors ?? 0));
    const addedToCart = Math.max(0, Number(meta.addedToCart ?? 0));
    const reachedCheckout = Math.max(0, Number(meta.reachedCheckout ?? 0));
    const purchases = Math.max(0, Number(meta.purchases ?? 0));
    const localOrders = await prisma.cjShopifyUsaOrder.count({ where: { userId } });
    const stages = [
      { key: 'add_to_cart', label: 'Visitantes que agregaron al carrito', ratePct: safeRate(meta.addToCartRatePct ?? pctFromCounts(addedToCart, visitors)), count: addedToCart },
      { key: 'checkout', label: 'Visitantes que llegaron al checkout', ratePct: safeRate(meta.checkoutRatePct ?? pctFromCounts(reachedCheckout, visitors)), count: reachedCheckout },
      { key: 'purchase', label: 'Visitantes que compraron', ratePct: safeRate(meta.purchaseRatePct ?? pctFromCounts(purchases, visitors)), count: purchases },
    ];
    res.json({
      ok: true,
      snapshot: latest ? {
        id: latest.id,
        createdAt: latest.createdAt,
        visitors,
        addedToCart,
        reachedCheckout,
        purchases,
        source: meta.source ?? 'manual',
        notes: meta.notes ?? null,
      } : null,
      stages,
      localOrders,
      interpretation: {
        checkoutDropRisk: stages[0].ratePct > 0 && stages[1].ratePct / Math.max(stages[0].ratePct, 0.01) < 0.35,
        paymentRisk: stages[1].ratePct > 0 && stages[2].ratePct === 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /analytics/funnel ────────────────────────────────────────────────────
router.post('/analytics/funnel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const visitors = Math.max(0, Number(req.body?.visitors ?? 0));
    const addToCartRatePct = safeRate(req.body?.addToCartRatePct);
    const checkoutRatePct = safeRate(req.body?.checkoutRatePct);
    const purchaseRatePct = safeRate(req.body?.purchaseRatePct);
    const trace = await prisma.cjShopifyUsaExecutionTrace.create({
      data: {
        userId,
        step: 'analytics.checkout_funnel',
        message: 'analytics.checkout_funnel.snapshot',
        meta: {
          visitors,
          addToCartRatePct,
          checkoutRatePct,
          purchaseRatePct,
          addedToCart: Math.round(visitors * (addToCartRatePct / 100)),
          reachedCheckout: Math.round(visitors * (checkoutRatePct / 100)),
          purchases: Math.round(visitors * (purchaseRatePct / 100)),
          source: String(req.body?.source || 'manual').slice(0, 80),
          notes: String(req.body?.notes || '').slice(0, 1000),
        },
      },
    });
    res.json({ ok: true, snapshotId: trace.id });
  } catch (error) {
    next(error);
  }
});

// ── GET /analytics/checkout-readiness ─────────────────────────────────────────
router.get('/analytics/checkout-readiness', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const data = await cjShopifyUsaAdminService.graphql<{
      shop: {
        name: string;
        currencyCode: string;
        billingAddress?: { countryCodeV2?: string | null } | null;
        primaryDomain?: { url?: string | null } | null;
        paymentSettings?: { supportedDigitalWallets?: string[] | null } | null;
      };
      orders: { nodes: Array<{ id: string; name: string; createdAt: string; displayFinancialStatus: string | null; paymentGatewayNames: string[] }> };
      products: { nodes: Array<{ handle: string; variants: { nodes: Array<{ legacyResourceId: string; availableForSale: boolean }> } }> };
    }>({
      userId,
      query: `query CjShopifyUsaCheckoutReadiness {
        shop {
          name
          currencyCode
          billingAddress { countryCodeV2 }
          primaryDomain { url }
          paymentSettings { supportedDigitalWallets }
        }
        orders(first: 10, sortKey: CREATED_AT, reverse: true) {
          nodes { id name createdAt displayFinancialStatus paymentGatewayNames }
        }
        products(first: 10, query: "status:active tag:cj-shopify-usa") {
          nodes { handle variants(first: 5) { nodes { legacyResourceId availableForSale } } }
        }
      }`,
    });

    let checkoutProbe: Record<string, unknown> = { ok: false, reason: 'NO_PRODUCT_VARIANT' };
    const storefront = data.shop.primaryDomain?.url?.replace(/\/$/, '');
    const firstVariant = data.products.nodes
      .flatMap((product) => product.variants.nodes)
      .find((variant) => variant.availableForSale && variant.legacyResourceId);

    if (storefront && firstVariant) {
      try {
        const addRes = await fetch(`${storefront}/cart/add.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: Number(firstVariant.legacyResourceId), quantity: 1 }),
          redirect: 'manual',
        });
        const cookie = addRes.headers.get('set-cookie')?.split(';')[0];
        const checkoutRes = await fetch(`${storefront}/checkout`, {
          headers: cookie ? { cookie } : undefined,
          redirect: 'manual',
        });
        checkoutProbe = {
          ok: addRes.ok && checkoutRes.status >= 300 && checkoutRes.status < 400,
          addToCartStatus: addRes.status,
          checkoutStatus: checkoutRes.status,
          checkoutLocation: checkoutRes.headers.get('location'),
        };
      } catch (error) {
        checkoutProbe = { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    }

    const recentGateways = Array.from(new Set(data.orders.nodes.flatMap((order) => order.paymentGatewayNames || [])));
    res.json({
      ok: true,
      shop: {
        name: data.shop.name,
        country: data.shop.billingAddress?.countryCodeV2 ?? null,
        currencyCode: data.shop.currencyCode,
        primaryDomain: data.shop.primaryDomain?.url ?? null,
        supportedDigitalWallets: data.shop.paymentSettings?.supportedDigitalWallets ?? [],
      },
      recentOrders: data.orders.nodes,
      recentGateways,
      checkoutProbe,
      paypalApiVisibility: {
        canConfirmConfiguredGatewayByApi: false,
        reason: 'Shopify Admin API exposes supported wallets and historical order gateway names, but not the complete enabled gateway list for a new store.',
      },
      recommendations: [
        'Verify PayPal Express Checkout in Shopify Admin > Settings > Payments > Additional payment methods.',
        'Run a live low-value test order with PayPal after switching to a PayPal Business account.',
        'Keep a second card-capable provider active if available for Chile-based operations.',
      ],
    });
  } catch (error) {
    next(error);
  }
});

// ── GET/POST /analytics/profit-guard ──────────────────────────────────────────
router.get('/analytics/profit-guard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaProfitGuardService.run(userId, {
      dryRun: true,
      limit: Number(req.query.limit ?? 500),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/analytics/profit-guard/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaProfitGuardService.run(userId, {
      dryRun: req.body?.dryRun !== false,
      limit: Number(req.body?.limit ?? 500),
      pauseUnsafe: req.body?.pauseUnsafe === true,
      minIncreaseUsd: Number(req.body?.minIncreaseUsd ?? 0.5),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/analytics/profit-guard/enrich-shipping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaProfitGuardService.enrichMissingShipping(userId, {
      dryRun: req.body?.dryRun !== false,
      limit: Number(req.body?.limit ?? 25),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ── GET /analytics/social-autopilot ───────────────────────────────────────────
router.get('/analytics/social-autopilot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const products = await prisma.cjShopifyUsaListing.findMany({
      where: {
        userId,
        status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
        shopifyHandle: { not: null },
      },
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    const candidates = products.map((listing) => ({
      listingId: listing.id,
      title: listing.product.title,
      handle: listing.shopifyHandle,
      priceUsd: Number(listing.listedPriceUsd ?? 0),
      url: listing.shopifyHandle ? `https://shop.ivanreseller.com/products/${listing.shopifyHandle}` : null,
      caption: [
        `PawVault pick: ${listing.product.title}`,
        'Built for practical pet-parent routines.',
        '#PawVault #PetSupplies #DogProducts #CatProducts #PetParents',
      ].join('\n'),
    }));

    res.json({
      ok: true,
      status: 'READY_FOR_OAUTH',
      platforms: {
        instagram: {
          required: ['Instagram Business or Creator account', 'Meta app with instagram_content_publish', 'OAuth token for @PawVault'],
          canAutoPublishNow: false,
        },
        tiktok: {
          required: ['TikTok developer app', 'Content Posting API approval', 'video.publish scope', 'OAuth token for @PawVault'],
          canAutoPublishNow: false,
        },
      },
      candidates,
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /analytics/social-autopilot/generate-caption ────────────────────────
router.post('/analytics/social-autopilot/generate-caption', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { listingId, title, priceUsd, handle, platform = 'pinterest' } = req.body;
    
    // Lazy load the service to prevent circular deps or early loading issues
    const { cjShopifyUsaContentService } = await import('../services/cj-shopify-usa-content.service');
    
    const caption = await cjShopifyUsaContentService.generateSocialCaption({
      title: String(title),
      priceUsd: Number(priceUsd),
      handle: String(handle),
      platform: platform as 'pinterest' | 'instagram' | 'tiktok',
    });
    
    res.json({ ok: true, caption });
  } catch (error) {
    next(error);
  }
});

export default router;
