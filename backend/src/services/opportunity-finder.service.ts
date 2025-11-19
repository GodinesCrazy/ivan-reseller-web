import scraperBridge from './scraper-bridge.service';
import notificationService from './notification.service';
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';
import ManualAuthRequiredError from '../errors/manual-auth-required.error';
import competitorAnalyzer from './competitor-analyzer.service';
import costCalculator from './cost-calculator.service';
import opportunityPersistence from './opportunity.service';
import MarketplaceService from './marketplace.service';
import fxService from './fx.service';
import { workflowConfigService } from './workflow-config.service';
import { logger } from '../config/logger';
import {
  DEFAULT_COMPARATOR_MARKETPLACES,
  OPTIONAL_MARKETPLACES,
} from '../config/marketplaces.config';

export interface OpportunityFilters {
  query: string;
  maxItems?: number;
  marketplaces?: Array<'ebay' | 'amazon' | 'mercadolibre'>;
  region?: string; // e.g., 'us', 'uk', 'mx'
  environment?: 'sandbox' | 'production'; // Environment para credenciales
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
    
    // ✅ MEDIA PRIORIDAD: Obtener environment del usuario si no se especificó (con logger estructurado)
    let environment: 'sandbox' | 'production' = filters.environment || 'production';
    if (!filters.environment) {
      try {
        environment = await workflowConfigService.getUserEnvironment(userId);
      } catch (error: any) {
        logger.warn('No se pudo obtener environment del usuario, usando production por defecto', {
          service: 'opportunity-finder',
          userId,
          error: error?.message || String(error),
          fallback: 'production'
        });
        environment = 'production';
      }
    }
    
    logger.info('Búsqueda de oportunidades iniciada', {
      service: 'opportunity-finder',
      userId,
      query,
      environment,
      maxItems,
      marketplaces: requestedMarketplaces
    });

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
      logger.info('[OPPORTUNITY-FINDER] Starting search', { query, userId, environment });
      logger.debug('[OPPORTUNITY-FINDER] Using native local scraping (Puppeteer)', { query });
      
      // ✅ Inicializar scraper explícitamente antes de usar
      if (!scraper['browser']) {
        logger.debug('[OPPORTUNITY-FINDER] Initializing browser');
        try {
          await scraper['init']();
          scraperInitialized = true;
          logger.info('[OPPORTUNITY-FINDER] Browser initialized successfully');
        } catch (initError: any) {
          logger.error('[OPPORTUNITY-FINDER] Browser initialization failed', {
            error: initError?.message || String(initError),
            stack: initError?.stack
          });
          throw initError;
        }
      }
      
      logger.debug('[OPPORTUNITY-FINDER] Calling scrapeAliExpress', { query, userId, environment });
      const scrapeStartTime = Date.now();
      const items = await scraper.scrapeAliExpress(userId, query, environment);
      const scrapeDuration = Date.now() - scrapeStartTime;
      logger.info('[OPPORTUNITY-FINDER] scrapeAliExpress completed', { 
        count: items?.length || 0,
        duration: `${scrapeDuration}ms`,
        query,
        userId
      });
      
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
        .filter(p => {
          const isValid = p.price > 0 && p.sourcePrice > 0;
          if (!isValid && p.title) {
            logger.debug('Producto filtrado (precio inválido)', {
              service: 'opportunity-finder',
              title: p.title.substring(0, 50),
              price: p.price,
              sourcePrice: p.sourcePrice
            });
          }
          return isValid;
        });
      
