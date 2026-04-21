import '../src/config/env';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import {
  aliexpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
} from '../src/services/aliexpress-dropshipping-api.service';
import { aliExpressSupplierAdapter } from '../src/services/adapters/aliexpress-supplier.adapter';
import { selectMlChileFreightOption } from '../src/utils/ml-chile-freight-selector';
import { calculateMlChileLandedCost } from '../src/utils/ml-chile-landed-cost';
import { classifyMlChileRutReadiness } from '../src/utils/ml-chile-rut-readiness';
import { getMlChilePreSaleBlockers } from '../src/utils/ml-chile-issue-queues';
import {
  classifyAliExpressFreightCompatibility,
  type AliExpressFreightAppFamily,
  type AliExpressFreightTokenFamily,
} from '../src/utils/aliexpress-freight-compatibility';
import {
  buildAliExpressCapabilitySnapshot,
  classifyMlChileStrategicPause,
} from '../src/utils/aliexpress-capability-model';

const prisma = new PrismaClient();

type CredentialBlob = Record<string, unknown> | null;

interface FreightStrategy {
  key: string;
  appFamily: AliExpressFreightAppFamily;
  tokenFamily: AliExpressFreightTokenFamily;
  credentials: Record<string, unknown>;
  credentialSource: string;
  tokenSource: string;
}

function parseProductData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toDecimalNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

function summarize(name: string, creds: CredentialBlob) {
  const appKey = String(creds?.appKey || creds?.clientId || '').trim();
  const accessToken = String(creds?.accessToken || creds?.access_token || '').trim();
  const refreshToken = String(creds?.refreshToken || creds?.refresh_token || '').trim();
  return {
    apiName: name,
    present: Boolean(creds),
    appKeyPrefix: appKey ? `${appKey.slice(0, 6)}...` : null,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
  };
}

function hasSessionToken(creds: CredentialBlob): boolean {
  return Boolean(String(creds?.accessToken || creds?.access_token || '').trim());
}

function fingerprint(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 12);
}

