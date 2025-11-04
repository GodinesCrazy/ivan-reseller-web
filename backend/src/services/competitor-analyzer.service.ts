import { EbayService } from './ebay.service';
import { AmazonService } from './amazon.service';
import { MercadoLibreService } from './mercadolibre.service';
import { prisma } from '../config/database';
import { MarketplaceService } from './marketplace.service';

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
}

export class CompetitorAnalyzerService {
  async analyzeCompetition(
    userId: number,
    productTitle: string,
    targetMarketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'>,
    region: string
  ): Promise<Record<string, MarketAnalysis>> {
    const results: Record<string, MarketAnalysis> = {};

    for (const mp of targetMarketplaces) {
      try {
        if (mp === 'ebay') {
          // Try user credentials; fallback to env
          let ebay: EbayService | null = null;
          try {
            const marketplace = new MarketplaceService();
            const creds = await marketplace.getCredentials(userId, 'ebay');
            if (creds?.credentials) {
              ebay = new EbayService(creds.credentials);
            }
          } catch {}
          if (!ebay) ebay = EbayService.fromEnv();
          if (!ebay) continue;

          const marketplaceMap: Record<string, string> = {
            us: 'EBAY_US', uk: 'EBAY_GB', de: 'EBAY_DE', es: 'EBAY_ES', fr: 'EBAY_FR', it: 'EBAY_IT', au: 'EBAY_AU', ca: 'EBAY_CA', mx: 'EBAY_MX'
          };
          const marketplace_id = marketplaceMap[region] || 'EBAY_US';
          const res = await ebay.searchProducts({ keywords: productTitle, marketplace_id, limit: 20, sort: '-price' });

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
          };
        } else if (mp === 'mercadolibre') {
          const regionToSite: Record<string, string> = { mx: 'MLM', ar: 'MLA', br: 'MLB', cl: 'MLC', co: 'MCO', uy: 'MLU', pe: 'MPE' };
          let siteId = regionToSite[region] || 'MLM';
          let mlCreds: any = { clientId: '', clientSecret: '', siteId };
          try {
            const marketplace = new MarketplaceService();
            const rec = await marketplace.getCredentials(userId, 'mercadolibre');
            if (rec?.credentials) {
              siteId = rec.credentials.siteId || siteId;
              mlCreds = { ...mlCreds, ...rec.credentials, siteId };
            }
          } catch {}
          const ml = new MercadoLibreService(mlCreds);
          const res = await ml.searchProducts({ siteId, q: productTitle, limit: 20 });
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
          };
        } else if (mp === 'amazon') {
          const config = AmazonService.getMarketplaceConfig(region.toUpperCase() === 'UK' ? 'UK' : (region.toUpperCase() === 'DE' ? 'DE' : 'US'));
          const amazon = new AmazonService();
          let creds = {
            clientId: process.env.AMAZON_CLIENT_ID || '',
            clientSecret: process.env.AMAZON_CLIENT_SECRET || '',
            refreshToken: process.env.AMAZON_REFRESH_TOKEN || '',
            region: config.region as any,
            marketplace: config.marketplaceId as any,
          } as any;
          try {
            const marketplace = new MarketplaceService();
            const rec = await marketplace.getCredentials(userId, 'amazon');
            if (rec?.credentials) {
              creds = { ...creds, ...rec.credentials, region: config.region, marketplace: config.marketplaceId };
            }
          } catch {}
          await amazon.setCredentials(creds as any);
          const res: any[] = await amazon.searchCatalog({ keywords: productTitle, marketplaceId: config.marketplaceId, limit: 10 });
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
          };
        }
      } catch (e) {
        // continue with other marketplaces
      }
    }

    return results;
  }
}

const competitorAnalyzer = new CompetitorAnalyzerService();
export default competitorAnalyzer;
