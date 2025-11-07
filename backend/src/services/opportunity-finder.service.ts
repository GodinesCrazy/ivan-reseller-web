import scraperBridge from './scraper-bridge.service';
import notificationService from './notification.service';
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';
import competitorAnalyzer from './competitor-analyzer.service';
import costCalculator from './cost-calculator.service';
import opportunityPersistence from './opportunity.service';

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
  suggestedPriceUsd: number;
  profitMargin: number; // 0-1
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered: Record<string, number>;
  generatedAt: string;
}

class OpportunityFinderService {
  private minMargin = Number(process.env.MIN_OPPORTUNITY_MARGIN || '0.20');

  async findOpportunities(userId: number, filters: OpportunityFilters): Promise<OpportunityItem[]> {
    const query = filters.query?.trim();
    if (!query) return [];

    const maxItems = Math.min(Math.max(filters.maxItems || 10, 1), 10);
    const marketplaces = (filters.marketplaces && filters.marketplaces.length > 0)
      ? filters.marketplaces
      : ['ebay', 'amazon', 'mercadolibre'];
    const region = filters.region || 'us';

    // 1) Scrape AliExpress: PRIMERO usar scraping nativo local (Puppeteer) → fallback a bridge Python
    let products: Array<{ title: string; price: number; productUrl: string; imageUrl?: string; productId?: string }>= [];
    
    // PRIORIDAD 1: Scraping nativo local (Puppeteer) - más rápido y sin dependencias externas
    const scraper = new AdvancedMarketplaceScraper();
    let scraperInitialized = false;
    try {
      console.log('🔍 Usando scraping nativo local (Puppeteer) para:', query);
      
      // ✅ Inicializar scraper explícitamente antes de usar
      if (!scraper['browser']) {
        console.log('🚀 Inicializando navegador...');
        await scraper['init']();
        scraperInitialized = true;
      }
      
      const items = await scraper.scrapeAliExpress(userId, query);
      products = (items || []).slice(0, maxItems).map((p: any) => ({
        title: p.title,
        price: Number(p.price) || 0,
        productUrl: p.productUrl,
        imageUrl: p.imageUrl,
        productId: p.productId || p.productUrl?.split('/').pop()?.split('.html')[0],
      }));
      
      if (products.length > 0) {
        console.log(`✅ Scraping nativo exitoso: ${products.length} productos encontrados`);
      } else {
        console.warn('⚠️  Scraping nativo no encontró productos (puede ser selector incorrecto o página bloqueada)');
      }
    } catch (nativeError: any) {
      const errorMsg = nativeError?.message || String(nativeError);
      console.error('❌ Error en scraping nativo:', errorMsg);
      console.warn('⚠️  Scraping nativo falló, intentando bridge Python:', errorMsg);
      
      // Verificar si el error es por CAPTCHA que requiere intervención manual
      const nativeMsg = String(nativeError?.message || '').toLowerCase();
      const isCaptchaError = nativeError?.code === 'CAPTCHA_REQUIRED' || 
                            nativeMsg.includes('captcha') || 
                            nativeMsg.includes('no se pudo evadir');
      
      if (isCaptchaError) {
        // Notificar al usuario que necesita resolver CAPTCHA manualmente
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
      
      // PRIORIDAD 2: Fallback a bridge Python si el scraping nativo falla
      try {
        const items = await scraperBridge.aliexpressSearch({ query, maxItems, locale: 'es-ES' });
        products = (items || []).map((p: any) => ({
          title: p.title,
          price: Number(p.price) || 0,
          productUrl: p.url || p.productUrl,
          imageUrl: p.images?.[0] || p.image || p.imageUrl,
          productId: p.productId,
        }));
        console.log(`✅ Bridge Python exitoso: ${products.length} productos encontrados`);
      } catch (bridgeError: any) {
        // Notificar si el bridge reporta necesidad de CAPTCHA manual
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
          native: nativeError.message,
          bridge: bridgeError.message
        });
        products = []; // No se encontraron productos
      }
    } finally {
      await scraper.close().catch(() => {});
    }

    if (!products || products.length === 0) return [];

    // 2) Analizar competencia real (placeholder hasta integrar servicios específicos)
    const opportunities: OpportunityItem[] = [];
    for (const product of products) {
      if (!product.title || !product.price || product.price <= 0) continue;

      const analysis = await competitorAnalyzer.analyzeCompetition(
        userId,
        product.title,
        marketplaces as ('ebay' | 'amazon' | 'mercadolibre')[],
        region
      );

      // Agregar oportunidades solo si existe algún marketplace con datos reales
      const analyses = Object.values(analysis || {});
      const valid = analyses.find(a => a && a.listingsFound > 0 && a.competitivePrice > 0);
      if (!valid) continue;

      // 3) Calcular costos con el marketplace más favorable (max margen)
      let best = { margin: -Infinity, price: 0, mp: (valid as any).marketplace, currency: (valid as any).currency || 'USD' } as { margin: number; price: number; mp: string; currency: string };
      let bestBreakdown: Record<string, number> = {};
      for (const a of analyses) {
        if (!a || a.listingsFound <= 0 || a.competitivePrice <= 0) continue;
        const { breakdown, margin } = costCalculator.calculateAdvanced(
          a.marketplace as any,
          region,
          a.competitivePrice,
          product.price,
          a.currency || 'USD',
          'USD',
          { shippingCost: 0, taxesPct: 0, otherCosts: 0 }
        );
        if (margin > best.margin) {
          best = { margin, price: a.competitivePrice, mp: a.marketplace, currency: a.currency || 'USD' };
          bestBreakdown = breakdown as any;
        }
      }

      if (best.margin < this.minMargin) continue;

      const opp: OpportunityItem = {
        productId: product.productId,
        title: product.title,
        sourceMarketplace: 'aliexpress',
        aliexpressUrl: product.productUrl,
        image: product.imageUrl,
        costUsd: product.price,
        suggestedPriceUsd: best.price,
        profitMargin: best.margin,
        roiPercentage: Math.round(best.margin * 100),
        competitionLevel: 'unknown',
        marketDemand: 'real',
        confidenceScore: 0.5,
        targetMarketplaces: marketplaces,
        feesConsidered: bestBreakdown,
        generatedAt: new Date().toISOString(),
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




