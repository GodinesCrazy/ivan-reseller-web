import { trace } from '../utils/boot-trace';
trace('loading competitor-analyzer.service');

import { EbayService } from './ebay.service';
import { AmazonService } from './amazon.service';
import { MercadoLibreService } from './mercadolibre.service';
import { REGION_TO_EBAY_MARKETPLACE, REGION_TO_ML_SITE } from './destination.service';
import { prisma } from '../config/database';
import { MarketplaceService } from './marketplace.service';
import logger from '../config/logger';

export interface MarketplaceListing {
  marketplace: string;
  region: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  condition?: string;
  shippingCost?: number;
  sellerRating?: number;
  salesCount?: number;
}

/** How comparable prices were obtained (for commercial-truth contract). */
export type CompetitionDataSource =
  | 'ebay_browse_user_oauth'
  | 'ebay_browse_application_token'
  | 'mercadolibre_public_catalog'
  | 'amazon_catalog'
  | 'unknown';

export interface MarketAnalysis {
  marketplace: string;
  region: string;
  currency: string;
  listingsFound: number;
  prices: number[];
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  competitivePrice: number;
  topListings: MarketplaceListing[];
  /** Provenance of listing prices for UI / audits */
  dataSource?: CompetitionDataSource;
}

function resolveEbayAppKeys(raw: Record<string, unknown>): { appId: string; certId: string } {
  const appId = String(raw.appId || process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim();
  const certId = String(raw.certId || process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim();
  return { appId, certId };
}

/** Long AliExpress titles often return zero ML/eBay hits; shorten for catalog search. */
function shortenForMarketplaceSearch(title: string, maxLen = 100): string {
  const t = String(title || '').trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim() || t.slice(0, 48);
}

export class CompetitorAnalyzerService {
  async analyzeCompetition(
    userId: number,
    productTitle: string,
    targetMarketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'>,
    region: string
  ): Promise<Record<string, MarketAnalysis>> {
    const results: Record<string, MarketAnalysis> = {};
    const searchQ = shortenForMarketplaceSearch(productTitle);

    for (const mp of targetMarketplaces) {
      try {
        if (mp === 'ebay') {
          const marketplace = new MarketplaceService();
          const creds = await marketplace.getCredentials(userId, 'ebay');
          const raw = { ...(creds?.credentials || {}) } as Record<string, unknown>;
          const { appId, certId } = resolveEbayAppKeys(raw);
          if (!appId || !certId) {
            logger.warn('Skipping eBay analysis - missing App ID / Cert ID (needed for Browse API)', {
              userId,
              marketplace: mp,
            });
            continue;
          }

          const ebay = new EbayService({
            appId,
            certId,
            devId: String(raw.devId || process.env.EBAY_DEV_ID || ''),
            token: raw.token ? String(raw.token) : undefined,
            refreshToken: raw.refreshToken ? String(raw.refreshToken) : undefined,
            sandbox: creds?.environment === 'sandbox',
          } as any);

          const marketplace_id = REGION_TO_EBAY_MARKETPLACE[region] || 'EBAY_US';
          const res = await ebay.searchProducts({ keywords: searchQ, marketplace_id, limit: 20, sort: '-price' });
          const usedUserOAuth = Boolean(raw.token || raw.refreshToken);
          const dataSource: CompetitionDataSource = usedUserOAuth
            ? 'ebay_browse_user_oauth'
            : 'ebay_browse_application_token';

          const prices = res
            .map(r => parseFloat(r.price?.value || '0'))
            .filter(v => isFinite(v) && v > 0)
            .sort((a, b) => a - b);

          const listingsFound = prices.length;
          const minPrice = listingsFound ? prices[0] : 0;
          const maxPrice = listingsFound ? prices[prices.length - 1] : 0;
          const averagePrice = listingsFound ? prices.reduce((a, b) => a + b, 0) / listingsFound : 0;
          const medianPrice = listingsFound ? (prices[Math.floor(prices.length / 2)] || averagePrice) : 0;
          const competitivePrice = medianPrice || averagePrice || minPrice;

          const topListings: MarketplaceListing[] = res.slice(0, 5).map((r) => ({
            marketplace: 'ebay',
            region,
            title: r.title,
            price: parseFloat(r.price?.value || '0'),
            currency: r.price?.currency || 'USD',
            url: r.itemWebUrl,
            condition: r.condition,
            shippingCost: parseFloat(r.shippingOptions?.[0]?.shippingCost?.value || '0'),
            sellerRating: parseFloat(r.seller?.feedbackPercentage || '0'),
            salesCount: 0,
          }));

          results[`${mp}_${region}`] = {
            marketplace: 'ebay',
            region,
            currency: topListings[0]?.currency || 'USD',
            listingsFound,
            prices,
            averagePrice,
            minPrice,
            maxPrice,
            medianPrice,
            competitivePrice,
            topListings,
            dataSource,
          };
        } else if (mp === 'mercadolibre') {
          // Comparable prices from Mercado Libre public catalog — does not require seller OAuth.
          const marketplace = new MarketplaceService();
          const rec = await marketplace.getCredentials(userId, 'mercadolibre');
          let siteId =
            (rec?.credentials as any)?.siteId ||
            REGION_TO_ML_SITE[region] ||
            (process.env.MERCADOLIBRE_SITE_ID || 'MLM').trim();
          if (!siteId) siteId = 'MLM';

          let res = await MercadoLibreService.searchSiteCatalogPublic({
            siteId,
            q: searchQ,
            limit: 20,
          });
          // Regional site can return 0 hits for generic terms; MLM often has broader inventory.
          if (res.length === 0 && siteId !== 'MLM') {
            logger.info('[competitor-analyzer] ML empty for primary site, retry MLM', { siteId, region, qLen: searchQ.length });
            res = await MercadoLibreService.searchSiteCatalogPublic({
              siteId: 'MLM',
              q: searchQ,
              limit: 20,
            });
          }
          const prices = res.map(r => r.price).filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
          const listingsFound = prices.length;
          const minPrice = listingsFound ? prices[0] : 0;
          const maxPrice = listingsFound ? prices[prices.length - 1] : 0;
          const averagePrice = listingsFound ? prices.reduce((a, b) => a + b, 0) / listingsFound : 0;
          const medianPrice = listingsFound ? (prices[Math.floor(prices.length / 2)] || averagePrice) : 0;
          const competitivePrice = medianPrice || averagePrice || minPrice;
          const topListings = res.slice(0, 5).map(r => ({
            marketplace: 'mercadolibre',
            region,
            title: r.title,
            price: r.price,
            currency: r.currency_id || 'MXN',
            url: r.permalink,
          } as MarketplaceListing));
          results[`${mp}_${region}`] = {
            marketplace: 'mercadolibre',
            region,
            currency: topListings[0]?.currency || 'MXN',
            listingsFound,
            prices,
            averagePrice,
            minPrice,
            maxPrice,
            medianPrice,
            competitivePrice,
            topListings,
            dataSource: 'mercadolibre_public_catalog',
          };
        } else if (mp === 'amazon') {
          const config = AmazonService.getMarketplaceConfig(region.toUpperCase() === 'UK' ? 'UK' : (region.toUpperCase() === 'DE' ? 'DE' : 'US'));
          const marketplace = new MarketplaceService();
          const rec = await marketplace.getCredentials(userId, 'amazon');
          if (!rec || !rec.isActive || !rec.credentials) {
            logger.warn('Skipping Amazon analysis - credentials missing or inactive', { userId });
            continue;
          }

          if (rec.issues?.length) {
            logger.warn('Skipping Amazon analysis - credential issues detected', {
              userId,
              issues: rec.issues,
            });
            continue;
          }

          const amazon = new AmazonService();
          const creds = {
            ...rec.credentials,
            region: config.region,
            marketplace: config.marketplaceId,
          } as any;
          await amazon.setCredentials(creds);
          const res: any[] = await amazon.searchCatalog({ keywords: searchQ, marketplaceId: config.marketplaceId, limit: 10 });
          const prices = res.map(r => r.price || 0).filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
          const listingsFound = prices.length;
          const minPrice = listingsFound ? prices[0] : 0;
          const maxPrice = listingsFound ? prices[prices.length - 1] : 0;
          const averagePrice = listingsFound ? prices.reduce((a, b) => a + b, 0) / listingsFound : 0;
          const medianPrice = listingsFound ? (prices[Math.floor(prices.length / 2)] || averagePrice) : 0;
          const competitivePrice = medianPrice || averagePrice || minPrice;
          const topListings = res.slice(0, 5).map(r => ({
            marketplace: 'amazon',
            region,
            title: r.title,
            price: r.price || 0,
            currency: r.currency || 'USD',
            url: r.url,
          } as MarketplaceListing));
          results[`${mp}_${region}`] = {
            marketplace: 'amazon',
            region,
            currency: topListings[0]?.currency || 'USD',
            listingsFound,
            prices,
            averagePrice,
            minPrice,
            maxPrice,
            medianPrice,
            competitivePrice,
            topListings,
            dataSource: 'amazon_catalog',
          };
        }
      } catch (e: any) {
        logger.warn('[competitor-analyzer] marketplace search failed', {
          userId,
          marketplace: mp,
          region,
          titleSample: productTitle?.slice(0, 80),
          error: e?.message || String(e),
          status: e?.response?.status,
        });
      }
    }

    return results;
  }
}

const competitorAnalyzer = new CompetitorAnalyzerService();
export default competitorAnalyzer;
