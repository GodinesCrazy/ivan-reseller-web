#!/usr/bin/env npx tsx
/**
 * Ciclo de verificación: búsqueda de 1 oportunidad → números como en import
 * → calculateEbayPrice → calculateFeeIntelligence (eBay US).
 *
 * Uso (desde backend/):
 *   npx tsx scripts/verify-opportunity-ebay-cycle.ts
 *   npx tsx scripts/verify-opportunity-ebay-cycle.ts --query="phone holder"
 *   npx tsx scripts/verify-opportunity-ebay-cycle.ts --persist   (crea y borra 1 producto en BD)
 */

import { prisma } from '../src/config/database';
import opportunityFinder from '../src/services/opportunity-finder.service';
import {
  calculateEbayPrice,
  calculateFeeIntelligence,
  getMinAllowedMargin,
  isProfitabilityAllowed,
} from '../src/services/marketplace-fee-intelligence.service';
import { getEffectiveShippingCostForPublish } from '../src/utils/shipping.utils';
import type { OpportunityItem } from '../src/services/opportunity-finder.types';

function parseQuery(): string {
  const raw = process.argv.find((a) => a.startsWith('--query='));
  if (!raw) return 'usb cable';
  const v = raw.slice('--query='.length).trim();
  return v.replace(/^["']|["']$/g, '') || 'usb cable';
}

const persist = process.argv.includes('--persist');

function printStage1(opp: OpportunityItem, real: boolean) {
  console.log(real ? '(Oportunidad real #1)' : '(Artículo sintético — sin resultados API)');
  console.log('Título:', opp.title?.slice(0, 100));
  console.log('URLs:', (opp.aliexpressUrl || opp.productUrl || '').slice(0, 90));
  console.log('--- Monedas y costos ---');
  console.log('  costUsd (precio proveedor):     ', opp.costUsd, opp.costCurrency || '');
  console.log('  baseCurrency (usuario):         ', opp.baseCurrency);
  console.log('  costInBaseCurrency:             ', opp.costInBaseCurrency ?? '—');
  console.log('  shippingCost / importTax:       ', opp.shippingCost ?? '—', '/', opp.importTax ?? '—');
  console.log('  totalCost (proveedor):          ', opp.totalCost ?? '—');
  console.log('  totalCostInBaseCurrency:        ', opp.totalCostInBaseCurrency ?? '—');
  console.log('--- Precio sugerido (comparable) ---');
  console.log('  suggestedPriceUsd (moneda base):', opp.suggestedPriceUsd);
  console.log('  suggestedPriceAmount / Currency:', opp.suggestedPriceAmount, opp.suggestedPriceCurrency);
  console.log('--- Rentabilidad (pipeline oportunidades) ---');
  console.log('  profitMargin (fracción):        ', opp.profitMargin, '→', (Number(opp.profitMargin) * 100).toFixed(2) + '%');
  console.log('  roiPercentage:                  ', opp.roiPercentage);
  console.log('  netProfitInBaseCurrency:        ', opp.netProfitInBaseCurrency ?? '—');
  console.log('  feesConsidered:                 ', JSON.stringify(opp.feesConsidered ?? {}, null, 2));
  console.log('  commercialTruth:                ', JSON.stringify(opp.commercialTruth ?? {}, null, 2));
  if (opp.competitionDiagnostics?.length) {
    console.log('  competitionDiagnostics[0]:      ', JSON.stringify(opp.competitionDiagnostics[0], null, 2));
  }
}

async function main() {
  const query = parseQuery();
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' Verificación ciclo Oportunidad → Import → Pricing eBay');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('Query:', query, '| --persist:', persist);
  console.log('MIN_ALLOWED_MARGIN (env o default):', getMinAllowedMargin(), '%\n');

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error('No hay usuario activo en la BD. Ejecuta seed o crea un usuario.');
    await prisma.$disconnect();
    process.exit(1);
  }
  const userId = user.id;
  console.log('Usuario:', userId, user.email || '');

  console.log('\n── ETAPA 1: findOpportunities (Affiliate + análisis, sin Google Trends) ──\n');
  let opp: OpportunityItem | null = null;
  let real = false;
  const t0 = Date.now();
  try {
    const list = await opportunityFinder.findOpportunities(userId, {
      query,
      maxItems: 5,
      skipTrendsValidation: true,
      region: 'us',
      marketplaces: ['ebay', 'mercadolibre'],
      environment: 'production',
    });
    console.log(`Duración búsqueda: ${((Date.now() - t0) / 1000).toFixed(2)}s | Resultados: ${list.length}`);
    if (list.length > 0) {
      opp = list[0] as OpportunityItem;
      real = true;
    }
  } catch (e: any) {
    console.warn('findOpportunities falló:', e?.message || e);
  }

  if (!opp) {
    console.log('\n⚠ Sin oportunidades reales; se usa artículo sintético para etapas 2–4.\n');
    opp = {
      title: '[SINTÉTICO] Soporte smartphone — verificación de ciclo',
      sourceMarketplace: 'aliexpress',
      aliexpressUrl: `https://www.aliexpress.com/item/${Date.now()}.html`,
      productUrl: `https://www.aliexpress.com/item/${Date.now()}.html`,
      costUsd: 6.5,
      costAmount: 6.5,
      costCurrency: 'USD',
      baseCurrency: 'USD',
      suggestedPriceUsd: 19.99,
      suggestedPriceAmount: 19.99,
      suggestedPriceCurrency: 'USD',
      profitMargin: 0.25,
      roiPercentage: 120,
      competitionLevel: 'medium',
      marketDemand: 'medium',
      confidenceScore: 0.65,
      targetMarketplaces: ['ebay'],
      feesConsidered: {
        productCost: 6.5,
        marketplaceFee: 2.5,
        paymentFee: 0.8,
        shippingCost: 2.99,
        importTax: 0,
        otherCosts: 0,
        totalCost: 12.79,
      },
      generatedAt: new Date().toISOString(),
      shippingCost: 2.99,
      importTax: 0,
      commercialTruth: {
        sourceCost: 'exact',
        suggestedPrice: 'estimated',
        profitMargin: 'estimated',
        roi: 'estimated',
        competitionLevel: 'unavailable',
      },
    } as OpportunityItem;
  }

  printStage1(opp, real);

  const aliexpressPrice = Number(opp.costUsd);
  const suggestedFromOpp = Number(opp.suggestedPriceUsd);
  const shipping = Number(opp.shippingCost ?? 0);
  const importTax = Number(opp.importTax ?? 0);
  const totalCostSupplier = aliexpressPrice + shipping + importTax;

  console.log('\n── ETAPA 2: Payload equivalente a Importar desde Oportunidades ──\n');
  const importPayload = {
    aliexpressPrice,
    suggestedPrice: suggestedFromOpp,
    shippingCost: shipping || undefined,
    importTax: importTax || undefined,
    totalCost: totalCostSupplier > aliexpressPrice ? totalCostSupplier : undefined,
    currency: opp.baseCurrency || 'USD',
    targetMarketplaces: opp.targetMarketplaces,
  };
  console.log(JSON.stringify(importPayload, null, 2));

  console.log('\n── ETAPA 3: calculateEbayPrice (mismo criterio que publish sin customData.price) ──\n');
  const productLike = { aliexpressPrice, shippingCost: shipping || undefined };
  const shippingEffective = getEffectiveShippingCostForPublish(productLike as any);
  console.log('getEffectiveShippingCostForPublish (estándar paquete pequeño si sin dato):', shippingEffective, 'USD');
  const ebayPricing = calculateEbayPrice({
    aliexpressCostUsd: Math.max(0.01, aliexpressPrice),
    shippingCostUsd: Math.max(0, shippingEffective),
    targetMarginMultiplier:
      Math.max(1.01, Number(process.env.EBAY_TARGET_MARGIN_MULTIPLIER) || 1.2),
  });
  console.log(JSON.stringify(ebayPricing, null, 2));

  console.log('\n── ETAPA 4: Fee intelligence eBay US (precio lista = suggestedPriceUsd de etapa 3) ──\n');
  const listPrice = ebayPricing.suggestedPriceUsd;
  const supplierCostForFees =
    Number(opp.totalCost) > 0
      ? Number(opp.totalCost)
      : aliexpressPrice + shippingEffective;
  const fi = calculateFeeIntelligence({
    marketplace: 'ebay',
    listingPrice: listPrice,
    supplierCost: supplierCostForFees,
    shippingCostToCustomer: shippingEffective,
    currency: 'USD',
  });
  console.log(JSON.stringify(fi, null, 2));
  const allowed = isProfitabilityAllowed(fi);
  console.log(
    `\n→ Margen esperado sobre venta: ${fi.expectedMarginPercent.toFixed(2)}% | ` +
      `¿≥ mínimo (${getMinAllowedMargin()}%)? ${allowed ? 'SÍ — pasaría gate de publicación' : 'NO — se saltaría publicación'}`
  );

  console.log('\n── ETAPA 5: Comparación explícita oportunidad vs precio eBay calculado ──\n');
  console.log('  Precio comparable/base (oportunidad):', suggestedFromOpp, opp.baseCurrency);
  console.log('  Precio listado eBay (calculateEbayPrice):', listPrice, 'USD');
  console.log(
    '  Nota: eBay usa fórmula USD propia; el comparable puede ser otro marketplace/moneda.'
  );

  if (persist) {
    console.log('\n── ETAPA 6 (--persist): createProduct + rollback ──\n');
    const { ProductService } = await import('../src/services/product.service');
    const ps = new ProductService();
    const uniqueUrl = `https://www.aliexpress.com/item/verify-cycle-${Date.now()}.html`;
    const created = await ps.createProduct(userId, {
      title: `[VERIFY] ${(opp.title || 'test').slice(0, 120)}`,
      description: 'verify-opportunity-ebay-cycle',
      aliexpressUrl: uniqueUrl,
      aliexpressPrice,
      suggestedPrice: suggestedFromOpp,
      imageUrl: 'https://placehold.co/500x500.png',
      currency: opp.baseCurrency || 'USD',
      shippingCost: shipping || undefined,
      importTax: importTax || undefined,
      totalCost: importPayload.totalCost,
      importSource: 'opportunity_search',
    });
    const row = await prisma.product.findUnique({
      where: { id: created.id },
      select: {
        id: true,
        aliexpressPrice: true,
        suggestedPrice: true,
        shippingCost: true,
        importTax: true,
        totalCost: true,
        status: true,
      },
    });
    console.log('Producto creado:', JSON.stringify(row, null, 2));
    await prisma.product.delete({ where: { id: created.id } });
    console.log('Producto eliminado (rollback OK).');
  } else {
    console.log('\n(Sin --persist: no se escribe en productos. Añade --persist para probar createProduct.)');
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' Verificación terminada');
  console.log('══════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
