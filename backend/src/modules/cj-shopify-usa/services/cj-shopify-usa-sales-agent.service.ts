import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_SOCIAL_POST_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';
import { cjShopifyUsaProfitGuardService } from './cj-shopify-usa-profit-guard.service';
import { cjShopifyUsaSocialService } from './cj-shopify-usa-social.service';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service';

type SalesAgentPriority = 'critical' | 'high' | 'medium' | 'low';
type SalesAgentActionType =
  | 'VERIFY_CHECKOUT'
  | 'RUN_PROFIT_GUARD'
  | 'PROMOTE_TOP_PRODUCTS'
  | 'CURATE_SIMILAR_PRODUCTS'
  | 'IMPROVE_PRODUCT_COPY'
  | 'DISCOVER_NEW_PRODUCTS'
  | 'PUBLISH_APPROVED_BACKLOG'
  | 'UNPUBLISH_UNSAFE_LISTINGS';

type SalesAgentAction = {
  id: string;
  type: SalesAgentActionType;
  priority: SalesAgentPriority;
  title: string;
  rationale: string;
  expectedImpact: string;
  risk: 'safe' | 'approval_required' | 'manual_required';
  canExecute: boolean;
  guardrails: string[];
  payload?: Record<string, unknown>;
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value: unknown): number {
  const parsed = n(value);
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

function normalizeTitle(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImageCount(payload: unknown): number {
  const data = payload as Record<string, unknown> | null;
  const images = data?.images;
  if (Array.isArray(images)) return images.length;
  return 0;
}

function titleQuality(title: string): { score: number; issues: string[] } {
  const key = normalizeTitle(title);
  const words = key.split(' ').filter(Boolean);
  const issues: string[] = [];
  let score = 100;

  if (words.length < 4) {
    score -= 25;
    issues.push('titulo demasiado corto');
  }
  if (words.length > 13) {
    score -= 15;
    issues.push('titulo demasiado largo');
  }
  if (/\bpet supplies\b/i.test(title)) {
    score -= 10;
    issues.push('frase generica pet supplies');
  }
  if (/\b(out door|are removable|for dog cat|cat dog)\b/i.test(title)) {
    score -= 20;
    issues.push('ingles poco natural');
  }
  if (/\b(cj[a-z0-9]+|\d{10,})\b/i.test(title)) {
    score -= 25;
    issues.push('ruido de proveedor en titulo');
  }

  return { score: Math.max(0, score), issues };
}

function safeMeta(meta: unknown): Record<string, any> {
  return (meta && typeof meta === 'object' ? meta : {}) as Record<string, any>;
}

async function recordSalesAgentTrace(userId: number, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION,
      message,
      meta,
    },
  });
}