      if (products.length > 0) {
        logger.info('Scraping nativo exitoso', {
          service: 'opportunity-finder',
          productsFound: products.length,
          firstProducts: products.slice(0, 3).map(p => ({ title: p.title?.substring(0, 50), price: p.price }))
        });
      } else {
        logger.warn('Scraping nativo no encontró productos', {
          service: 'opportunity-finder',
          query,
          userId,
          maxItems,
          environment,
          itemsRaw: items?.length || 0,
          filteredItems: items && items.length > 0 ? items.slice(0, 3).map((i: any) => ({ title: i.title?.substring(0, 50), price: i.price, sourcePrice: i.sourcePrice })) : []
        });
      }
    } catch (nativeError: any) {
      nativeErrorForLogs = nativeError;
      const errorMsg = nativeError?.message || String(nativeError);
      
      // ✅ MEDIA PRIORIDAD: NO bloquear si es error de autenticación manual - continuar con bridge Python (con logger estructurado)
      if (nativeError instanceof ManualAuthRequiredError) {
        manualAuthPending = true;
        manualAuthError = nativeError;
        logger.warn('AliExpress requiere autenticación manual, intentando bridge Python', {
          service: 'opportunity-finder',
          userId,
          query,
          error: errorMsg
        });
      } else {
        logger.error('Error en scraping nativo, intentando bridge Python', {
          service: 'opportunity-finder',
          userId,
          query,
          error: errorMsg
        });
      }

      // ✅ NO intentar resolver CAPTCHA aquí - mejor continuar directamente con bridge Python
      // El sistema de CAPTCHA manual se activará solo si el bridge Python también falla
    } finally {
      if (scraperInitialized) {
        await scraper.close().catch(() => {});
      }
    }

    // ✅ FALLBACK: Intentar bridge Python si scraping nativo falló
    if (!products || products.length === 0) {
      try {
        logger.info('Intentando bridge Python como alternativa', {
          service: 'opportunity-finder',
          userId,
          query
        });
        const items = await scraperBridge.aliexpressSearch({ query, maxItems, locale: 'es-ES' });
        logger.debug('Bridge Python completado', {
          service: 'opportunity-finder',
          itemsCount: items?.length || 0
        });
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
        
        if (products.length > 0) {
          logger.info('Bridge Python exitoso', {
            service: 'opportunity-finder',
            productsFound: products.length
          });
        } else {
          logger.warn('Bridge Python no encontró productos', {
            service: 'opportunity-finder',
            userId,
            query
          });
        }
      } catch (bridgeError: any) {
        const msg = String(bridgeError?.message || '').toLowerCase();
        const isCaptchaError = bridgeError?.code === 'CAPTCHA_REQUIRED' || msg.includes('captcha');
        
        logger.error('Bridge Python falló', {
          service: 'opportunity-finder',
          userId,
          query,
          error: bridgeError.message,
          isCaptchaError
        });
        
        // Solo intentar resolver CAPTCHA si ambos métodos fallaron Y es un error de CAPTCHA
        if (isCaptchaError && !manualAuthPending) {
          try {
            const ManualCaptchaService = (await import('./manual-captcha.service')).default;
            const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
            
            logger.info('CAPTCHA detectado, iniciando sesión de resolución manual', {
              service: 'opportunity-finder',
              userId,
              searchUrl
            });
            await ManualCaptchaService.startSession(userId, searchUrl, searchUrl);
            logger.info('Notificación enviada al usuario para resolver CAPTCHA', {
              service: 'opportunity-finder',
              userId
            });
          } catch (captchaError: any) {
            logger.error('Error al iniciar resolución manual de CAPTCHA', {
              service: 'opportunity-finder',
              userId,
              error: captchaError.message
            });
          }
        }
        
        // ✅ NO lanzar error - retornar array vacío para que el frontend muestre el mensaje apropiado
        logger.warn('Ambos métodos de scraping fallaron, retornando resultados vacíos', {
          service: 'opportunity-finder',
          userId,
          query,
          manualAuthPending,
          manualAuthError: manualAuthError?.message
        });
        return [];
      }
    }

    // ✅ Si después de todos los intentos no hay productos, retornar vacío
    if (!products || products.length === 0) {
      logger.warn('No se encontraron productos después de intentar scraping nativo y bridge Python', {
        service: 'opportunity-finder',
        query,
        userId,
        maxItems,
        hasManualAuth: manualAuthPending,
        nativeError: nativeErrorForLogs?.message || null,
        bridgeAttempted: true,
      });
      
      // ✅ Si hay un error de autenticación manual pendiente, lanzarlo para que el frontend lo maneje
      if (manualAuthPending && manualAuthError) {
        logger.info('Lanzando error de autenticación manual pendiente', {
          service: 'opportunity-finder',
          userId,
          error: manualAuthError.message
        });
        throw manualAuthError;
      }
      
      // ✅ Retornar vacío si no hay productos pero no hay error de autenticación
      return [];
    }

    // 2) Analizar competencia real (placeholder hasta integrar servicios específicos)
    logger.info('[OPPORTUNITY-FINDER] Processing scraped products to find opportunities', { productCount: products.length });
    const opportunities: OpportunityItem[] = [];
    let skippedInvalid = 0;
    let skippedLowMargin = 0;
    let processedCount = 0;
    
    for (const product of products) {
      if (!product.title || !product.price || product.price <= 0) {
        skippedInvalid++;
        logger.debug('[OPPORTUNITY-FINDER] Product discarded (invalid)', { 
          title: product.title?.substring(0, 50), 
          price: product.price 
        });
        continue;
      }

      processedCount++;
      logger.debug('[OPPORTUNITY-FINDER] Analyzing product', { 
        progress: `${processedCount}/${products.length}`,
        title: product.title.substring(0, 60),
        price: product.price,
        currency: product.currency
      });

      let analysis: Record<string, any> = {};
      try {
        analysis = await competitorAnalyzer.analyzeCompetition(
          userId,
          product.title,
          marketplaces as ('ebay' | 'amazon' | 'mercadolibre')[],
          region
        );
      } catch (err: any) {
        logger.warn('Competition analysis failed, using heuristic fallback', {
          service: 'opportunity-finder',
          userId,
          error: err?.message || String(err)
        });
        analysis = {};
      }

      // Agregar oportunidades solo si existe algún marketplace con datos reales
      const analyses = Object.values(analysis || {});
      const valid = analyses.find(a => a && a.listingsFound > 0 && a.competitivePrice > 0);
      
      if (valid) {
        logger.debug('Análisis de competencia encontrado', {
          service: 'opportunity-finder',
          marketplace: valid.marketplace,
          listingsFound: valid.listingsFound,
          competitivePrice: valid.competitivePrice
        });
      } else {
        logger.debug('No se encontraron datos de competencia válidos, usando estimación heurística', {
          service: 'opportunity-finder'
        });
      }

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

        logger.debug('Margen calculado con datos reales', {
          service: 'opportunity-finder',
          margin: (best.margin * 100).toFixed(1),
          minRequired: (this.minMargin * 100).toFixed(1)
        });
        if (best.margin < this.minMargin) {
          skippedLowMargin++;
          logger.debug('Producto descartado (margen insuficiente)', {
            service: 'opportunity-finder',
            title: product.title.substring(0, 50),
            margin: (best.margin * 100).toFixed(1),
            minRequired: (this.minMargin * 100).toFixed(1)
          });
          continue;
        }
      } else {
        // No pudimos obtener datos de competencia, crear una estimación heurística
        const fallbackPriceBase = product.price * 1.45;
        const fallbackMargin = (fallbackPriceBase - product.price) / product.price;
        logger.debug('Margen estimado (sin datos de competencia)', {
          service: 'opportunity-finder',
          margin: (fallbackMargin * 100).toFixed(1),
          minRequired: (this.minMargin * 100).toFixed(1)
        });
        if (fallbackMargin < this.minMargin) {
          skippedLowMargin++;
          logger.debug('Producto descartado (margen estimado insuficiente)', {
            service: 'opportunity-finder',
            title: product.title.substring(0, 50),
            margin: (fallbackMargin * 100).toFixed(1),
            minRequired: (this.minMargin * 100).toFixed(1)
          });
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

      // ✅ Validar que el producto tenga URL antes de crear la oportunidad
      if (!product.productUrl || product.productUrl.length < 10) {
        logger.warn('Producto sin URL válida, saltando oportunidad', {
          service: 'opportunity-finder',
          title: product.title?.substring(0, 50),
          hasUrl: !!product.productUrl,
          urlLength: product.productUrl?.length || 0,
          productUrl: product.productUrl?.substring(0, 80) || 'NO_URL'
        });
        continue; // Saltar productos sin URL válida
      }

      const opp: OpportunityItem = {
        productId: product.productId,
        title: product.title,
        sourceMarketplace: 'aliexpress',
        aliexpressUrl: product.productUrl || '', // Asegurar que siempre haya una URL
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
      logger.debug('Oportunidad agregada', {
        service: 'opportunity-finder',
        title: opp.title.substring(0, 50),
        margin: (opp.profitMargin * 100).toFixed(1),
        suggestedPrice: `${opp.suggestedPriceUsd.toFixed(2)} ${opp.suggestedPriceCurrency}`
      });

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

    logger.info('Resumen de procesamiento', {
      service: 'opportunity-finder',
      userId,
      productsScraped: products.length,
      productsProcessed: processedCount,
      skippedInvalid,
      skippedLowMargin,
      opportunitiesFound: opportunities.length
    });
    
    if (opportunities.length === 0 && products.length > 0) {
      logger.warn('PROBLEMA DETECTADO: Se scrapearon productos pero no se generaron oportunidades', {
        service: 'opportunity-finder',
        userId,
        productsScraped: products.length,
        possibleCauses: [
          `Margen mínimo muy alto (actual: ${(this.minMargin * 100).toFixed(1)}%)`,
          'Falta de datos de competencia (configura eBay/Amazon/MercadoLibre)',
          'Precios de AliExpress muy altos comparados con la competencia'
        ]
      });
    }

    return opportunities;
  }
}

const opportunityFinder = new OpportunityFinderService();
export default opportunityFinder;




