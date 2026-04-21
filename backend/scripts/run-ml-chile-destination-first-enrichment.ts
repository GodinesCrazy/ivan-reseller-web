import { PrismaClient } from '@prisma/client';
import {
  persistPreventivePublishPreparation,
  prepareProductForSafePublishing,
} from '../src/services/pre-publish-validator.service';
import { getMlChilePreSaleBlockers } from '../src/utils/ml-chile-issue-queues';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { evaluateMlChileSkuAdmission } from '../src/utils/ml-chile-cl-sku-admission';
import { evaluateMlChileDiscoveryAdmission } from '../src/utils/ml-chile-discovery-admission';

const prisma = new PrismaClient();

const BANNED_TITLE_TERMS = [
  'battery',
  'batteries',
  'glass',
  'mirror',
  'bulb',
  'lamp',
  'sofa',
  'chair',
  'table',
  'oversize',
  'fragile',
  'brand',
];

function isLowRiskTitle(title: string): boolean {
  const value = title.toLowerCase();
  return !BANNED_TITLE_TERMS.some((term) => value.includes(term));
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapErrorToBlockerCodes(message: string): string[] {
  const normalized = message.toLowerCase();
  const blockers = new Set<string>();

  if (normalized.includes('target country')) {
    blockers.add('target_country_not_cl');
  }
  if (normalized.includes('shipping cost')) {
    blockers.add('missing_shipping_cost');
  }
  if (normalized.includes('import tax')) {
    blockers.add('missing_import_tax');
  }
  if (normalized.includes('total cost') || normalized.includes('financial completeness')) {
    blockers.add('missing_total_cost');
  }
  if (normalized.includes('sku')) {
    blockers.add('missing_aliexpress_sku');
  }
  if (normalized.includes('profit') || normalized.includes('margin')) {
    blockers.add('margin_invalid');
  }
  if (
    normalized.includes('language') ||
    normalized.includes('currency') ||
    normalized.includes('marketplace destination') ||
    normalized.includes('resolved safely')
  ) {
    blockers.add('marketplace_context_invalid');
  }
  if (
    normalized.includes('api is not connected') ||
    normalized.includes('supplier api error') ||
    normalized.includes('access token') ||
    normalized.includes('not configured')
  ) {
    blockers.add('auth_blocked');
  }

  if (blockers.size === 0) blockers.add('status_not_validated_ready');
  return Array.from(blockers);
}

async function main() {
  const userId = Number(process.argv[2] || 1);
  const limit = Number(process.argv[3] || 10);
  const discoveryGateSummaryByCode: Record<string, number> = {};
  const clSkuGateSummaryByCode: Record<string, number> = {};

  const rawCandidates = await prisma.product.findMany({
    where: {
      userId,
      isPublished: false,
      status: { in: ['APPROVED', 'LEGACY_UNVERIFIED', 'PENDING'] },
      aliexpressUrl: { contains: '.html' },
    },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      productData: true,
      aliexpressUrl: true,
      aliexpressSku: true,
      aliexpressPrice: true,
      importTax: true,
      currency: true,
      targetCountry: true,
      shippingCost: true,
      suggestedPrice: true,
      finalPrice: true,
      status: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  const candidateSet = rawCandidates
    .filter((product) => isLowRiskTitle(product.title || ''))
    .filter((product) => {
      const listPriceUsd = toNumber(product.finalPrice ?? product.suggestedPrice);
      return listPriceUsd >= 25 && listPriceUsd <= 45;
    })
    .slice(0, Math.max(limit * 5, 25));

  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production',
  )) as Record<string, unknown> | null;
  if (!creds?.accessToken) {
    throw new Error('AliExpress Dropshipping production credentials are required for the ML Chile clean batch.');
  }
  aliexpressDropshippingAPIService.setCredentials(creds as any);

  const discoveryAdmittedCandidates: Array<typeof candidateSet[number] & { productInfo: any }> = [];
  const gatedCandidates: Array<typeof candidateSet[number] & { admittedSkuId: string }> = [];
  const preGateRejections: Array<Record<string, unknown>> = [];

  for (const product of candidateSet) {
    const productIdMatch = product.aliexpressUrl.match(/[\/_](\d+)\.html/);
    if (!productIdMatch) {
      admissionSummaryByCode.supplier_data_incomplete =
        (admissionSummaryByCode.supplier_data_incomplete || 0) + 1;
      preGateRejections.push({
        productId: product.id,
        title: product.title,
        admissionCode: 'supplier_data_incomplete',
        reason: 'AliExpress URL does not expose a valid productId.',
      });
      continue;
    }

    let productInfo: any;
    try {
      productInfo = await aliexpressDropshippingAPIService.getProductInfo(productIdMatch[1], {
        localCountry: 'CL',
        localLanguage: 'es',
      });
    } catch (error: any) {
      admissionSummaryByCode.supplier_data_incomplete =
        (admissionSummaryByCode.supplier_data_incomplete || 0) + 1;
      preGateRejections.push({
        productId: product.id,
        title: product.title,
        admissionCode: 'supplier_data_incomplete',
        reason: error?.message || String(error),
      });
      continue;
    }

    const discoveryAdmission = evaluateMlChileDiscoveryAdmission(productInfo);
    discoveryGateSummaryByCode[discoveryAdmission.code] =
      (discoveryGateSummaryByCode[discoveryAdmission.code] || 0) + 1;

    if (!discoveryAdmission.admitted) {
      preGateRejections.push({
        productId: product.id,
        title: product.title,
        admissionStage: 'discovery_gate',
        admissionCode: discoveryAdmission.code,
        reason: discoveryAdmission.reason,
      });
      continue;
    }

    discoveryAdmittedCandidates.push({
      ...product,
      productInfo,
    });

    const admission = evaluateMlChileSkuAdmission(productInfo);
    clSkuGateSummaryByCode[admission.code] = (clSkuGateSummaryByCode[admission.code] || 0) + 1;

    if (!admission.admitted || !admission.skuId) {
      preGateRejections.push({
        productId: product.id,
        title: product.title,
        admissionStage: 'cl_sku_gate',
        admissionCode: admission.code,
        reason: admission.reason,
      });
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        targetCountry: 'CL',
        aliexpressSku: admission.skuId,
      },
    });

    gatedCandidates.push({
      ...product,
      targetCountry: 'CL',
      aliexpressSku: admission.skuId,
      admittedSkuId: admission.skuId,
    });
  }

  const results: Array<Record<string, unknown>> = [];
  const rejectionSummaryByCode: Record<string, number> = {};
  let nearValid = 0;
  let validated = 0;

  for (const product of gatedCandidates) {
    const listingSalePrice = toNumber(product.finalPrice ?? product.suggestedPrice);

    try {
      const preparation = await prepareProductForSafePublishing({
        userId,
        product,
        marketplace: 'mercadolibre',
        credentials: { siteId: 'MLC' },
        listingSalePrice,
      });

      await persistPreventivePublishPreparation({
        productId: product.id,
        preparation,
      });

      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: 'VALIDATED_READY',
          targetCountry: 'CL',
          aliexpressSku: product.admittedSkuId,
        },
      });

      const updated = await prisma.product.findUnique({
        where: { id: product.id },
        select: {
          id: true,
          status: true,
          targetCountry: true,
          shippingCost: true,
          importTax: true,
          totalCost: true,
          aliexpressSku: true,
        },
      });

      const blockers = updated ? getMlChilePreSaleBlockers(updated) : ['status_not_validated_ready'];
      if (blockers.length === 0) {
        validated += 1;
      } else {
        nearValid += 1;
      }

      results.push({
        productId: product.id,
        title: product.title,
        outcome: blockers.length === 0 ? 'validated' : 'near-valid',
        admittedSkuId: product.admittedSkuId,
        blockers,
        targetCountry: updated?.targetCountry ?? null,
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      const blockers = mapErrorToBlockerCodes(message);
      if (blockers.length === 1) nearValid += 1;
      for (const code of blockers) {
        rejectionSummaryByCode[code] = (rejectionSummaryByCode[code] || 0) + 1;
      }
      results.push({
        productId: product.id,
        title: product.title,
        outcome: 'rejected',
        admittedSkuId: product.admittedSkuId,
        blockers,
        message,
      });
    }
  }

  const rejected = results.filter((row) => row.outcome === 'rejected').length;
  const bestNearValidCandidate =
    results
      .filter((row) => row.outcome === 'near-valid' || row.outcome === 'rejected')
      .sort((a, b) => {
        const aCount = Array.isArray(a.blockers) ? a.blockers.length : 99;
        const bCount = Array.isArray(b.blockers) ? b.blockers.length : 99;
        return aCount - bCount;
      })[0] || null;

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        strategyUsed: 'destination-first ML Chile enrichment with low-risk AliExpress batch',
        candidateSet: candidateSet.map((product) => ({
          id: product.id,
          title: product.title,
          status: product.status,
          listingSalePrice: toNumber(product.finalPrice ?? product.suggestedPrice),
        })),
        scannedAtDiscovery: candidateSet.length,
        admittedAfterChileSupportGate: discoveryAdmittedCandidates.length,
        admittedAfterClSkuGate: gatedCandidates.length,
        rejectedBeforeEnrichment: preGateRejections.length,
        rejected,
        nearValid,
        validated,
        discoveryGateSummaryByCode,
        clSkuGateSummaryByCode,
        rejectionSummaryByCode,
        bestNearValidCandidate,
        preGateRejections,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('[run-ml-chile-destination-first-enrichment] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
