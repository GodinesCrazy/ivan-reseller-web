import scraperBridge from './scraper-bridge.service';
import notificationService from './notification.service';
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';
import ManualAuthRequiredError from '../errors/manual-auth-required.error';
import competitorAnalyzer from './competitor-analyzer.service';
import costCalculator from './cost-calculator.service';
import opportunityPersistence from './opportunity.service';
import MarketplaceService from './marketplace.service';
import fxService from './fx.service';
import {
  DEFAULT_COMPARATOR_MARKETPLACES,
  OPTIONAL_MARKETPLACES,
} from '../config/marketplaces.config';

export interface OpportunityFilters {
  query: string;
  maxItems?: number;
  marketplaces?: Array<'ebay' | 'amazon' | 'mercadolibre'>;
  region?: string; // e.g., 'us', 'uk', 'mx'
}

export interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  image?: string;
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number; // 0-1
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered: Record<string, number>;
  generatedAt: string;
  estimatedFields?: string[];
  estimationNotes?: string[];
}

class OpportunityFinderService {
  private minMargin = Number(process.env.MIN_OPPORTUNITY_MARGIN || '0.20');

  async findOpportunities(userId: number, filters: OpportunityFilters): Promise<OpportunityItem[]> {
    const query = filters.query?.trim();
    if (!query) return [];

    const maxItems = Math.min(Math.max(filters.maxItems || 10, 1), 10);
    const requestedMarketplaces = (filters.marketplaces && filters.marketplaces.length > 0)
      ? filters.marketplaces
      : DEFAULT_COMPARATOR_MARKETPLACES;
    const region = filters.region || 'us';

    const credentialDiagnostics: Record<string, { issues: string[]; warnings: string[] }> = {};
    const marketplaceService = new MarketplaceService();

    const usableMarketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'> = [];

    for (const mp of requestedMarketplaces) {
      try {
        const status = await marketplaceService.getCredentials(userId, mp);
        if (!status || !status.credentials || !status.isActive) {
          const optional = OPTIONAL_MARKETPLACES.includes(mp as any);
          credentialDiagnostics[mp] = {
            issues: optional ? [] : [`No encontramos credenciales activas de ${mp} para tu usuario.`],
            warnings: optional
              ? [`${mp} es opcional. Configúralo para mejorar la precisión.`]
              : [],
          };
          continue;
        }
        usableMarketplaces.push(mp);
        credentialDiagnostics[mp] = {
          issues: status.issues || [],
          warnings: status.warnings || [],
        };
      } catch (credError: any) {
        credentialDiagnostics[mp] = {
          issues: OPTIONAL_MARKETPLACES.includes(mp as any)
            ? []
            : [`Error leyendo credenciales de ${mp}: ${credError?.message || String(credError)}`],
          warnings: OPTIONAL_MARKETPLACES.includes(mp as any)
            ? [`${mp} es opcional. Error al validar: ${credError?.message || String(credError)}`]
            : [],
        };
      }
    }

    const marketplaces: Array<'ebay' | 'amazon' | 'mercadolibre'> =
      usableMarketplaces.length > 0 ? usableMarketplaces : requestedMarketplaces;

    // 1) Scrape AliExpress: PRIMERO usar scraping nativo local (Puppeteer) → fallback a bridge Python
    let products: Array<{
      title: string;
      price: number;
      priceMin?: number;
      priceMax?: number;
      priceMinSource?: number;
      priceMaxSource?: number;
      priceRangeSourceCurrency?: string;
      priceSource?: string;
      currency: string;
      sourcePrice: number;
      sourceCurrency: string;
      productUrl: string;
      imageUrl?: string;
      productId?: string;
    }> = [];
    let manualAuthPending = false;
    let manualAuthError: ManualAuthRequiredError | null = null;
    let nativeErrorForLogs: any = null;
    
    // PRIORIDAD 1: Scraping nativo local (Puppeteer) - más rápido y sin dependencias externas
    const scraper = new AdvancedMarketplaceScraper();
    let scraperInitialized = false;
    const baseCurrency = fxService.getBase();

    try {
      console.log('🔍 Usando scraping nativo local (Puppeteer) para:', query);
      
      // ✅ Inicializar scraper explícitamente antes de usar
      if (!scraper['browser']) {
        console.log('🚀 Inicializando navegador...');
        await scraper['init']();
        scraperInitialized = true;
      }
      
      const items = await scraper.scrapeAliExpress(userId, query);
      products = (items || [])
        .slice(0, maxItems)
        .map((p: any) => {
          const rangeCurrency = String(
            p.priceRangeSourceCurrency || p.sourceCurrency || p.currency || baseCurrency || 'USD'
          ).toUpperCase();

          const sourcePriceCandidates = [
            typeof p.priceMaxSource === 'number' && p.priceMaxSource > 0 ? p.priceMaxSource : null,
            typeof p.sourcePrice === 'number' && p.sourcePrice > 0 ? p.sourcePrice : null,
            typeof p.priceMinSource === 'number' && p.priceMinSource > 0 ? p.priceMinSource : null,
          ].filter((value): value is number => typeof value === 'number');
          const sourcePrice = sourcePriceCandidates.length > 0 ? sourcePriceCandidates[0] : 0;

          const basePriceCandidates = [
            typeof p.priceMax === 'number' && p.priceMax > 0 ? p.priceMax : null,
            typeof p.price === 'number' && p.price > 0 ? p.price : null,
            typeof p.priceMin === 'number' && p.priceMin > 0 ? p.priceMin : null,
          ].filter((value): value is number => typeof value === 'number');
          let priceInBase = basePriceCandidates.length > 0 ? basePriceCandidates[0] : 0;

          if (priceInBase <= 0 && sourcePrice > 0) {
            priceInBase = fxService.convert(sourcePrice, rangeCurrency, baseCurrency);
          }

          const priceMinBase =
            typeof p.priceMin === 'number' && p.priceMin > 0 ? p.priceMin : priceInBase;
          const priceMaxBase =
            typeof p.priceMax === 'number' && p.priceMax > 0 ? p.priceMax : priceInBase;

          return {
            title: p.title,
            price: priceInBase,
            priceMin: priceMinBase,
            priceMax: priceMaxBase,
            priceMinSource:
              typeof p.priceMinSource === 'number' && p.priceMinSource > 0
                ? p.priceMinSource
                : sourcePrice,
            priceMaxSource: sourcePrice,
            priceRangeSourceCurrency: rangeCurrency,
            priceSource: p.priceSource,
            currency: baseCurrency,
            sourcePrice: sourcePrice,
            sourceCurrency: rangeCurrency,
            productUrl: p.productUrl,
            imageUrl: p.imageUrl,
            productId: p.productId || p.productUrl?.split('/').pop()?.split('.html')[0],
          };
        })
        .filter(p => p.price > 0 && p.sourcePrice > 0);
      
      if (products.length > 0) {
        console.log(`✅ Scraping nativo exitoso: ${products.length} productos encontrados`);
      } else {
        console.warn('⚠️  Scraping nativo no encontró productos (puede ser selector incorrecto o página bloqueada)');
      }
    } catch (nativeError: any) {
      nativeErrorForLogs = nativeError;
      if (nativeError instanceof ManualAuthRequiredError) {
        manualAuthPending = true;
        manualAuthError = nativeError;
        console.warn('⚠️  AliExpress requiere autenticación manual. Usaremos datos públicos temporales.');
      } else {
        const errorMsg = nativeError?.message || String(nativeError);
        console.error('❌ Error en scraping nativo:', errorMsg);
        console.warn('⚠️  Scraping nativo falló, intentando bridge Python:', errorMsg);

        const nativeMsg = String(nativeError?.message || '').toLowerCase();
        const isCaptchaError = nativeError?.code === 'CAPTCHA_REQUIRED' ||
          nativeMsg.includes('captcha') ||
          nativeMsg.includes('no se pudo evadir');

        if (isCaptchaError) {
          await notificationService.sendToUser(userId, {
            type: 'USER_ACTION',
            title: 'CAPTCHA detectado en AliExpress',
            message: 'El scraping nativo detectó un CAPTCHA que requiere resolución manual. El sistema intentará usar el bridge Python como alternativa.',
            priority: 'HIGH',
            category: 'SYSTEM',
            data: { source: 'aliexpress', step: 'scrape', method: 'native' },
            actions: [
              { id: 'open_captcha', label: 'Abrir CAPTCHA', url: '/api/captcha/stats', variant: 'primary' },
              { id: 'continuar_luego', label: 'Continuar luego', action: 'dismiss', variant: 'secondary' }
            ]
          });
        }
      }
    } finally {
      await scraper.close().catch(() => {});
    }

    if (!products || products.length === 0) {
      try {
        const items = await scraperBridge.aliexpressSearch({ query, maxItems, locale: 'es-ES' });
        products = (items || [])
          .map((p: any) => {
          const sourceCurrency = String(p.currency || baseCurrency || 'USD').toUpperCase();
          const sourcePrice = Number(p.price) || 0;
          const priceInBase = fxService.convert(sourcePrice, sourceCurrency, baseCurrency);
          return {
            title: p.title,
            price: priceInBase,
            priceMin: priceInBase,
            priceMax: priceInBase,
            priceMinSource: sourcePrice,
            priceMaxSource: sourcePrice,
            priceRangeSourceCurrency: sourceCurrency,
            currency: baseCurrency,
            sourcePrice,
            sourceCurrency,
            productUrl: p.url || p.productUrl,
            imageUrl: p.images?.[0] || p.image || p.imageUrl,
            productId: p.productId,
          };
          })
          .filter(p => p.price > 0 && p.sourcePrice > 0);
        console.log(`✅ Bridge Python exitoso: ${products.length} productos encontrados`);
      } catch (bridgeError: any) {
        const msg = String(bridgeError?.message || '').toLowerCase();
        if (bridgeError?.code === 'CAPTCHA_REQUIRED' || msg.includes('captcha')) {
          await notificationService.sendToUser(userId, {
            type: 'USER_ACTION',
            title: 'CAPTCHA detectado en AliExpress',
            message: 'Se requiere resolver CAPTCHA manualmente para continuar con el scraping.',
            priority: 'HIGH',
            category: 'SYSTEM',
            data: { source: 'aliexpress', step: 'scrape' },
            actions: [
              { id: 'open_captcha', label: 'Abrir CAPTCHA', url: '/api/captcha/stats', variant: 'primary' },
              { id: 'continuar_luego', label: 'Continuar luego', action: 'dismiss', variant: 'secondary' }
            ]
          });
        }
        console.error('❌ Ambos métodos de scraping fallaron:', {
          native: nativeErrorForLogs?.message,
          bridge: bridgeError.message
        });
        if (manualAuthPending && manualAuthError) {
          throw manualAuthError;
        }
        return [];
      }
    }

    if (!products || products.length === 0) {
      if (manualAuthPending && manualAuthError) {
        throw manualAuthError;
      }
      return [];
    }

    // 2) Analizar competencia real (placeholder hasta integrar servicios específicos)
    const opportunities: OpportunityItem[] = [];
    for (const product of products) {
      if (!product.title || !product.price || product.price <= 0) continue;

      let analysis: Record<string, any> = {};
      try {
        analysis = await competitorAnalyzer.analyzeCompetition(
          userId,
          product.title,
          marketplaces as ('ebay' | 'amazon' | 'mercadolibre')[],
          region
        );
      } catch (err: any) {
        console.warn('⚠️  Competition analysis failed, using heuristic fallback:', err?.message || err);
        analysis = {};
      }

      // Agregar oportunidades solo si existe algún marketplace con datos reales
      const analyses = Object.values(analysis || {});
      const valid = analyses.find(a => a && a.listingsFound > 0 && a.competitivePrice > 0);

      let best = {
        margin: -Infinity,
        price: 0,
        priceBase: 0,
        mp: valid?.marketplace || marketplaces[0],
        currency: valid?.currency || baseCurrency,
      } as { margin: number; price: number; priceBase: number; mp: string; currency: string };
      let bestBreakdown: Record<string, number> = {};
      let estimatedFields: string[] = [];
      const estimationNotes: string[] = [];

      if (
        typeof product.priceMin === 'number' &&
        typeof product.priceMax === 'number' &&
        product.priceMax > 0
      ) {
        const variance = Math.abs(product.priceMax - product.priceMin);
        if (variance > product.priceMax * 0.1) {
          const minSrcValue =
            typeof product.priceMinSource === 'number' && product.priceMinSource > 0
              ? product.priceMinSource
              : product.sourcePrice;
          const maxSrcValue =
            typeof product.priceMaxSource === 'number' && product.priceMaxSource > 0
              ? product.priceMaxSource
              : product.sourcePrice;
          const formatSource = (value: number | undefined) =>
            typeof value === 'number'
              ? value >= 10
                ? value.toFixed(0)
                : value.toFixed(2)
              : 'N/A';
          const sourceCurrencyLabel = product.sourceCurrency || baseCurrency;
          estimationNotes.push(
            `El proveedor reporta un rango de precios entre ${formatSource(minSrcValue)} y ${formatSource(maxSrcValue)} ${sourceCurrencyLabel}. Calculamos el margen usando el valor más alto.`
          );
        }
      }

      if (valid) {
        // 3) Calcular costos con el marketplace más favorable (max margen)
        for (const a of analyses) {
          if (!a || a.listingsFound <= 0 || a.competitivePrice <= 0) continue;
          const { breakdown, margin } = costCalculator.calculateAdvanced(
            a.marketplace as any,
            region,
            a.competitivePrice,
            product.price,
            a.currency || 'USD',
            baseCurrency,
            { shippingCost: 0, taxesPct: 0, otherCosts: 0 }
          );
          if (margin > best.margin) {
            best = {
              margin,
              price: a.competitivePrice,
              priceBase: fxService.convert(a.competitivePrice, a.currency || 'USD', baseCurrency),
              mp: a.marketplace,
              currency: a.currency || 'USD',
            };
            bestBreakdown = breakdown as any;
          }
        }

        if (best.margin < this.minMargin) {
          continue;
        }
      } else {
        // No pudimos obtener datos de competencia, crear una estimación heurística
        const fallbackPriceBase = product.price * 1.45;
        const fallbackMargin = (fallbackPriceBase - product.price) / product.price;
        if (fallbackMargin < this.minMargin) {
          continue;
        }
        best = {
          margin: fallbackMargin,
          price: fxService.convert(fallbackPriceBase, baseCurrency, baseCurrency),
          priceBase: fallbackPriceBase,
          mp: marketplaces[0],
          currency: baseCurrency,
        };
        bestBreakdown = {};
        estimatedFields = ['suggestedPriceUsd', 'profitMargin', 'roiPercentage'];
        estimationNotes.push('Valores estimados por falta de datos de competencia real. Configura tus credenciales de Amazon, eBay o MercadoLibre para obtener precios exactos.');
        for (const mp of marketplaces) {
          const diag = credentialDiagnostics[mp];
          if (diag?.issues?.length) {
            estimationNotes.push(...diag.issues.map(issue => `[${mp}] ${issue}`));
          }
          if (diag?.warnings?.length) {
            estimationNotes.push(...diag.warnings.map(warning => `[${mp}] ${warning}`));
          }
        }
      }

      if (manualAuthPending) {
        estimationNotes.push('Sesión de AliExpress pendiente de confirmación. Completa el login manual desde la barra superior para obtener datos completos.');
      }

      const selectedDiag = credentialDiagnostics[best.mp];
      if (selectedDiag?.warnings?.length) {
        estimationNotes.push(...selectedDiag.warnings.map(warning => `[${best.mp}] ${warning}`));
      }

      const opp: OpportunityItem = {
        productId: product.productId,
        title: product.title,
        sourceMarketplace: 'aliexpress',
        aliexpressUrl: product.productUrl,
        image: product.imageUrl,
        costUsd: product.price,
        costAmount:
          typeof product.priceMaxSource === 'number' && product.priceMaxSource > 0
            ? product.priceMaxSource
            : typeof product.sourcePrice === 'number' && product.sourcePrice > 0
            ? product.sourcePrice
            : fxService.convert(product.price, baseCurrency, product.sourceCurrency || baseCurrency),
        costCurrency: product.priceRangeSourceCurrency || product.sourceCurrency || baseCurrency,
        baseCurrency,
        suggestedPriceUsd: best.priceBase || fxService.convert(best.price, best.currency || baseCurrency, baseCurrency),
        suggestedPriceAmount: best.price,
        suggestedPriceCurrency: best.currency || baseCurrency,
        profitMargin: best.margin,
        roiPercentage: Math.round(best.margin * 100),
        competitionLevel: 'unknown',
        marketDemand: 'real',
        confidenceScore: valid ? 0.5 : 0.3,
        targetMarketplaces: marketplaces,
        feesConsidered: bestBreakdown,
        generatedAt: new Date().toISOString(),
        estimatedFields,
        estimationNotes,
      };

      opportunities.push(opp);

      try {
        await opportunityPersistence.saveOpportunity(userId, {
          title: opp.title,
          sourceMarketplace: opp.sourceMarketplace,
          costUsd: opp.costUsd,
          suggestedPriceUsd: opp.suggestedPriceUsd,
          profitMargin: opp.profitMargin,
          roiPercentage: opp.roiPercentage,
          competitionLevel: opp.competitionLevel,
          marketDemand: opp.marketDemand,
          confidenceScore: opp.confidenceScore,
          feesConsidered: opp.feesConsidered,
          targetMarketplaces: opp.targetMarketplaces,
        }, analysis as any);
      } catch {}
    }

    return opportunities;
  }
}

const opportunityFinder = new OpportunityFinderService();
export default opportunityFinder;




