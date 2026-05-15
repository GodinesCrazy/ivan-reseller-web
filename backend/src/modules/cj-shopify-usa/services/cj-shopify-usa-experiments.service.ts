import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { CJ_SHOPIFY_USA_LISTING_STATUS } from '../cj-shopify-usa.constants';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { cjShopifyUsaProfitGuardService } from './cj-shopify-usa-profit-guard.service';

type ExperimentType = 'TITLE' | 'MAIN_IMAGE' | 'PRICE' | 'DESCRIPTION' | 'SOCIAL_CAPTION';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function trace(userId: number, message: string, meta: Record<string, unknown>) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      route: 'experiments',
      step: 'experiments.product',
      message,
      meta: meta as Prisma.InputJsonValue,
    },
  });
}

export const cjShopifyUsaExperimentsService = {
  async list(userId: number, status?: string) {
    const experiments = await prisma.cjShopifyUsaProductExperiment.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: { listing: { include: { product: true } }, variants: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return { ok: true, experiments };
  },

  async create(userId: number, input: {
    listingId: number;
    type: string;
    hypothesis?: string;
    variants?: Array<{ label?: string; payload?: Record<string, unknown> }>;
  }) {
    const type = String(input.type || '').toUpperCase() as ExperimentType;
    if (!['TITLE', 'MAIN_IMAGE', 'PRICE', 'DESCRIPTION', 'SOCIAL_CAPTION'].includes(type)) {
      throw new Error('Tipo de experimento no soportado.');
    }
    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: { userId, id: Number(input.listingId) },
      include: { product: true, evaluation: true, shippingQuote: true },
    });
    if (!listing) throw new Error('Listing no encontrado.');
    if (![CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE, CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED, CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING].includes(listing.status as any)) {
      throw new Error('Solo se crean experimentos sobre productos publicados o pausados.');
    }

    const profitGuard = await cjShopifyUsaProfitGuardService.run(userId, { dryRun: true, limit: 500 });
    const issue = profitGuard.issues.find((item) => item.listingId === listing.id && item.action === 'PAUSE_UNSAFE');
    if (issue) throw new Error(`Profit Guard bloquea experimento: ${issue.reason}`);

    const variants = (input.variants ?? []).slice(0, 4).filter((variant) => variant.payload && Object.keys(variant.payload).length > 0);
    if (variants.length < 1) throw new Error('Debes definir al menos una variante.');

    const experiment = await prisma.cjShopifyUsaProductExperiment.create({
      data: {
        userId,
        listingId: listing.id,
        type,
        hypothesis: str(input.hypothesis).slice(0, 1000),
        baseline: {
          title: listing.product.title,
          priceUsd: num(listing.listedPriceUsd),
          shopifyProductId: listing.shopifyProductId,
          shopifyVariantId: listing.shopifyVariantId,
          createdFrom: 'manual',
        } as Prisma.InputJsonValue,
        guardrails: {
          minMarginPct: listing.evaluation?.estimatedMarginPct ? Number(listing.evaluation.estimatedMarginPct) : null,
          shippingKnown: Boolean(listing.shippingQuote),
          noUnsafeProfitGuardIssue: true,
          minSampleViews: 50,
        } as Prisma.InputJsonValue,
        variants: {
          create: variants.map((variant, idx) => ({
            userId,
            label: str(variant.label, `Variante ${idx + 1}`).slice(0, 80),
            payload: variant.payload as Prisma.InputJsonValue,
          })),
        },
      },
      include: { variants: true },
    });
    await trace(userId, 'experiment.created', { experimentId: experiment.id, listingId: listing.id, type });
    return { ok: true, experiment };
  },

  async start(userId: number, id: string) {
    const experiment = await prisma.cjShopifyUsaProductExperiment.findFirst({
      where: { userId, id },
      include: { variants: true, listing: true },
    });
    if (!experiment) throw new Error('Experimento no encontrado.');
    if (experiment.status !== 'DRAFT' && experiment.status !== 'STOPPED') throw new Error(`No se puede iniciar desde estado ${experiment.status}.`);
    if (!experiment.listing.shopifyProductId) throw new Error('Listing sin Shopify Product ID.');
    const updated = await prisma.cjShopifyUsaProductExperiment.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date(), stoppedAt: null },
      include: { variants: true },
    });
    await trace(userId, 'experiment.started', { experimentId: id, listingId: experiment.listingId });
    return { ok: true, experiment: updated };
  },

  async stop(userId: number, id: string) {
    const experiment = await prisma.cjShopifyUsaProductExperiment.findFirst({ where: { userId, id } });
    if (!experiment) throw new Error('Experimento no encontrado.');
    const updated = await prisma.cjShopifyUsaProductExperiment.update({
      where: { id },
      data: { status: 'STOPPED', stoppedAt: new Date() },
      include: { variants: true },
    });
    await trace(userId, 'experiment.stopped', { experimentId: id });
    return { ok: true, experiment: updated };
  },

  async applyWinner(userId: number, id: string, variantId?: string) {
    const experiment = await prisma.cjShopifyUsaProductExperiment.findFirst({
      where: { userId, id },
      include: { variants: true, listing: { include: { evaluation: true } } },
    });
    if (!experiment) throw new Error('Experimento no encontrado.');
    const variant = variantId
      ? experiment.variants.find((item) => item.id === variantId)
      : [...experiment.variants].sort((a, b) => (b.purchases - a.purchases) || (b.addToCarts - a.addToCarts) || (b.views - a.views))[0];
    if (!variant) throw new Error('Variante ganadora no encontrada.');
    const totalViews = experiment.variants.reduce((sum, item) => sum + item.views, 0);
    if (totalViews < 50) throw new Error('Muestra insuficiente: se requieren al menos 50 vistas agregadas.');
    if (!experiment.listing.shopifyProductId) throw new Error('Listing sin Shopify Product ID.');

    const payload = variant.payload as Record<string, unknown>;
    if (experiment.type === 'PRICE') {
      const price = num(payload.priceUsd);
      if (price <= 0) throw new Error('Precio ganador inválido.');
      const currentPrice = num(experiment.listing.listedPriceUsd);
      const marginPct = num(experiment.listing.evaluation?.estimatedMarginPct);
      if (price < currentPrice && marginPct < 15) {
        throw new Error('Guardrail: no se baja precio con margen menor a 15%.');
      }
      if (!experiment.listing.shopifyVariantId) throw new Error('Listing sin Shopify Variant ID.');
      await cjShopifyUsaAdminService.updateVariantPrice({
        userId,
        productId: experiment.listing.shopifyProductId,
        variantId: experiment.listing.shopifyVariantId,
        price,
      });
      await prisma.cjShopifyUsaListing.update({ where: { id: experiment.listingId }, data: { listedPriceUsd: price } });
    } else if (experiment.type === 'TITLE') {
      const title = str(payload.title).slice(0, 180);
      if (!title) throw new Error('Título ganador inválido.');
      await cjShopifyUsaAdminService.updateProductDetails({ userId, productId: experiment.listing.shopifyProductId, title });
    } else if (experiment.type === 'DESCRIPTION') {
      const descriptionHtml = str(payload.descriptionHtml || payload.description).slice(0, 8000);
      if (!descriptionHtml) throw new Error('Descripción ganadora inválida.');
      await cjShopifyUsaAdminService.updateProductDetails({ userId, productId: experiment.listing.shopifyProductId, descriptionHtml });
    } else {
      await trace(userId, 'experiment.winner_recorded_without_shopify_mutation', {
        experimentId: id,
        variantId: variant.id,
        type: experiment.type,
      });
    }

    const updated = await prisma.cjShopifyUsaProductExperiment.update({
      where: { id },
      data: {
        status: 'WINNER_APPLIED',
        stoppedAt: new Date(),
        winnerVariantId: variant.id,
        decisionReason: 'Winner applied with conservative guardrails.',
      },
      include: { variants: true },
    });
    await trace(userId, 'experiment.winner_applied', { experimentId: id, variantId: variant.id, type: experiment.type });
    return { ok: true, experiment: updated };
  },
};