export const cjShopifyUsaSalesAgentService = {
  async dashboard(userId: number) {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      settings,
      listings,
      orders30,
      socialStats,
      latestFunnel,
      recentAgentTraces,
      latestCycle,
      shopifyActiveProductsResult,
    ] = await Promise.all([
      prisma.cjShopifyUsaAccountSettings.findUnique({ where: { userId } }),
      prisma.cjShopifyUsaListing.findMany({
        where: { userId },
        include: {
          product: true,
          evaluation: true,
          shippingQuote: true,
          socialPosts: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 700,
      }),
      prisma.cjShopifyUsaOrder.findMany({
        where: { userId, createdAt: { gte: since30 } },
        select: { totalUsd: true, status: true, createdAt: true },
      }),
      prisma.cjShopifyUsaSocialPost.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.cjShopifyUsaExecutionTrace.findFirst({
        where: {
          userId,
          step: 'analytics.checkout_funnel',
          message: 'analytics.checkout_funnel.snapshot',
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cjShopifyUsaExecutionTrace.findMany({
        where: { userId, step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      prisma.cjShopifyUsaAutomationCycle.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      }),
      cjShopifyUsaAdminService
        .listProducts({ userId, first: 250, maxPages: 20, status: 'ACTIVE' })
        .then((products) => ({ ok: true as const, products }))
        .catch((error) => ({
          ok: false as const,
          products: [],
          error: error instanceof Error ? error.message : String(error),
        })),
    ]);

    const activeListings = listings.filter((listing) => listing.status === CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE);
    const draftListings = listings.filter((listing) => listing.status === CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT);
    const failedStatuses = [
      CJ_SHOPIFY_USA_LISTING_STATUS.FAILED,
      CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED,
    ] as string[];
    const failedListings = listings.filter((listing) =>
      failedStatuses.includes(listing.status),
    );

    const titleGroups = new Map<string, typeof activeListings>();
    for (const listing of activeListings) {
      const key = normalizeTitle(listing.product.title);
      if (!key) continue;
      titleGroups.set(key, [...(titleGroups.get(key) ?? []), listing]);
    }
    const duplicateExactGroups = Array.from(titleGroups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length, titles: rows.map((row) => row.product.title).slice(0, 5) }));

    const shopifyActiveProducts = shopifyActiveProductsResult.products;
    const shopifyTitleGroups = new Map<string, typeof shopifyActiveProducts>();
    for (const product of shopifyActiveProducts) {
      const key = normalizeTitle(product.title);
      if (!key) continue;
      shopifyTitleGroups.set(key, [...(shopifyTitleGroups.get(key) ?? []), product]);
    }
    const shopifyDuplicateExactGroups = Array.from(shopifyTitleGroups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length, titles: rows.map((row) => row.title).slice(0, 5) }));
    const shopifyNoMedia = shopifyActiveProducts.filter((product) => (product.media?.nodes?.length ?? 0) === 0);
    const shopifyProductIds = new Set(shopifyActiveProducts.map((product) => String(product.id)));
    const localUniqueActiveShopifyProductIds = new Set(
      activeListings
        .map((listing) => String(listing.shopifyProductId ?? '').trim())
        .filter(Boolean),
    );
    const activeListingsMissingInShopify = activeListings
      .filter((listing) => listing.shopifyProductId && !shopifyProductIds.has(String(listing.shopifyProductId)))
      .slice(0, 20)
      .map((listing) => ({
        listingId: listing.id,
        title: listing.product.title,
        shopifyProductId: listing.shopifyProductId,
        status: listing.status,
      }));

    const similarFamilies = new Map<string, number>();
    for (const listing of activeListings) {
      const words = normalizeTitle(listing.product.title).split(' ').filter(Boolean);
      const family = words.slice(0, Math.min(3, words.length)).join(' ');
      if (family.length >= 8) similarFamilies.set(family, (similarFamilies.get(family) ?? 0) + 1);
    }
    const crowdedFamilies = Array.from(similarFamilies.entries())
      .filter(([, count]) => count >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([family, count]) => ({ family, count }));

    const copyIssues = activeListings
      .map((listing) => ({
        listingId: listing.id,
        title: listing.product.title,
        handle: listing.shopifyHandle,
        imageCount: extractImageCount(listing.draftPayload),
        ...titleQuality(listing.product.title),
      }))
      .filter((row) => row.score < 80 || row.imageCount === 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12);

    const profitGuard = await cjShopifyUsaProfitGuardService.run(userId, {
      dryRun: true,
      limit: 350,
    });

    const profitGuardIssueByListing = new Map(profitGuard.issues.map((issue) => [issue.listingId, issue]));
    const publishableDrafts = draftListings
      .filter((listing) => listing.evaluation?.decision === 'APPROVED')
      .filter((listing) => extractImageCount(listing.draftPayload) > 0)
      .filter((listing) => !profitGuardIssueByListing.has(listing.id))
      .slice(0, 12)
      .map((listing) => ({
        listingId: listing.id,
        title: listing.product.title,
        priceUsd: n(listing.listedPriceUsd),
        marginPct: n(listing.evaluation?.estimatedMarginPct),
      }));

    const unsafeUnpublishCandidates = profitGuard.issues
      .filter((issue) => issue.action === 'PAUSE_UNSAFE')
      .slice(0, 12)
      .map((issue) => ({
        listingId: issue.listingId,
        title: issue.title,
        reason: issue.reason,
        currentPriceUsd: issue.currentPriceUsd,
        projectedNetProfitUsd: issue.projectedNetProfitUsd,
        projectedNetMarginPct: issue.projectedNetMarginPct,
      }));

    const socialCounts = Object.fromEntries(
      socialStats.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    const promotionCandidates = activeListings
      .filter((listing) => listing.shopifyHandle && n(listing.listedPriceUsd) > 0)
      .filter((listing) => !listing.socialPosts.some((post) => post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS))
      .map((listing) => {
        const quality = titleQuality(listing.product.title);
        const marginPct = n(listing.evaluation?.estimatedMarginPct);
        const imageCount = extractImageCount(listing.draftPayload);
        const score =
          40 +
          Math.min(25, Math.max(0, marginPct)) +
          Math.min(20, quality.score / 5) +
          Math.min(10, imageCount * 2) -
          (listing.shippingQuote ? 0 : 8);
        return {
          listingId: listing.id,
          title: listing.product.title,
          handle: listing.shopifyHandle,
          priceUsd: n(listing.listedPriceUsd),
          marginPct,
          imageCount,
          score: Math.round(score),
          url: `https://shop.ivanreseller.com/products/${listing.shopifyHandle}`,
          caption: [
            `PawVault pick: ${listing.product.title}`,
            'A practical upgrade for everyday pet-parent routines.',
            '#PawVault #PetSupplies #PetParents #DogProducts #CatProducts',
          ].join('\n'),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const funnelMeta = safeMeta(latestFunnel?.meta);
    const visitors = n(funnelMeta.visitors);
    const addToCartRatePct = pct(funnelMeta.addToCartRatePct);
    const checkoutRatePct = pct(funnelMeta.checkoutRatePct);
    const purchaseRatePct = pct(funnelMeta.purchaseRatePct);
    const revenue30 = orders30.reduce((sum, order) => sum + n(order.totalUsd), 0);
    const paidOrders30 = orders30.filter((order) =>
      ['CJ_ORDER_CREATED', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_SHOPIFY', 'COMPLETED'].includes(order.status),
    ).length;

    const actions: SalesAgentAction[] = [];

    if (checkoutRatePct > 0 && purchaseRatePct === 0) {
      actions.push({
        id: 'verify-checkout-paypal',
        type: 'VERIFY_CHECKOUT',
        priority: 'critical',
        title: 'Confirmar checkout real con PayPal',
        rationale: `${checkoutRatePct.toFixed(2)}% llega al checkout y 0% compra; antes de invertir en trafico hay que probar pago real.`,
        expectedImpact: 'Eliminar el bloqueo mas caro: trafico con intencion que no puede pagar.',
        risk: 'manual_required',
        canExecute: false,
        guardrails: ['No gastar en ads hasta completar una compra de prueba', 'Mantener PayPal activo y visible', 'Registrar gateway usado en una orden real'],
      });
    }

    if (profitGuard.reviewRequired > 0 || profitGuard.priceIncreases > 0 || profitGuard.pausedUnsafe > 0) {
      actions.push({
        id: 'run-profit-guard',
        type: 'RUN_PROFIT_GUARD',
        priority: profitGuard.pausedUnsafe > 0 ? 'critical' : 'high',
        title: 'Ejecutar Profit Guard antes de promocionar',
        rationale: `${profitGuard.reviewRequired + profitGuard.priceIncreases + profitGuard.pausedUnsafe} listings requieren revision de margen/precio.`,
        expectedImpact: 'Evita ventas con perdida y protege el margen minimo configurado.',
        risk: 'approval_required',
        canExecute: false,
        guardrails: ['Usar shipping real CJ cuando exista', 'Pausar si no se demuestra margen', 'No bajar precios bajo margen minimo'],
        payload: { issues: profitGuard.issues.slice(0, 8) },
      });
    }

    if (unsafeUnpublishCandidates.length > 0) {
      actions.push({
        id: 'unpublish-unsafe-listings',
        type: 'UNPUBLISH_UNSAFE_LISTINGS',
        priority: 'critical',
        title: 'Despublicar listings con riesgo de perdida',
        rationale: `${unsafeUnpublishCandidates.length} listings tienen senal PAUSE_UNSAFE segun Profit Guard.`,
        expectedImpact: 'Evita ventas no rentables mientras se corrige shipping, precio o costo.',
        risk: 'approval_required',
        canExecute: true,
        guardrails: ['Solo PAUSE_UNSAFE', 'Archiva en Shopify', 'Registra trazabilidad', 'No elimina datos locales'],
        payload: { limit: Math.min(5, unsafeUnpublishCandidates.length), candidates: unsafeUnpublishCandidates.slice(0, 5) },
      });
    }

    if (promotionCandidates.length > 0) {
      actions.push({
        id: 'promote-top-products',
        type: 'PROMOTE_TOP_PRODUCTS',
        priority: 'high',
        title: 'Promocionar productos top en Pinterest',
        rationale: `${promotionCandidates.length} productos activos cumplen criterios para promocion organica segura.`,
        expectedImpact: 'Aumentar visitas reales hacia productos con margen y ficha publicable.',
        risk: 'safe',
        canExecute: true,
        guardrails: ['Solo productos activos', 'Sin post exitoso previo', 'Sin gasto publicitario', 'No modifica precio ni inventario'],
        payload: { limit: Math.min(5, promotionCandidates.length), candidates: promotionCandidates.slice(0, 5) },
      });
    }

    if (crowdedFamilies.length > 0 || duplicateExactGroups.length > 0) {
      actions.push({
        id: 'curate-similar-products',
        type: 'CURATE_SIMILAR_PRODUCTS',
        priority: duplicateExactGroups.length > 0 ? 'high' : 'medium',
        title: 'Curar familias de productos similares',
        rationale: `${duplicateExactGroups.length} duplicados exactos y ${crowdedFamilies.length} familias saturadas detectadas.`,
        expectedImpact: 'Menos confusion, mejor confianza y catalogo mas facil de comprar.',
        risk: 'approval_required',
        canExecute: false,
        guardrails: ['No despublicar ganadores sin evidencia', 'Conservar el producto con mejor margen/imagen', 'Agrupar variantes cuando corresponda'],
        payload: { duplicateExactGroups, crowdedFamilies },
      });
    }

    if (copyIssues.length > 0) {
      actions.push({
        id: 'improve-product-copy',
        type: 'IMPROVE_PRODUCT_COPY',
        priority: 'medium',
        title: 'Mejorar titulos y fichas de baja confianza',
        rationale: `${copyIssues.length} fichas activas tienen senales de titulo debil o media local incompleta.`,
        expectedImpact: 'Mejorar CTR, confianza y conversion antes de llevar trafico.',
        risk: 'approval_required',
        canExecute: false,
        guardrails: ['Titulo natural en ingles', 'Sin codigos CJ', 'Promesa clara y especifica', 'No inventar atributos'],
        payload: { copyIssues },
      });
    }

    if (draftListings.length > 0) {
      actions.push({
        id: 'publish-approved-backlog',
        type: 'PUBLISH_APPROVED_BACKLOG',
        priority: publishableDrafts.length > 0 ? 'high' : 'medium',
        title: 'Revisar backlog de drafts',
        rationale: `${draftListings.length} drafts existen en el flujo; ${publishableDrafts.length} parecen publicables con evaluacion aprobada.`,
        expectedImpact: 'Aumentar catalogo util sin bajar calidad.',
        risk: publishableDrafts.length > 0 ? 'safe' : 'approval_required',
        canExecute: publishableDrafts.length > 0,
        guardrails: ['Validar shipping y stock antes de publicar', 'Evitar duplicados', 'No publicar sin imagen'],
        payload: { draftCount: draftListings.length, publishableDrafts: publishableDrafts.slice(0, 5) },
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: 'discover-new-products',
        type: 'DISCOVER_NEW_PRODUCTS',
        priority: 'medium',
        title: 'Buscar nuevos productos ganadores',
        rationale: 'No hay bloqueos comerciales urgentes; el siguiente paso es ampliar catalogo con discovery controlado.',
        expectedImpact: 'Crear nuevo inventario vendible manteniendo margen y calidad.',
        risk: 'safe',
        canExecute: false,
        guardrails: ['Usar Descubrir IA', 'Exigir imagen/stock/margen', 'No duplicar activos'],
      });
    }

    const sortedActions = actions.sort((a, b) => {
      const weight: Record<SalesAgentPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return weight[b.priority] - weight[a.priority];
    });

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      mode: 'COPILOT_CONTROLLED',
      mission: 'Maximizar ventas rentables de PawVault sin sacrificar margen, calidad ni confianza del comprador.',
      constraints: {
        minMarginPct: n(settings?.minMarginPct ?? settings?.automationMinMarginPct ?? 10),
        minProfitUsd: n(settings?.minProfitUsd ?? 1.5),
        maxShippingUsd: n(settings?.maxShippingUsd ?? 15),
        maxSellPriceUsd: n(settings?.maxSellPriceUsd ?? 45),
        autoSpendAds: false,
        autoPublishSocial: true,
        autoChangePrices: false,
        canPublishWithGuards: true,
        canUnpublishUnsafeWithGuards: true,
      },
      kpis: {
        activeListings: activeListings.length,
        draftListings: draftListings.length,
        failedListings: failedListings.length,
        orders30: orders30.length,
        paidOrders30,
        revenue30Usd: Math.round(revenue30 * 100) / 100,
        visitors,
        addToCartRatePct,
        checkoutRatePct,
        purchaseRatePct,
        socialPublished: socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS] ?? 0,
        socialFailed: socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED] ?? 0,
      },
      health: {
        score: Math.max(
          0,
          Math.min(
            100,
            78 +
              (purchaseRatePct > 0 ? 8 : -8) +
              (profitGuard.reviewRequired === 0 ? 8 : -10) +
              (duplicateExactGroups.length === 0 ? 4 : -10) +
              (promotionCandidates.length > 0 ? 4 : -4),
          ),
        ),
        checkoutRisk: checkoutRatePct > 0 && purchaseRatePct === 0,
        marginRisk: profitGuard.reviewRequired > 0 || profitGuard.pausedUnsafe > 0,
        catalogTrustRisk: copyIssues.length > 0 || duplicateExactGroups.length > 0,
        trafficOpportunity: promotionCandidates.length > 0,
      },
      shopifyTruth: {
        ok: shopifyActiveProductsResult.ok,
        error: 'error' in shopifyActiveProductsResult ? shopifyActiveProductsResult.error : null,
        activeProducts: shopifyActiveProducts.length,
        localActiveListings: activeListings.length,
        localUniqueActiveShopifyProducts: localUniqueActiveShopifyProductIds.size,
        activeDelta: localUniqueActiveShopifyProductIds.size - shopifyActiveProducts.length,
        noMedia: shopifyNoMedia.length,
        duplicateExactGroups: shopifyDuplicateExactGroups.length,
        missingLocalActiveInShopify: activeListingsMissingInShopify.length,
        samples: {
          noMedia: shopifyNoMedia.slice(0, 8).map((product) => ({ id: product.id, title: product.title, handle: product.handle })),
          duplicates: shopifyDuplicateExactGroups.slice(0, 5),
          missingLocalActiveInShopify: activeListingsMissingInShopify,
        },
      },
      learning: {
        lastCycle: latestCycle
          ? {
              id: latestCycle.id,
              status: latestCycle.status,
              published: latestCycle.published,
              draftsCreated: latestCycle.draftsCreated,
              approved: latestCycle.productsApproved,
              errors: latestCycle.errors,
              startedAt: latestCycle.startedAt,
            }
          : null,
        recentActions: recentAgentTraces.map((trace) => ({
          id: trace.id,
          createdAt: trace.createdAt,
          message: trace.message,
          meta: trace.meta,
        })),
        summary: [
          purchaseRatePct === 0
            ? 'No hay aprendizaje de ventas cerradas aun; priorizar checkout y trafico medible.'
            : 'Ya existe conversion; priorizar productos/canales con ventas reales.',
          socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS]
            ? 'Pinterest ya tiene publicaciones exitosas; conviene ampliar solo con productos de mejor score.'
            : 'Aun no hay publicaciones sociales exitosas registradas; empezar con lote pequeno controlado.',
        ],
      },
      promotionCandidates,
      publishableDrafts,
      unsafeUnpublishCandidates,
      actions: sortedActions,
      profitGuard: {
        scanned: profitGuard.scanned,
        okCount: profitGuard.okCount,
        priceIncreases: profitGuard.priceIncreases,
        pausedUnsafe: profitGuard.pausedUnsafe,
        reviewRequired: profitGuard.reviewRequired,
        sampleIssues: profitGuard.issues.slice(0, 8),
      },
      catalog: {
        duplicateExactGroups,
        crowdedFamilies,
        copyIssues,
      },
    };
  },

  async executeAction(userId: number, input: { actionType: SalesAgentActionType; limit?: number }) {
    if (!['PROMOTE_TOP_PRODUCTS', 'PUBLISH_APPROVED_BACKLOG', 'UNPUBLISH_UNSAFE_LISTINGS'].includes(input.actionType)) {
      await recordSalesAgentTrace(userId, 'sales_agent.action.blocked', {
        actionType: input.actionType,
        reason: 'This action requires explicit per-item approval in the current controlled mode.',
      } as Prisma.InputJsonValue);
      return {
        ok: false,
        executed: false,
        requiresApproval: true,
        message: 'Esta accion queda como recomendacion hasta implementar aprobacion granular por item.',
      };
    }

    const dashboard = await this.dashboard(userId);
    const limit = Math.max(1, Math.min(10, Number(input.limit ?? 5)));

    if (input.actionType === 'PUBLISH_APPROVED_BACKLOG') {
      const selected = dashboard.publishableDrafts.slice(0, limit);
      const results: Array<{ listingId: number; title: string; ok: boolean; error?: string }> = [];
      for (const candidate of selected) {
        try {
          await cjShopifyUsaPublishService.publishListing({ userId, listingId: candidate.listingId });
          results.push({ listingId: candidate.listingId, title: candidate.title, ok: true });
        } catch (error) {
          results.push({
            listingId: candidate.listingId,
            title: candidate.title,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await recordSalesAgentTrace(userId, 'sales_agent.action.publish_approved_backlog', {
        requested: selected.length,
        results,
      } as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        published: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
        message: `Publicacion controlada: ${results.filter((result) => result.ok).length} OK, ${results.filter((result) => !result.ok).length} fallidos.`,
      };
    }

    if (input.actionType === 'UNPUBLISH_UNSAFE_LISTINGS') {
      const selected = dashboard.unsafeUnpublishCandidates.slice(0, limit);
      const results: Array<{ listingId: number; title: string; ok: boolean; error?: string }> = [];
      for (const candidate of selected) {
        try {
          await cjShopifyUsaPublishService.unpublishListing({ userId, listingId: candidate.listingId });
          results.push({ listingId: candidate.listingId, title: candidate.title, ok: true });
        } catch (error) {
          results.push({
            listingId: candidate.listingId,
            title: candidate.title,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await recordSalesAgentTrace(userId, 'sales_agent.action.unpublish_unsafe_listings', {
        requested: selected.length,
        results,
      } as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        unpublished: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
        message: `Despublicacion controlada: ${results.filter((result) => result.ok).length} OK, ${results.filter((result) => !result.ok).length} fallidos.`,
      };
    }

    const selected = dashboard.promotionCandidates.slice(0, limit);

    for (const candidate of selected) {
      cjShopifyUsaSocialService.schedulePost({
        userId,
        listingId: candidate.listingId,
        title: candidate.title,
      });
    }

    await recordSalesAgentTrace(userId, 'sales_agent.action.promote_top_products', {
      queued: selected.length,
      listingIds: selected.map((item) => item.listingId),
      titles: selected.map((item) => item.title),
    } as Prisma.InputJsonValue);

    return {
      ok: true,
      executed: true,
      actionType: input.actionType,
      queued: selected.length,
      candidates: selected,
      message: selected.length
        ? `Se encolaron ${selected.length} publicaciones organicas en Pinterest.`
        : 'No hay productos elegibles para promocion segura en este momento.',
    };
  },
};