function classifySecretConsistency(creds: CredentialBlob): 'secret_consistent' | 'secret_suspect' | 'unknown' {
  const loadedAppKey = String(creds?.appKey || creds?.clientId || '').trim();
  const loadedSecret = String(creds?.appSecret || creds?.clientSecret || '').trim();
  const envAppKey = String(process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
  const envSecret = String(process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim();

  if (!loadedAppKey || !loadedSecret || !envAppKey || !envSecret) return 'unknown';
  return loadedAppKey === envAppKey && fingerprint(loadedSecret) === fingerprint(envSecret)
    ? 'secret_consistent'
    : 'secret_suspect';
}

function classifySessionBindingConsistency(
  strategy: FreightStrategy,
  accountInfoUsable: boolean | null,
): 'session_binding_consistent' | 'session_binding_suspect' | 'unknown' {
  if (strategy.tokenFamily === 'none') return 'unknown';
  if (strategy.appFamily !== 'dropshipping') return 'session_binding_suspect';
  if (accountInfoUsable === false) return 'session_binding_suspect';
  if (accountInfoUsable === true) return 'session_binding_consistent';
  return 'unknown';
}

function buildFreightStrategies(params: {
  affiliate: CredentialBlob;
  dropshipping: CredentialBlob;
}): FreightStrategy[] {
  const strategies: FreightStrategy[] = [];
  const affiliateAppKey = String(params.affiliate?.appKey || params.affiliate?.clientId || '').trim();
  const affiliateAppSecret = String(params.affiliate?.appSecret || params.affiliate?.clientSecret || '').trim();
  const dsAppKey = String(params.dropshipping?.appKey || params.dropshipping?.clientId || '').trim();
  const dsAppSecret = String(params.dropshipping?.appSecret || params.dropshipping?.clientSecret || '').trim();
  const dsAccessToken = String(params.dropshipping?.accessToken || params.dropshipping?.access_token || '').trim();
  const dsRefreshToken = String(params.dropshipping?.refreshToken || params.dropshipping?.refresh_token || '').trim();

  if (dsAppKey && dsAppSecret && dsAccessToken) {
    strategies.push({
      key: 'dropshipping_native',
      appFamily: 'dropshipping',
      tokenFamily: 'dropshipping_session',
      credentials: {
        appKey: dsAppKey,
        appSecret: dsAppSecret,
        accessToken: dsAccessToken,
        refreshToken: dsRefreshToken || undefined,
        sandbox: false,
        credentialSource: 'credentials_manager:aliexpress-dropshipping',
        tokenSource: 'credentials_manager:aliexpress-dropshipping:accessToken',
      },
      credentialSource: 'credentials_manager:aliexpress-dropshipping',
      tokenSource: 'credentials_manager:aliexpress-dropshipping:accessToken',
    });
  }

  if (affiliateAppKey && affiliateAppSecret && dsAccessToken) {
    strategies.push({
      key: 'affiliate_app_with_dropshipping_session',
      appFamily: 'affiliate',
      tokenFamily: 'dropshipping_session',
      credentials: {
        appKey: affiliateAppKey,
        appSecret: affiliateAppSecret,
        accessToken: dsAccessToken,
        refreshToken: dsRefreshToken || undefined,
        sandbox: false,
        credentialSource: 'credentials_manager:aliexpress-affiliate',
        tokenSource: 'credentials_manager:aliexpress-dropshipping:accessToken',
      },
      credentialSource: 'credentials_manager:aliexpress-affiliate',
      tokenSource: 'credentials_manager:aliexpress-dropshipping:accessToken',
    });
  }

  if (affiliateAppKey && affiliateAppSecret) {
    strategies.push({
      key: 'affiliate_app_without_session',
      appFamily: 'affiliate',
      tokenFamily: 'none',
      credentials: {
        appKey: affiliateAppKey,
        appSecret: affiliateAppSecret,
        sandbox: false,
        credentialSource: 'credentials_manager:aliexpress-affiliate',
        tokenSource: 'none',
      },
      credentialSource: 'credentials_manager:aliexpress-affiliate',
      tokenSource: 'none',
    });
  }

  return strategies;
}

async function canUseDropshippingAccountInfo(strategy: FreightStrategy): Promise<boolean | null> {
  if (strategy.key !== 'dropshipping_native') return null;
  try {
    aliexpressDropshippingAPIService.setCredentials(strategy.credentials as any);
    await aliexpressDropshippingAPIService.getAccountInfo();
    return true;
  } catch (error: any) {
    if (/invalidapipath/i.test(String(error?.message || ''))) {
      return null;
    }
    return false;
  }
}

function extractFreightError(error: any): {
  lastFailureReason: string;
  aliCode: string | number | null;
  aliSubCode: string | null;
} {
  return {
    lastFailureReason: String(error?.aliMsg || error?.message || 'unknown_freight_error'),
    aliCode: error?.aliCode ?? null,
    aliSubCode: error?.aliSubCode ?? null,
  };
}

async function main() {
  const userId = Number(process.argv[2] || 1);
  const limit = Math.max(1, Number(process.argv[3] || 8));

  await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60_000 });
  const [affiliate, dropshipping] = await Promise.all([
    CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production'),
    CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production'),
  ]);

  const strategies = buildFreightStrategies({
    affiliate: affiliate as CredentialBlob,
    dropshipping: dropshipping as CredentialBlob,
  });
  if (!strategies.length) {
    throw new Error('No AliExpress freight strategies could be built from live credentials.');
  }

  const products = await prisma.product.findMany({
    where: {
      userId,
      targetCountry: 'CL',
      aliexpressSku: {
        not: null,
      },
    },
    select: {
      id: true,
      title: true,
      status: true,
      aliexpressUrl: true,
      aliexpressSku: true,
      aliexpressPrice: true,
      targetCountry: true,
      originCountry: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      productData: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: limit,
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    userId,
    endpointReached: true,
    sampleSize: products.length,
    credentialShapes: {
      affiliate: summarize('aliexpress-affiliate', affiliate as CredentialBlob),
      dropshipping: summarize('aliexpress-dropshipping', dropshipping as CredentialBlob),
    },
    strategyAudit: [] as Array<Record<string, unknown>>,
    requestVariantAudit: [] as Array<Record<string, unknown>>,
    chosenStrategy: null as Record<string, unknown> | null,
    scannedAtDiscovery: products.length,
    admittedAfterChileSupportGate: products.length,
    admittedAfterClSkuGate: products.length,
    admittedAfterFreightGate: 0,
    nearValid: 0,
    validated: 0,
    freightSummaryByCode: {} as Record<string, number>,
    bestCandidateResult: null as Record<string, unknown> | null,
    bestFailedCandidate: null as Record<string, unknown> | null,
    rows: [] as Array<Record<string, unknown>>,
  };

  const firstProduct = products[0];
  if (!firstProduct) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const firstProductId = aliExpressSupplierAdapter.getProductIdFromUrl(firstProduct.aliexpressUrl || '');
  if (!firstProductId) {
    throw new Error('Could not parse AliExpress product id from the first admitted ML Chile candidate.');
  }

  let chosenStrategy: FreightStrategy | null = null;
  for (const strategy of strategies) {
    const accountInfoUsable = await canUseDropshippingAccountInfo(strategy);
    const secretConsistency =
      strategy.appFamily === 'dropshipping'
        ? classifySecretConsistency(dropshipping as CredentialBlob)
        : 'unknown';
    const sessionBindingConsistency = classifySessionBindingConsistency(strategy, accountInfoUsable);
    if (strategy.tokenFamily === 'none') {
      const compatibility = classifyAliExpressFreightCompatibility({
        appFamily: strategy.appFamily,
        tokenFamily: strategy.tokenFamily,
        hasAccessToken: false,
        hasRefreshToken: false,
        accountInfoUsable: accountInfoUsable ?? undefined,
        lastFailureReason: 'missing_session_for_freight_call',
        secretConsistency,
        sessionBindingConsistency,
      });
      summary.strategyAudit.push({
        strategy: strategy.key,
        appFamily: strategy.appFamily,
        tokenFamily: strategy.tokenFamily,
        accountInfoUsable,
        secretConsistency,
        sessionBindingConsistency,
        credentialSource: strategy.credentialSource,
        tokenSource: strategy.tokenSource,
        freightOptionsCount: 0,
        ...compatibility,
      });
      continue;
    }

    try {
      aliexpressDropshippingAPIService.setCredentials(strategy.credentials as any);
      const probe = await aliexpressDropshippingAPIService.calculateBuyerFreight({
        countryCode: 'CL',
        productId: firstProductId,
        productNum: 1,
        sendGoodsCountryCode: String(firstProduct.originCountry || 'CN').trim().toUpperCase() || 'CN',
        skuId: String(firstProduct.aliexpressSku || '').trim() || undefined,
        price: String(toDecimalNumber(firstProduct.aliexpressPrice) || ''),
        priceCurrency: 'USD',
      }, { forensicProbeAllVariants: true });
      const compatibility = classifyAliExpressFreightCompatibility({
        appFamily: strategy.appFamily,
        tokenFamily: strategy.tokenFamily,
        hasAccessToken: true,
        hasRefreshToken: Boolean(String(strategy.credentials.refreshToken || '').trim()),
        accountInfoUsable: accountInfoUsable ?? undefined,
        freightOptionsCount: probe.options.length,
        secretConsistency,
        sessionBindingConsistency,
      });
      summary.strategyAudit.push({
        strategy: strategy.key,
        appFamily: strategy.appFamily,
        tokenFamily: strategy.tokenFamily,
        accountInfoUsable,
        secretConsistency,
        sessionBindingConsistency,
        credentialSource: strategy.credentialSource,
        tokenSource: strategy.tokenSource,
        freightOptionsCount: probe.options.length,
        rawOptionNodeCount: probe.rawOptionNodeCount,
        rawTopKeys: probe.rawTopKeys,
        requestForensics: probe.requestForensics ?? null,
        variantAudit: probe.variantAudit ?? [],
        capabilitySnapshot: buildAliExpressCapabilitySnapshot({
          affiliateAppPresent: Boolean(affiliate),
          affiliateHasSession: hasSessionToken(affiliate as CredentialBlob),
          dropshippingAppPresent: Boolean(dropshipping),
          dropshippingHasSession: hasSessionToken(dropshipping as CredentialBlob),
          freightCompatibility: compatibility.freightCredentialCompatibility,
          freightLastFailureReason: compatibility.freightLastFailureReason,
        }),
        ...compatibility,
      });
      if (!summary.requestVariantAudit.length && strategy.key === 'dropshipping_native') {
        summary.requestVariantAudit = (probe.variantAudit ?? []) as Array<Record<string, unknown>>;
      }
      if (!chosenStrategy && probe.options.length > 0) {
        chosenStrategy = strategy;
      }
    } catch (error: any) {
      const extracted = extractFreightError(error);
      const compatibility = classifyAliExpressFreightCompatibility({
        appFamily: strategy.appFamily,
        tokenFamily: strategy.tokenFamily,
        hasAccessToken: true,
        hasRefreshToken: Boolean(String(strategy.credentials.refreshToken || '').trim()),
        accountInfoUsable: accountInfoUsable ?? undefined,
        lastFailureReason: extracted.lastFailureReason,
        aliCode: extracted.aliCode,
        aliSubCode: extracted.aliSubCode,
        secretConsistency,
        sessionBindingConsistency,
      });
      summary.strategyAudit.push({
        strategy: strategy.key,
        appFamily: strategy.appFamily,
        tokenFamily: strategy.tokenFamily,
        accountInfoUsable,
        secretConsistency,
        sessionBindingConsistency,
        credentialSource: strategy.credentialSource,
        tokenSource: strategy.tokenSource,
        freightOptionsCount: 0,
        aliCode: extracted.aliCode,
        aliSubCode: extracted.aliSubCode,
        freightDiagnostics: error?.freightDiagnostics ?? null,
        variantAudit: error?.freightVariantAudit ?? [],
        capabilitySnapshot: buildAliExpressCapabilitySnapshot({
          affiliateAppPresent: Boolean(affiliate),
          affiliateHasSession: hasSessionToken(affiliate as CredentialBlob),
          dropshippingAppPresent: Boolean(dropshipping),
          dropshippingHasSession: hasSessionToken(dropshipping as CredentialBlob),
          freightCompatibility: compatibility.freightCredentialCompatibility,
          freightLastFailureReason: compatibility.freightLastFailureReason,
        }),
        ...compatibility,
      });
      if (!summary.requestVariantAudit.length && strategy.key === 'dropshipping_native') {
        summary.requestVariantAudit = (error?.freightVariantAudit ?? []) as Array<Record<string, unknown>>;
      }
      if (!chosenStrategy && strategy.key === 'dropshipping_native') {
        chosenStrategy = strategy;
      }
    }
  }

  chosenStrategy = chosenStrategy || strategies[0];
  summary.chosenStrategy = {
    strategy: chosenStrategy.key,
    appFamily: chosenStrategy.appFamily,
    tokenFamily: chosenStrategy.tokenFamily,
    credentialSource: chosenStrategy.credentialSource,
    tokenSource: chosenStrategy.tokenSource,
  };
  aliexpressDropshippingAPIService.setCredentials(chosenStrategy.credentials as any);

  const rutReadiness = classifyMlChileRutReadiness({
    placeOrderSupportsRutNo: false,
    shippingAddressSupportsRutNo: false,
  });

  for (const product of products) {
    const aeProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '');
    if (!aeProductId) continue;

    const sendGoodsCountryCode = String(product.originCountry || 'CN').trim().toUpperCase() || 'CN';
    const productData = parseProductData(product.productData);
    try {
      const freightQuotes = await aliexpressDropshippingAPIService.calculateBuyerFreight({
        countryCode: 'CL',
        productId: aeProductId,
        productNum: 1,
        sendGoodsCountryCode,
        skuId: String(product.aliexpressSku || '').trim() || undefined,
        price: String(toDecimalNumber(product.aliexpressPrice) || ''),
        priceCurrency: 'USD',
      }, { forensicProbeAllVariants: true });
      const selection = selectMlChileFreightOption(freightQuotes.options);
      const compatibility = classifyAliExpressFreightCompatibility({
        appFamily: chosenStrategy.appFamily,
        tokenFamily: chosenStrategy.tokenFamily,
        hasAccessToken: chosenStrategy.tokenFamily !== 'none',
        hasRefreshToken: Boolean(String(chosenStrategy.credentials.refreshToken || '').trim()),
        freightOptionsCount: freightQuotes.options.length,
        secretConsistency:
          chosenStrategy.appFamily === 'dropshipping'
            ? classifySecretConsistency(dropshipping as CredentialBlob)
            : 'unknown',
        sessionBindingConsistency: classifySessionBindingConsistency(chosenStrategy, true),
      });
      const capabilitySnapshot = buildAliExpressCapabilitySnapshot({
        affiliateAppPresent: Boolean(affiliate),
        affiliateHasSession: hasSessionToken(affiliate as CredentialBlob),
        dropshippingAppPresent: Boolean(dropshipping),
        dropshippingHasSession: hasSessionToken(dropshipping as CredentialBlob),
        freightCompatibility: compatibility.freightCredentialCompatibility,
        freightLastFailureReason: compatibility.freightLastFailureReason,
      });
      const strategicPause = classifyMlChileStrategicPause({
        freightCapability: capabilitySnapshot.freightQuoteCapability,
      });

      if (!selection.selected) {
        increment(summary.freightSummaryByCode, compatibility.freightCredentialCompatibility);
        const updatedMeta = {
          ...productData,
          mlChileRutReadiness: {
            classification: rutReadiness.classification,
            reason: rutReadiness.reason,
            checkedAt: new Date().toISOString(),
          },
          mlChileFreightCompatibility: {
            ...compatibility,
            checkedAt: new Date().toISOString(),
          },
          mlChileAliExpressCapabilities: capabilitySnapshot,
          mlChileStrategicPause: {
            ...strategicPause,
            checkedAt: new Date().toISOString(),
          },
          mlChileFreight: {
            freightSummaryCode: 'freight_quote_missing_for_cl',
            checkedAt: new Date().toISOString(),
            targetCountry: 'CL',
            sendGoodsCountryCode,
            freightOptionsCount: freightQuotes.options.length,
            rawOptionNodeCount: freightQuotes.rawOptionNodeCount,
            rawTopKeys: freightQuotes.rawTopKeys,
          },
        };
        await prisma.product.update({
          where: { id: product.id },
          data: {
            productData: JSON.stringify(updatedMeta),
          },
        });

        const failed = {
          id: product.id,
          title: product.title,
          productId: aeProductId,
          blocker: compatibility.freightCredentialCompatibility,
        };
        if (!summary.bestFailedCandidate) summary.bestFailedCandidate = failed;
        summary.rows.push({
          productId: aeProductId,
          skuId: product.aliexpressSku,
          targetCountry: 'CL',
          sendGoodsCountryCode,
          freightOptionsCount: freightQuotes.options.length,
          selectedServiceName: null,
          selectedFreightAmount: null,
          selectedFreightCurrency: null,
          appFamily: chosenStrategy.appFamily,
          tokenFamily: chosenStrategy.tokenFamily,
          compatibilityClassification: compatibility.freightCredentialCompatibility,
          candidateStatusAfterFreightIntegration: 'freight_quote_missing_for_cl',
        });
        continue;
      }

      summary.admittedAfterFreightGate += 1;
      increment(summary.freightSummaryByCode, 'freight_quote_found_for_cl');
      const landedCost = calculateMlChileLandedCost({
        productCost: toDecimalNumber(product.aliexpressPrice),
        shippingCost: selection.selected.freightAmount,
        currency: selection.selected.freightCurrency,
      });

      const updatedMeta = {
        ...productData,
        mlChileRutReadiness: {
          classification: rutReadiness.classification,
          reason: rutReadiness.reason,
          checkedAt: new Date().toISOString(),
        },
        mlChileFreightCompatibility: {
          ...compatibility,
          checkedAt: new Date().toISOString(),
        },
        mlChileAliExpressCapabilities: capabilitySnapshot,
        mlChileStrategicPause: {
          ...strategicPause,
          checkedAt: new Date().toISOString(),
        },
        mlChileFreight: {
          freightSummaryCode: 'freight_quote_found_for_cl',
          checkedAt: new Date().toISOString(),
          targetCountry: 'CL',
          sendGoodsCountryCode,
          freightOptionsCount: freightQuotes.options.length,
          rawOptionNodeCount: freightQuotes.rawOptionNodeCount,
          rawTopKeys: freightQuotes.rawTopKeys,
          selectedServiceName: selection.selected.serviceName,
          selectedFreightAmount: selection.selected.freightAmount,
          selectedFreightCurrency: selection.selected.freightCurrency,
          selectedEstimatedDeliveryTime: selection.selected.estimatedDeliveryTime ?? null,
          selectionReason: selection.reason,
        },
        mlChileLandedCost: {
          costCurrency: landedCost.costCurrency,
          importTaxMethod: landedCost.importTaxMethod,
          importTaxAmount: landedCost.importTaxAmount,
          totalCost: landedCost.totalCost,
          landedCostCompleteness: landedCost.landedCostCompleteness,
          checkedAt: new Date().toISOString(),
        },
      };

      const updated = await prisma.product.update({
        where: { id: product.id },
        data: {
          shippingCost: landedCost.shippingCost,
          importTax: landedCost.importTaxAmount,
          totalCost: landedCost.totalCost,
          productData: JSON.stringify(updatedMeta),
        },
        select: {
          id: true,
          title: true,
          status: true,
          targetCountry: true,
          shippingCost: true,
          importTax: true,
          totalCost: true,
          aliexpressSku: true,
        },
      });

      const blockers = getMlChilePreSaleBlockers(updated);
      if (blockers.length === 0) summary.validated += 1;
      if (blockers.length === 1) summary.nearValid += 1;

      const candidate = {
        id: product.id,
        title: product.title,
        productId: aeProductId,
        skuId: product.aliexpressSku,
        selectedServiceName: selection.selected.serviceName,
        selectedFreightAmount: selection.selected.freightAmount,
        selectedFreightCurrency: selection.selected.freightCurrency,
        blockers,
      };
      if (!summary.bestCandidateResult) summary.bestCandidateResult = candidate;
      if (!summary.bestFailedCandidate && blockers.length > 0) summary.bestFailedCandidate = candidate;

      summary.rows.push({
        productId: aeProductId,
        skuId: product.aliexpressSku,
        targetCountry: 'CL',
        sendGoodsCountryCode,
        requestForensics: freightQuotes.requestForensics ?? null,
        variantAudit: freightQuotes.variantAudit ?? [],
        freightOptionsCount: freightQuotes.options.length,
        selectedServiceName: selection.selected.serviceName,
        selectedFreightAmount: selection.selected.freightAmount,
        selectedFreightCurrency: selection.selected.freightCurrency,
        appFamily: chosenStrategy.appFamily,
        tokenFamily: chosenStrategy.tokenFamily,
        compatibilityClassification: compatibility.freightCredentialCompatibility,
        candidateStatusAfterFreightIntegration: blockers.length === 0 ? 'validated' : blockers.join(','),
      });
    } catch (error: any) {
      const extracted = extractFreightError(error);
      const compatibility = classifyAliExpressFreightCompatibility({
        appFamily: chosenStrategy.appFamily,
        tokenFamily: chosenStrategy.tokenFamily,
        hasAccessToken: chosenStrategy.tokenFamily !== 'none',
        hasRefreshToken: Boolean(String(chosenStrategy.credentials.refreshToken || '').trim()),
        lastFailureReason: extracted.lastFailureReason,
        aliCode: extracted.aliCode,
        aliSubCode: extracted.aliSubCode,
        secretConsistency:
          chosenStrategy.appFamily === 'dropshipping'
            ? classifySecretConsistency(dropshipping as CredentialBlob)
            : 'unknown',
        sessionBindingConsistency: classifySessionBindingConsistency(chosenStrategy, true),
      });
      const capabilitySnapshot = buildAliExpressCapabilitySnapshot({
        affiliateAppPresent: Boolean(affiliate),
        affiliateHasSession: hasSessionToken(affiliate as CredentialBlob),
        dropshippingAppPresent: Boolean(dropshipping),
        dropshippingHasSession: hasSessionToken(dropshipping as CredentialBlob),
        freightCompatibility: compatibility.freightCredentialCompatibility,
        freightLastFailureReason: compatibility.freightLastFailureReason,
      });
      const strategicPause = classifyMlChileStrategicPause({
        freightCapability: capabilitySnapshot.freightQuoteCapability,
      });
      increment(summary.freightSummaryByCode, compatibility.freightCredentialCompatibility);

      const updatedMeta = {
        ...productData,
        mlChileRutReadiness: {
          classification: rutReadiness.classification,
          reason: rutReadiness.reason,
          checkedAt: new Date().toISOString(),
        },
        mlChileFreightCompatibility: {
          ...compatibility,
          checkedAt: new Date().toISOString(),
        },
        mlChileAliExpressCapabilities: capabilitySnapshot,
        mlChileStrategicPause: {
          ...strategicPause,
          checkedAt: new Date().toISOString(),
        },
        mlChileFreight: {
          freightSummaryCode: 'freight_quote_missing_for_cl',
          checkedAt: new Date().toISOString(),
          targetCountry: 'CL',
          sendGoodsCountryCode,
          freightOptionsCount: 0,
          selectedServiceName: null,
          selectedFreightAmount: null,
          selectedFreightCurrency: null,
        },
      };
      await prisma.product.update({
        where: { id: product.id },
        data: {
          productData: JSON.stringify(updatedMeta),
        },
      });

      const failed = {
        id: product.id,
        title: product.title,
        productId: aeProductId,
        aliCode: extracted.aliCode,
        aliSubCode: extracted.aliSubCode,
        blocker: compatibility.freightCredentialCompatibility,
        freightLastFailureReason: compatibility.freightLastFailureReason,
      };
      if (!summary.bestFailedCandidate) summary.bestFailedCandidate = failed;

      summary.rows.push({
        productId: aeProductId,
        skuId: product.aliexpressSku,
        targetCountry: 'CL',
        sendGoodsCountryCode,
        freightDiagnostics: error?.freightDiagnostics ?? null,
        variantAudit: error?.freightVariantAudit ?? [],
        freightOptionsCount: 0,
        selectedServiceName: null,
        selectedFreightAmount: null,
        selectedFreightCurrency: null,
        appFamily: chosenStrategy.appFamily,
        tokenFamily: chosenStrategy.tokenFamily,
        compatibilityClassification: compatibility.freightCredentialCompatibility,
        freightLastFailureReason: compatibility.freightLastFailureReason,
        aliCode: extracted.aliCode,
        aliSubCode: extracted.aliSubCode,
        candidateStatusAfterFreightIntegration: compatibility.freightCredentialCompatibility,
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('[forensic-ml-chile-freight-quotes] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
