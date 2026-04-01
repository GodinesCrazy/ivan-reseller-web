import { trace } from '../utils/boot-trace';
trace('loading competitor-analyzer.service');

import { EbayService } from './ebay.service';
import { AmazonService } from './amazon.service';
import { MercadoLibreService } from './mercadolibre.service';
import { REGION_TO_EBAY_MARKETPLACE, REGION_TO_ML_SITE } from './destination.service';
import { prisma } from '../config/database';
import { MarketplaceService } from './marketplace.service';
import scraperBridge from './scraper-bridge.service';
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
  | 'mercadolibre_authenticated_catalog'
  | 'mercadolibre_scraper_bridge'
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
  /** Why this marketplace contributed no comparable price (honest diagnostics for Opportunities UI). */
  competitionProbe?: { code: string; detail?: string };
}

function emptyAnalysis(
  mp: string,
  region: string,
  currency: string,
  probe: { code: string; detail?: string }
): MarketAnalysis {
  return {
    marketplace: mp,
    region,
    currency,
    listingsFound: 0,
    prices: [],
    averagePrice: 0,
    minPrice: 0,
    maxPrice: 0,
    medianPrice: 0,
    competitivePrice: 0,
    topListings: [],
    competitionProbe: probe,
  };
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
    const mlDebugEnabled = process.env.ML_COMPARABLES_DEBUG === '1';
    const mlDebugUserIdEnv = process.env.ML_COMPARABLES_DEBUG_USER_ID;
    const mlDebugUserId = mlDebugUserIdEnv ? Number(mlDebugUserIdEnv) : null;

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
            results[`${mp}_${region}`] = emptyAnalysis('ebay', region, 'USD', {
              code: 'EBAY_BROWSE_NOT_CONFIGURED',
              detail: 'Faltan EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (o App ID / Cert ID en credenciales).',
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
            competitionProbe:
              listingsFound > 0
                ? undefined
                : { code: 'EBAY_ZERO_RESULTS', detail: 'Browse API no devolvió precios para la consulta acortada.' },
          };
        } else if (mp === 'mercadolibre') {
          // Comparable prices: OAuth /sites/{id}/search first (evita 403 de IP en ruta pública en hosting); luego catálogo público.
          const marketplace = new MarketplaceService();
          const rec = await marketplace.getCredentials(userId, 'mercadolibre');
          let siteId =
            (rec?.credentials as any)?.siteId ||
            REGION_TO_ML_SITE[region] ||
            (process.env.MERCADOLIBRE_SITE_ID || 'MLM').trim();
          if (!siteId) siteId = 'MLM';

          let res: Array<{
            id: string;
            title: string;
            price: number;
            currency_id: string;
            permalink: string;
            seller_id?: number;
            shipping?: { free_shipping?: boolean };
          }> = [];
          let dataSource: CompetitionDataSource = 'mercadolibre_public_catalog';
          let publicError: { httpStatus?: number; message: string } | null = null;

          const mlDebugTraceId = `ml-comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const mlDebug: any =
            mlDebugEnabled && (!mlDebugUserId || mlDebugUserId === userId)
              ? {
                  traceId: mlDebugTraceId,
                  userId,
                  region,
                  rawTitleSample: productTitle?.slice(0, 120),
                  normalizedQuery: searchQ,
                  credentialsPresent: Boolean(rec?.credentials),
                  accessTokenPresent: Boolean((rec?.credentials as any)?.accessToken),
                  refreshTokenPresent: Boolean((rec?.credentials as any)?.refreshToken),
                  siteIdInitial: siteId,
                  auth: {
                    attemptedPrimary: false,
                    attemptedMLM: false,
                    statusPrimary: 'skipped',
                    statusMLM: 'skipped',
                    httpStatusPrimary: undefined as number | undefined,
                    httpStatusMLM: undefined as number | undefined,
                    listingsPrimary: 0,
                    listingsMLM: 0,
                    errorPrimary: undefined as string | undefined,
                    errorMLM: undefined as string | undefined,
                  },
                  pub: {
                    attemptedPrimary: false,
                    attemptedMLM: false,
                    httpStatusPrimary: undefined as number | undefined,
                    httpStatusMLM: undefined as number | undefined,
                    listingsPrimary: 0,
                    listingsMLM: 0,
                    errorPrimary: undefined as string | undefined,
                    errorMLM: undefined as string | undefined,
                  },
                  finalDecision: undefined as string | undefined,
                }
              : null;

          const loadPublic = async (sid: string, tag: 'primary' | 'mlm') => {
            try {
              const out = await MercadoLibreService.searchSiteCatalogPublic({
                siteId: sid,
                q: searchQ,
                limit: 20,
              });
              if (mlDebug) {
                const count = Array.isArray(out) ? out.length : 0;
                if (tag === 'primary') {
                  mlDebug.pub.attemptedPrimary = true;
                  mlDebug.pub.listingsPrimary = count;
                } else {
                  mlDebug.pub.attemptedMLM = true;
                  mlDebug.pub.listingsMLM = count;
                }
              }
              return out;
            } catch (e: any) {
              publicError = {
                httpStatus: e?.response?.status,
                message: e?.message || String(e),
              };
              if (mlDebug) {
                if (tag === 'primary') {
                  mlDebug.pub.attemptedPrimary = true;
                  mlDebug.pub.httpStatusPrimary = e?.response?.status;
                  mlDebug.pub.errorPrimary =
                    e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
                } else {
                  mlDebug.pub.attemptedMLM = true;
                  mlDebug.pub.httpStatusMLM = e?.response?.status;
                  mlDebug.pub.errorMLM =
                    e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
                }
              }
              throw e;
            }
          };

          const rawCreds = (rec?.credentials || {}) as Record<string, unknown>;
          const accessTok = String(rawCreds.accessToken || '').trim();
          const hasAuthCredentials = !!(accessTok && rawCreds.clientId && rawCreds.clientSecret);
          // Tracks whether the authenticated search was attempted and what error it got.
          let authSearchError: { httpStatus?: number; message: string } | null = null;
          const tryAuthSearch = async (sid: string, tag: 'primary' | 'mlm') => {
            if (!accessTok || !rawCreds.clientId || !rawCreds.clientSecret) {
              if (mlDebug) {
                if (tag === 'primary') {
                  mlDebug.auth.statusPrimary = 'skipped_no_credentials';
                } else {
                  mlDebug.auth.statusMLM = 'skipped_no_credentials';
                }
              }
              return [];
            }
            const envSandbox = rec?.environment === 'sandbox';
            const ml = new MercadoLibreService({
              clientId: String(rawCreds.clientId),
              clientSecret: String(rawCreds.clientSecret),
              accessToken: accessTok,
              refreshToken: String(rawCreds.refreshToken || ''),
              siteId: String(rawCreds.siteId || sid || 'MLM'),
              sandbox: envSandbox,
            } as any);
            try {
              let out = await ml.searchProducts({ siteId: sid, q: searchQ, limit: 20 });

              // If token expired (401), attempt refresh then retry once.
              if (!Array.isArray(out) || out.length === 0) {
                // out=[] may be fine; but if we got 401 from the catch below, we handle it there.
              }

              if (mlDebug) {
                const count = Array.isArray(out) ? out.length : 0;
                if (tag === 'primary') {
                  mlDebug.auth.attemptedPrimary = true;
                  mlDebug.auth.statusPrimary = 'ok';
                  mlDebug.auth.listingsPrimary = count;
                } else {
                  mlDebug.auth.attemptedMLM = true;
                  mlDebug.auth.statusMLM = 'ok';
                  mlDebug.auth.listingsMLM = count;
                }
              }
              return out;
            } catch (authSearchErr: any) {
              const httpStatus = authSearchErr?.response?.status;

              // FASE 0D: On 401, attempt OAuth token refresh and retry once.
              if (httpStatus === 401 && rawCreds.refreshToken && rawCreds.clientId && rawCreds.clientSecret) {
                logger.info('[competitor-analyzer] ML 401 — attempting token refresh', { userId, siteId: sid, tag });
                try {
                  const mlForRefresh = new MercadoLibreService({
                    clientId: String(rawCreds.clientId),
                    clientSecret: String(rawCreds.clientSecret),
                    accessToken: accessTok,
                    refreshToken: String(rawCreds.refreshToken),
                    siteId: String(rawCreds.siteId || sid || 'MLM'),
                    sandbox: envSandbox,
                  } as any);
                  const refreshed = await mlForRefresh.refreshAccessToken();
                  const mlRetry = new MercadoLibreService({
                    clientId: String(rawCreds.clientId),
                    clientSecret: String(rawCreds.clientSecret),
                    accessToken: refreshed.accessToken,
                    refreshToken: String(rawCreds.refreshToken),
                    siteId: String(rawCreds.siteId || sid || 'MLM'),
                    sandbox: envSandbox,
                  } as any);
                  const retryOut = await mlRetry.searchProducts({ siteId: sid, q: searchQ, limit: 20 });
                  if (Array.isArray(retryOut) && retryOut.length > 0) {
                    logger.info('[competitor-analyzer] ML token refresh + retry succeeded', { userId, siteId: sid, tag, count: retryOut.length });
                    if (mlDebug) {
                      if (tag === 'primary') { mlDebug.auth.attemptedPrimary = true; mlDebug.auth.statusPrimary = 'ok_after_refresh'; mlDebug.auth.listingsPrimary = retryOut.length; }
                      else { mlDebug.auth.attemptedMLM = true; mlDebug.auth.statusMLM = 'ok_after_refresh'; mlDebug.auth.listingsMLM = retryOut.length; }
                    }
                    return retryOut;
                  }
                } catch (refreshErr: any) {
                  logger.warn('[competitor-analyzer] ML token refresh failed', { userId, siteId: sid, tag, error: refreshErr?.message });
                }
              }

              if (mlDebug) {
                if (tag === 'primary') {
                  mlDebug.auth.attemptedPrimary = true;
                  mlDebug.auth.statusPrimary = 'failed';
                  mlDebug.auth.httpStatusPrimary = httpStatus;
                  mlDebug.auth.errorPrimary =
                    authSearchErr?.response?.data?.message ||
                    authSearchErr?.response?.data?.error ||
                    authSearchErr?.message ||
                    String(authSearchErr);
                } else {
                  mlDebug.auth.attemptedMLM = true;
                  mlDebug.auth.statusMLM = 'failed';
                  mlDebug.auth.httpStatusMLM = httpStatus;
                  mlDebug.auth.errorMLM =
                    authSearchErr?.response?.data?.message ||
                    authSearchErr?.response?.data?.error ||
                    authSearchErr?.message ||
                    String(authSearchErr);
                }
              }
              // Track auth failure for accurate probe code generation.
              if (!authSearchError) {
                authSearchError = { httpStatus, message: authSearchErr?.message || String(authSearchErr) };
              }
              logger.warn('[competitor-analyzer] ML authenticated search failed', {
                userId,
                siteId: sid,
                tag,
                message: authSearchErr?.message,
                status: httpStatus,
              });
              return [];
            }
          };

          try {
            res = await tryAuthSearch(siteId, 'primary');
            if (res.length > 0) {
              dataSource = 'mercadolibre_authenticated_catalog';
              publicError = null;
            }
          } catch {
            // errors already logged inside tryAuthSearch
            res = [];
          }

          if (res.length === 0 && siteId !== 'MLM') {
            try {
              res = await tryAuthSearch('MLM', 'mlm');
              if (res.length > 0) {
                siteId = 'MLM';
                dataSource = 'mercadolibre_authenticated_catalog';
                publicError = null;
              }
            } catch {
              // errors already logged inside tryAuthSearch
            }
          }

          if (res.length === 0) {
            try {
              res = await loadPublic(siteId, 'primary');
              if (res.length > 0) publicError = null;
            } catch {
              res = [];
            }
          }
          if (res.length === 0 && siteId !== 'MLM') {
            try {
              logger.info('[competitor-analyzer] ML public empty or failed for primary site, retry MLM', {
                siteId,
                region,
                qLen: searchQ.length,
              });
              res = await loadPublic('MLM', 'mlm');
              siteId = 'MLM';
              if (res.length > 0) publicError = null;
            } catch {
              res = [];
            }
          }

          // FASE 0D — Fix #2: scraper-bridge ML fallback when public catalog 403 from Railway IPs.
          // Only attempted when: all OAuth + public catalog attempts returned 0 results AND error was 403/401.
          if (res.length === 0 && (publicError?.httpStatus === 403 || publicError?.httpStatus === 401)) {
            logger.info('[competitor-analyzer] ML 403/401 from all catalog routes — attempting scraper-bridge ML fallback', {
              userId, siteId, region,
            });
            try {
              const bridgeAvailable = await scraperBridge.isAvailable();
              if (bridgeAvailable) {
                const bridgeResults = await scraperBridge.searchMLCompetitors({
                  siteId,
                  q: searchQ,
                  limit: 20,
                });
                if (bridgeResults.length > 0) {
                  res = bridgeResults;
                  dataSource = 'mercadolibre_scraper_bridge';
                  publicError = null;
                  logger.info('[competitor-analyzer] ML scraper-bridge fallback succeeded', {
                    userId, siteId, count: res.length,
                  });
                  if (mlDebug) mlDebug.finalDecision = 'scraper_bridge_comparables_used';
                } else {
                  logger.warn('[competitor-analyzer] ML scraper-bridge returned 0 results', { userId, siteId });
                }
              } else {
                logger.warn(
                  '[competitor-analyzer] ML 403 and scraper-bridge unavailable (SCRAPER_BRIDGE_ENABLED != true or bridge not reachable). ' +
                  'Set SCRAPER_BRIDGE_ENABLED=true and SCRAPER_BRIDGE_URL to restore ML competitor data from Railway.',
                  { userId, siteId }
                );
              }
            } catch (bridgeErr: any) {
              logger.warn('[competitor-analyzer] ML scraper-bridge fallback failed', {
                userId, siteId, error: bridgeErr?.message, code: bridgeErr?.code,
              });
            }
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

          let competitionProbe: { code: string; detail?: string } | undefined;
          if (listingsFound === 0) {
            const authAlso403 =
              authSearchError &&
              (authSearchError.httpStatus === 403 || authSearchError.httpStatus === 401);
            if (publicError?.httpStatus === 403 || publicError?.httpStatus === 401) {
              if (hasAuthCredentials && authAlso403) {
                // OAuth token is valid but ML blocks search from Railway IPs at the IP level.
                // The fix is a scraper-bridge, NOT reconnecting OAuth.
                competitionProbe = {
                  code: 'ML_SEARCH_IP_BLOCKED',
                  detail:
                    'OAuth ML activo (token válido) pero MercadoLibre bloquea búsquedas (GET /sites/MLC/search) desde IPs de Railway ' +
                    'incluso con token autenticado. testConnection() pasa (/users/{id} no bloqueado), search sí bloqueado. ' +
                    'Solución: activar scraper-bridge en una IP no bloqueada (SCRAPER_BRIDGE_ENABLED=true + SCRAPER_BRIDGE_URL).',
                };
                if (mlDebug) {
                  mlDebug.finalDecision = 'estimated_due_to_ip_block_search_endpoint_auth_and_public';
                }
              } else {
                competitionProbe = {
                  code: 'ML_PUBLIC_CATALOG_HTTP_FORBIDDEN',
                  detail:
                    'Se intentó OAuth ML + catálogo público, pero Mercado Libre rechazó (403/401) desde esta IP de Railway. ' +
                    'Activá SCRAPER_BRIDGE_ENABLED=true con SCRAPER_BRIDGE_URL para desbloquear competencia ML.',
                };
                if (mlDebug) {
                  mlDebug.finalDecision = 'estimated_due_to_public_403_after_auth_zero';
                }
              }
            } else if (publicError) {
              competitionProbe = {
                code: 'ML_PUBLIC_CATALOG_REQUEST_FAILED',
                detail: publicError.message,
              };
              if (mlDebug) {
                mlDebug.finalDecision = 'estimated_due_to_public_error_after_auth_zero';
              }
            } else {
              competitionProbe = {
                code: 'ML_PUBLIC_CATALOG_ZERO_RESULTS',
                detail: `Sin listados en ${siteId} para el título acortado; probá otra región o término más corto.`,
              };
              if (mlDebug) {
                mlDebug.finalDecision = 'estimated_due_to_zero_results';
              }
            }
          } else if (dataSource === 'mercadolibre_authenticated_catalog') {
            if (mlDebug) {
              mlDebug.finalDecision = 'auth_comparables_used';
            }
          } else {
            if (mlDebug) {
              mlDebug.finalDecision = 'public_comparables_used';
            }
          }

          if (mlDebug) {
            mlDebug.siteIdFinal = siteId;
            mlDebug.totalListings = listingsFound;
            logger.info('[competitor-analyzer] ML comparables telemetry', mlDebug);
          }

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
            dataSource,
            competitionProbe,
          };
        } else if (mp === 'amazon') {
          const config = AmazonService.getMarketplaceConfig(region.toUpperCase() === 'UK' ? 'UK' : (region.toUpperCase() === 'DE' ? 'DE' : 'US'));
          const marketplace = new MarketplaceService();
          const rec = await marketplace.getCredentials(userId, 'amazon');
          if (!rec || !rec.isActive || !rec.credentials) {
            logger.warn('Skipping Amazon analysis - credentials missing or inactive', { userId });
            results[`${mp}_${region}`] = emptyAnalysis('amazon', region, 'USD', {
              code: 'AMAZON_CREDENTIALS_MISSING',
              detail: 'Credenciales Amazon no configuradas o inactivas.',
            });
            continue;
          }

          if (rec.issues?.length) {
            logger.warn('Skipping Amazon analysis - credential issues detected', {
              userId,
              issues: rec.issues,
            });
            results[`${mp}_${region}`] = emptyAnalysis('amazon', region, 'USD', {
              code: 'AMAZON_CREDENTIAL_ISSUES',
              detail: rec.issues?.join('; ') || 'Issues en credenciales Amazon.',
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
            competitionProbe:
              listingsFound > 0
                ? undefined
                : { code: 'AMAZON_CATALOG_ZERO_RESULTS', detail: 'Catálogo SP-API sin precios para la búsqueda.' },
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
        results[`${mp}_${region}`] = emptyAnalysis(mp, region, 'USD', {
          code: 'MARKETPLACE_SEARCH_ERROR',
          detail: e?.message || String(e),
        });
      }
    }

    return results;
  }
}

const competitorAnalyzer = new CompetitorAnalyzerService();
export default competitorAnalyzer;
