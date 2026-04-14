/**
 * Phase B — unified discovery from AliExpress Affiliate + CJ (Open API listV2).
 * Honors OPPORTUNITY_CJ_SUPPLY_MODE and per-user opportunitySupplierPreference.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { regionToCountryCode } from './destination.service';
import { normalizeOpportunityPagination, OPPORTUNITY_MAX_PAGE } from '../utils/opportunity-search-pagination';
import { aliexpressAffiliateAPIService } from './aliexpress-affiliate-api.service';
import { mapAffiliateProductToDiscoveryRow } from './opportunity-affiliate-mapping';
import userSettingsService from './user-settings.service';
import { cjSearchForOpportunityRows } from '../modules/cj-ebay/services/cj-opportunity-supply.service';
import type {
  CjSupplyEnvMode,
  SupplyDiscoveryContext,
  SupplyDiscoveryResult,
  SupplyDiscoveryRow,
  SupplyRowMeta,
} from './supply-quote.types';
import { rankDedupeSupplyRows } from './supply-quote-rank';

export { rankDedupeSupplyRows } from './supply-quote-rank';

function metaAffiliate(row: SupplyDiscoveryRow, opts: Partial<SupplyRowMeta>): SupplyRowMeta {
  const hasShip = row.shippingCost != null && row.shippingCost > 0;
  return {
    supplier: 'aliexpress',
    unitCostTruth: 'listing',
    shippingTruth: hasShip ? 'confirmed' : 'estimated',
    landedCostTruth: 'estimated_partial',
    preferredSupplierSatisfied: Boolean(opts.preferredSupplierSatisfied),
    fallbackUsed: Boolean(opts.fallbackUsed),
    quoteConfidence: hasShip ? 'high' : 'medium',
    providersAttempted: ['aliexpress_affiliate'],
    shippingEstimateStatus: 'estimated',
    shippingSource: hasShip ? 'affiliate_product_detail' : 'default_commerce_settings',
    costSemantics: {
      unitCostKind: 'listing_price',
      shippingKind: hasShip ? 'affiliate_confirmed' : 'estimated_default',
      landedKind: 'landed_estimate',
    },
  };
}

function metaCj(_row: SupplyDiscoveryRow, opts: Partial<SupplyRowMeta>): SupplyRowMeta {
  return {
    supplier: 'cj',
    unitCostTruth: 'listing',
    shippingTruth: 'estimated',
    landedCostTruth: 'estimated_partial',
    preferredSupplierSatisfied: Boolean(opts.preferredSupplierSatisfied),
    fallbackUsed: Boolean(opts.fallbackUsed),
    quoteConfidence: 'medium',
    providersAttempted: ['cj_open_api_listv2'],
    shippingEstimateStatus: 'estimated',
    shippingSource: 'default_commerce_settings',
    costSemantics: {
      unitCostKind: 'listing_price',
      shippingKind: 'estimated_default',
      landedKind: 'landed_estimate',
    },
  };
}

function attachAffiliateMeta(rows: SupplyDiscoveryRow[], flags: Partial<SupplyRowMeta>): SupplyDiscoveryRow[] {
  return rows.map((r) => ({
    ...r,
    supplyMeta: metaAffiliate(r, flags),
  }));
}

function attachCjMeta(rows: SupplyDiscoveryRow[], flags: Partial<SupplyRowMeta>, defaultShip: number): SupplyDiscoveryRow[] {
  return rows.map((r) => ({
    ...r,
    shippingCost: r.shippingCost ?? defaultShip,
    supplyMeta: metaCj(r, flags),
  }));
}

export class SupplyQuoteService {
  private async fetchAffiliateRows(ctx: SupplyDiscoveryContext): Promise<SupplyDiscoveryRow[]> {
    const { userId, query, maxItems, pageNo, baseCurrency, region, environment } = ctx;
    const { CredentialsManager } = await import('./credentials-manager.service');
    const appKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
    const appSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim();
    const affiliateCreds =
      appKey && appSecret
        ? {
            appKey,
            appSecret,
            trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
            sandbox: false,
          }
        : await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', environment);

    if (!affiliateCreds) {
      logger.info('[supply-quote] Affiliate credentials not available', { userId });
      return [];
    }

    aliexpressAffiliateAPIService.setCredentials(affiliateCreds as Parameters<typeof aliexpressAffiliateAPIService.setCredentials>[0]);
    const countryCode = regionToCountryCode(region);
    const affiliateProviderPagesPerUi = Math.max(
      1,
      Math.min(3, parseInt(process.env.OPPORTUNITY_AFFILIATE_PROVIDER_PAGES_PER_UI || '2', 10) || 2)
    );
    const filterMapped = (p: SupplyDiscoveryRow) =>
      p.title &&
      (p.price || 0) > 0 &&
      p.productUrl &&
      p.productUrl.length > 10 &&
      p.images &&
      p.images.length > 0;

    const { pageNo: uiPage } = normalizeOpportunityPagination(maxItems, pageNo);
    const providerStart = 1 + (uiPage - 1) * affiliateProviderPagesPerUi;
    const seenKeys = new Set<string>();
    const merged: SupplyDiscoveryRow[] = [];

    for (let step = 0; step < affiliateProviderPagesPerUi && merged.length < maxItems; step++) {
      const pn = providerStart + step;
      if (pn > OPPORTUNITY_MAX_PAGE) break;

      let affiliateResult = await aliexpressAffiliateAPIService.searchProducts({
        keywords: query,
        pageNo: pn,
        pageSize: 20,
        targetCurrency: baseCurrency || 'USD',
        shipToCountry: countryCode,
      });
      let rawProducts = affiliateResult?.products;
      let apiProducts = Array.isArray(rawProducts) ? rawProducts : [];

      if (apiProducts.length === 0 && countryCode && countryCode !== 'US') {
        logger.info('[supply-quote] Affiliate 0 for shipToCountry — retry global', { countryCode, queryLen: query.length, pn });
        affiliateResult = await aliexpressAffiliateAPIService.searchProducts({
          keywords: query,
          pageNo: pn,
          pageSize: 20,
          targetCurrency: baseCurrency || 'USD',
        });
        rawProducts = affiliateResult?.products;
        apiProducts = Array.isArray(rawProducts) ? rawProducts : [];
      }

      if (apiProducts.length === 0) break;

      const enrichShipTo =
        countryCode && String(countryCode).trim().length >= 2 ? String(countryCode).toUpperCase() : 'US';
      await aliexpressAffiliateAPIService.enrichProductsWithDetailShipping(apiProducts, {
        shipToCountry: enrichShipTo,
        targetCurrency: baseCurrency || 'USD',
      });
      const mapped = apiProducts
        .map((p) => mapAffiliateProductToDiscoveryRow(p, baseCurrency) as SupplyDiscoveryRow)
        .filter(filterMapped);
      for (const row of mapped) {
        const key = String(row.productId || row.productUrl || '').trim();
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        merged.push(row);
        if (merged.length >= maxItems) break;
      }
      if (apiProducts.length < 20) break;
    }

    return merged.slice(0, maxItems);
  }

  private async fetchCjRows(ctx: SupplyDiscoveryContext): Promise<SupplyDiscoveryRow[]> {
    const raw = await cjSearchForOpportunityRows(
      ctx.userId,
      ctx.query,
      ctx.maxItems,
      ctx.baseCurrency || 'USD',
      { skipEnvGate: true }
    );
    return raw as unknown as SupplyDiscoveryRow[];
  }

  async discoverForOpportunities(ctx: SupplyDiscoveryContext): Promise<SupplyDiscoveryResult> {
    const preference = await userSettingsService.getOpportunitySupplierPreference(ctx.userId);
    const cjMode = env.OPPORTUNITY_CJ_SUPPLY_MODE as CjSupplyEnvMode;
    const cjAllowed = cjMode !== 'off';
    const sourcesTried: string[] = [];
    const notes: string[] = [];
    let degradedPartial = false;

    const runAffiliate = async (): Promise<SupplyDiscoveryRow[]> => {
      try {
        const rows = await this.fetchAffiliateRows(ctx);
        if (rows.length > 0) sourcesTried.push('aliexpress_affiliate');
        return rows;
      } catch (e) {
        degradedPartial = true;
        notes.push('affiliate_error');
        logger.warn('[supply-quote] Affiliate discovery failed', {
          userId: ctx.userId,
          message: e instanceof Error ? e.message : String(e),
        });
        return [];
      }
    };

    const runCj = async (): Promise<SupplyDiscoveryRow[]> => {
      if (!cjAllowed) return [];
      try {
        const rows = await this.fetchCjRows(ctx);
        if (rows.length > 0) sourcesTried.push('cj');
        return rows;
      } catch (e) {
        degradedPartial = true;
        notes.push('cj_error');
        logger.warn('[supply-quote] CJ discovery failed', {
          userId: ctx.userId,
          message: e instanceof Error ? e.message : String(e),
        });
        return [];
      }
    };

    let affiliateRows: SupplyDiscoveryRow[] = [];
    let cjRows: SupplyDiscoveryRow[] = [];

    if (preference === 'cj' && cjAllowed) {
      cjRows = await runCj();
      if (cjRows.length === 0) {
        notes.push('cj_preferred_empty_fallback_affiliate');
        affiliateRows = await runAffiliate();
      }
    } else if (preference === 'cj' && !cjAllowed) {
      notes.push('cj_preference_but_cj_mode_off');
      affiliateRows = await runAffiliate();
    } else {
      affiliateRows = await runAffiliate();
      const fetchCjSecondary =
        cjAllowed &&
        ((cjMode === 'merge' && affiliateRows.length > 0) ||
          (cjMode === 'fallback' && affiliateRows.length === 0) ||
          (preference === 'auto' && cjMode === 'merge') ||
          (preference === 'auto' && cjMode === 'fallback' && affiliateRows.length === 0));
      if (fetchCjSecondary) {
        cjRows = await runCj();
      }
    }

    const affiliateAfterCjFallback =
      preference === 'cj' && cjRows.length === 0 && affiliateRows.length > 0;
    affiliateRows = attachAffiliateMeta(affiliateRows, {
      preferredSupplierSatisfied: preference === 'aliexpress' || preference === 'auto',
      fallbackUsed: affiliateAfterCjFallback,
    });
    cjRows = attachCjMeta(
      cjRows,
      {
        preferredSupplierSatisfied: preference === 'cj',
        fallbackUsed: preference === 'aliexpress' && cjRows.length > 0,
      },
      ctx.defaultShippingUsd
    );

    let out: SupplyDiscoveryRow[] = [];

    if (preference === 'aliexpress') {
      out = [...affiliateRows];
      if (cjRows.length > 0) {
        const seen = new Set(out.map((p) => String(p.productId || p.productUrl || '').trim()).filter(Boolean));
        for (const r of cjRows) {
          if (out.length >= ctx.maxItems) break;
          const cid = String(r.productId || '').trim();
          if (cid && seen.has(`cj:${cid}`)) continue;
          if (cid) seen.add(`cj:${cid}`);
          out.push(r);
        }
        out = out.slice(0, ctx.maxItems);
      }
      if (affiliateRows.length === 0 && cjRows.length === 0) degradedPartial = true;
    } else if (preference === 'cj') {
      const primary = cjRows.length > 0 ? cjRows : affiliateRows;
      out = primary.slice(0, ctx.maxItems);
      if (primary.length === 0) degradedPartial = true;
    } else {
      const combined = [...affiliateRows, ...cjRows];
      if (combined.length === 0) {
        degradedPartial = true;
        out = [];
      } else if (combined.length === 1) {
        out = combined.slice(0, ctx.maxItems);
      } else {
        out = rankDedupeSupplyRows(combined, ctx.maxItems, ctx.defaultShippingUsd);
      }
    }

    logger.info('[supply-quote] discovery completed', {
      userId: ctx.userId,
      preference,
      cjMode,
      affiliateCount: affiliateRows.length,
      cjCount: cjRows.length,
      outCount: out.length,
      sourcesTried: [...new Set(sourcesTried)],
      degradedPartial,
    });

    return {
      rows: out,
      diagnostics: {
        sourcesTried: [...new Set(sourcesTried)],
        preference,
        cjSupplyMode: cjMode,
        notes,
        degradedPartial,
      },
    };
  }
}

export const supplyQuoteService = new SupplyQuoteService();
