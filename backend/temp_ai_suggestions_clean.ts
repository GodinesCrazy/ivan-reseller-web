import { prisma } from '../config/database';
import { logger } from '../config/logger';
import axios from 'axios';
import { CredentialsManager } from './credentials-manager.service';
import { toNumber } from '../utils/decimal.utils';
import { trendSuggestionsService, KeywordSuggestion } from './trend-suggestions.service';

export interface AISuggestion {
  id: string;
  type: 'pricing' | 'inventory' | 'marketing' | 'listing' | 'optimization' | 'automation' | 'search';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: {
    revenue: number;
    time: number;
    difficulty: 'easy' | 'medium' | 'hard';
  };
  confidence: number;
  actionable: boolean;
  implemented: boolean;
  estimatedTime: string;
  requirements: string[];
  steps: string[];
  relatedProducts?: string[];
  metrics?: {
    currentValue: number;
    targetValue: number;
    unit: string;
  };
  createdAt: string;
  // ‘£‡ OBJETIVO A: Campos para sugerencias de keywords
  keyword?: string;
  keywordCategory?: string;
  keywordSegment?: string;
  keywordReason?: string;
  keywordSupportingMetric?: {
    type: 'demand' | 'margin' | 'roi' | 'competition' | 'trend';
    value: number;
    unit: string;
    description: string;
  };
  targetMarketplaces?: string[];
  estimatedOpportunities?: number;
}

interface UserBusinessData {
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  activeProducts: number;
  averageProfitMargin: number;
  bestCategory: string;
  worstCategory: string;
  products: Array<{
    id: number;
    title: string;
    category: string;
    price: number;
    sales: number;
    profit: number;
  }>;
  recentOpportunities: number;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'para',
  'con',
  'los',
  'las',
  'una',
  'unos',
  'unas',
  'del',
  'por',
  'para',
  'de',
  'la',
  'el',
  'en',
  'un',
  'una',
  'set',
  'kit',
  'pack',
  'plus',
  'pro',
  'original',
  'touch',
  'smart',
  'case',
  'cover'
]);

const SEGMENT_KEYWORD_MAP: Record<string, string> = {
  gaming: 'gaming & esports',
  gamer: 'gaming & esports',
  teclado: 'gaming & esports',
  keyboard: 'gaming & esports',
  mouse: 'gaming & esports',
  pad: 'gaming & esports',
  headset: 'audio & sound',
  earbuds: 'audio & sound',
  earphones: 'audio & sound',
  bluetooth: 'audio & sound',
  wireless: 'audio & sound',
  kitchen: 'home & kitchen',
  cocina: 'home & kitchen',
  organizer: 'home & kitchen',
  storage: 'home & kitchen',
  hogar: 'home & kitchen',
  home: 'home & kitchen',
  decor: 'home & kitchen',
  beauty: 'beauty & care',
  skincare: 'beauty & care',
  facial: 'beauty & care',
  maquillaje: 'beauty & care',
  serum: 'beauty & care',
  fitness: 'fitness & wellness',
  gym: 'fitness & wellness',
  yoga: 'fitness & wellness',
  deporte: 'fitness & wellness',
  pet: 'pets',
  perro: 'pets',
  gato: 'pets',
  mascota: 'pets',
  baby: 'baby & kids',
  bebe: 'baby & kids',
  infantil: 'baby & kids',
  kids: 'baby & kids',
  auto: 'auto & moto',
  car: 'auto & moto',
  moto: 'auto & moto',
  motorcycle: 'auto & moto',
  phone: 'mobile accessories',
  iphone: 'mobile accessories',
  samsung: 'mobile accessories',
  android: 'mobile accessories',
  lighting: 'home improvement',
  led: 'home improvement',
  strip: 'home improvement',
  lamp: 'home improvement',
  garden: 'garden & outdoor',
  outdoor: 'garden & outdoor',
  camping: 'outdoor & travel',
  travel: 'outdoor & travel',
  laptop: 'computers & office',
  office: 'computers & office',
  smartwatch: 'wearables & smart devices',
  watch: 'wearables & smart devices',
  reloj: 'wearables & smart devices',
  jewelry: 'fashion & accessories',
  fashion: 'fashion & accessories',
  ropa: 'fashion & accessories',
  dress: 'fashion & accessories',
  bag: 'fashion & accessories',
  bolso: 'fashion & accessories'
};

const SEGMENT_PATTERNS: Array<{ segment: string; regex: RegExp }> = [
  { segment: 'gaming & esports', regex: /(gaming|gamer|esports|mousepad|keyboard|rgb)/i },
  { segment: 'home & kitchen', regex: /(kitchen|cocina|organizer|storage|hogar|pantry|cookware)/i },
  { segment: 'beauty & care', regex: /(skincare|facial|maquillaje|beauty|serum|mascara|spa)/i },
  { segment: 'fitness & wellness', regex: /(fitness|gym|yoga|pilates|resistance|band|deporte|workout)/i },
  { segment: 'pets', regex: /(pet|perro|gato|mascota|cat|dog)/i },
  { segment: 'baby & kids', regex: /(baby|beb[e+Æ]|infantil|kids|toddler|newborn)/i },
  { segment: 'auto & moto', regex: /(auto|car|moto|motocicleta|vehicle|carro)/i },
  { segment: 'mobile accessories', regex: /(iphone|samsung|phone|case|charger|cable)/i },
  { segment: 'computers & office', regex: /(laptop|notebook|office|desk|ergonomic|monitor)/i },
  { segment: 'wearables & smart devices', regex: /(smartwatch|watch|tracker|wearable)/i },
  { segment: 'fashion & accessories', regex: /(fashion|ropa|dress|bag|bolso|jewelry|accesorio)/i },
  { segment: 'garden & outdoor', regex: /(garden|outdoor|plant|patio|camping|campamento)/i },
  { segment: 'electronics & gadgets', regex: /(electronic|gadget|camera|drone|sensor|usb)/i }
];

interface SegmentStat {
  key: string;
  displayName: string;
  count: number;
  score: number;
  avgMargin: number;
  avgRoi: number;
  avgProfitPerUnit: number;
  avgSuggestedPrice: number;
  marketplaces: Array<{ name: string; count: number }>;
  sample: {
    title: string;
    aliexpressUrl?: string;
    profitMargin: number;
    roiPercentage: number;
    marketplaces: string[];
    keyword?: string;
  };
}

interface HotProductSignal {
  title: string;
  aliexpressUrl?: string;
  profitMargin: number;
  roiPercentage: number;
  suggestedPriceUsd: number;
  costUsd: number;
  marketplaces: string[];
}

interface WinningOperationSignal {
  title: string;
  marketplace: string;
  totalProfit: number;
  roi: number;
  daysToComplete: number;
  category?: string;
}

interface MarketplaceDemandSignal {
  marketplace: string;
  current: number;
  previous: number;
  changePct: number;
  trend: 'up' | 'down' | 'stable';
}

interface DataDrivenSignals {
  segments: SegmentStat[];
  hotProducts: HotProductSignal[];
  winningOperations: WinningOperationSignal[];
  marketplaceDemand: MarketplaceDemandSignal[];
  confidenceNotes: string[];
}

function extractSegmentsFromTitle(title: string): string[] {
  const normalized = title.toLowerCase();
  const segments = new Set<string>();

  for (const rule of SEGMENT_PATTERNS) {
    if (rule.regex.test(normalized)) {
      segments.add(rule.segment);
    }
  }

  const words = normalized
    .replace(/[^a-z0-9+Ì+Æ+°+¶+¶+++¶\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word && word.length >= 3 && !STOP_WORDS.has(word));

  for (const word of words) {
    const mapped = SEGMENT_KEYWORD_MAP[word];
    if (mapped) {
      segments.add(mapped);
    }
  }

  return Array.from(segments);
}

function parseMarketplaceArray(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((mp) => String(mp));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((mp) => String(mp));
      }
    } catch {
      return [raw];
    }
  }
  return [];
}

function calculateTrend(current: number, previous: number): { trend: 'up' | 'down' | 'stable'; changePct: number } {
  if (previous <= 0 && current > 0) {
    return { trend: 'up', changePct: 100 };
  }
  if (previous === 0 && current === 0) {
    return { trend: 'stable', changePct: 0 };
  }
  const changePct = ((current - previous) / (previous === 0 ? current || 1 : previous)) * 100;
  if (changePct > 15) return { trend: 'up', changePct };
  if (changePct < -15) return { trend: 'down', changePct };
  return { trend: 'stable', changePct };
}

function formatSegmentName(segment: string): string {
  return segment
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export class AISuggestionsService {
  /**
   * Obtener datos del negocio del usuario para an+Ìlisis
   */
  private async getUserBusinessData(userId: number): Promise<UserBusinessData> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          products: {
            include: {
              sales: {
                where: {
                  status: 'DELIVERED'
                }
              }
            }
          },
          sales: {
            where: {
              status: 'DELIVERED'
            },
            include: {
              product: {
                select: {
                  category: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        logger.warn('AISuggestions: Usuario no encontrado', { userId });
        throw new Error('Usuario no encontrado');
      }

    const totalSales = user.sales.length;
    const totalRevenue = user.sales.reduce((sum, s) => sum + toNumber(s.salePrice || 0), 0);
    const totalProfit = user.sales.reduce((sum, s) => sum + toNumber(s.netProfit || s.grossProfit || 0), 0);
    const activeProducts = user.products.filter(p => p.status === 'APPROVED').length;

    // Calcular margen promedio
    const profitableSales = user.sales.filter(s => s.salePrice && toNumber(s.salePrice) > 0);
    const averageProfitMargin = profitableSales.length > 0
      ? profitableSales.reduce((sum, s) => {
          const salePriceNum = toNumber(s.salePrice);
          const margin = salePriceNum > 0 ? (toNumber(s.netProfit || s.grossProfit || 0) / salePriceNum) * 100 : 0;
          return sum + margin;
        }, 0) / profitableSales.length
      : 0;

    // Analizar categor+°as
    const categoryStats = new Map<string, { sales: number; profit: number }>();
    for (const sale of user.sales) {
      const category = sale.product?.category || 'General';
      const stats = categoryStats.get(category) || { sales: 0, profit: 0 };
      stats.sales += 1;
      stats.profit += toNumber(sale.netProfit || sale.grossProfit || 0);
      categoryStats.set(category, stats);
    }

    let bestCategory = 'General';
    let worstCategory = 'General';
    let maxProfit = -Infinity;
    let minProfit = Infinity;

    for (const [category, stats] of categoryStats.entries()) {
      if (stats.profit > maxProfit) {
        maxProfit = stats.profit;
        bestCategory = category;
      }
      if (stats.profit < minProfit && stats.sales > 0) {
        minProfit = stats.profit;
        worstCategory = category;
      }
    }

    // Productos con estad+°sticas
    const products = user.products.map(p => ({
      id: p.id,
      title: p.title,
      category: p.category || 'General',
      price: (p as any).price || 0,
      sales: p.sales.length,
      profit: p.sales.reduce((sum, s) => sum + toNumber(s.netProfit || s.grossProfit || 0), 0)
    }));

    // Oportunidades recientes (+¶ltimos 30 d+°as)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOpportunities = await prisma.opportunity.count({
      where: {
        userId,
        createdAt: {
          gte: thirtyDaysAgo
        }
      }
    });

    return {
      totalSales,
      totalRevenue,
      totalProfit,
      activeProducts,
      averageProfitMargin,
      bestCategory,
      worstCategory,
      products,
      recentOpportunities
    };
    } catch (error: any) {
      logger.error('AISuggestions: Error en getUserBusinessData', { error: error.message, userId });
      throw error;
    }
  }

  private async analyzeMarketSignals(
    userId: number,
    businessData: UserBusinessData
  ): Promise<DataDrivenSignals> {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const currentStart = new Date(now.getTime() - 14 * dayMs);
    const previousStart = new Date(currentStart.getTime() - 14 * dayMs);
    const operationsStart = new Date(now.getTime() - 90 * dayMs);

    const [
      recentOpportunities,
      previousOpportunities,
      userRecentOpportunities,
      userOperations
    ] = await Promise.all([
      // ‘£‡ A1-A2: Filtrar por userId para prevenir data leakage
      prisma.opportunity.findMany({
        where: { 
          userId, // ‘£‡ Solo oportunidades del usuario actual
          createdAt: { gte: currentStart } 
        },
        select: {
          title: true,
          costUsd: true,
          suggestedPriceUsd: true,
          profitMargin: true,
          roiPercentage: true,
          confidenceScore: true,
          marketDemand: true,
          targetMarketplaces: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      // ‘£‡ A1-A2: Filtrar por userId para prevenir data leakage
      prisma.opportunity.findMany({
        where: {
          userId, // ‘£‡ Solo oportunidades del usuario actual
          createdAt: {
            gte: previousStart,
            lt: currentStart,
          },
        },
        select: {
          targetMarketplaces: true,
        },
        take: 300,
      }),
      prisma.opportunity.findMany({
        where: {
          userId,
          createdAt: { gte: currentStart },
        },
        select: {
          title: true,
        },
        take: 50,
      }),
      prisma.successfulOperation.findMany({
        where: {
          userId,
          createdAt: { gte: operationsStart },
        },
        include: {
          product: {
            select: {
              title: true,
              category: true,
              suggestedPrice: true,
              aliexpressPrice: true,
              finalPrice: true,
            },
          },
          sale: {
            select: {
              marketplace: true,
            },
          },
        },
        orderBy: [{ totalProfit: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      }),
    ]);

    let operations = userOperations;
    if (!operations.length) {
      operations = await prisma.successfulOperation.findMany({
        where: {
          createdAt: { gte: operationsStart },
        },
        include: {
          product: {
            select: {
              title: true,
              category: true,
              suggestedPrice: true,
              aliexpressPrice: true,
              finalPrice: true,
            },
          },
          sale: {
            select: {
              marketplace: true,
            },
          },
        },
        orderBy: [{ totalProfit: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      });
    }

    type MutableSegmentStat = {
      key: string;
      displayName: string;
      count: number;
      score: number;
      marginSum: number;
      roiSum: number;
      profitSum: number;
      suggestedSum: number;
      marketplaces: Map<string, number>;
      sample?: SegmentStat['sample'];
    };

    const segmentMap = new Map<string, MutableSegmentStat>();
    const hotProducts: HotProductSignal[] = [];
    const currentDemandMap = new Map<string, number>();

    for (const opp of recentOpportunities) {
      const segments = extractSegmentsFromTitle(opp.title);
      if (!segments.length) continue;

      const marketplaces = parseMarketplaceArray(opp.targetMarketplaces);
      if (!marketplaces.length) {
        marketplaces.push('ebay');
      }

      const margin = typeof opp.profitMargin === 'number' ? opp.profitMargin : 0;
      const roi = typeof opp.roiPercentage === 'number' ? opp.roiPercentage : 0;
      const confidence =
        typeof opp.confidenceScore === 'number' ? opp.confidenceScore : 0;
      const baseScore =
        margin * 120 + roi + confidence * 80 + (opp.marketDemand === 'real' ? 15 : 0);
      const profitPerUnit = Math.max(
        0,
        (opp.suggestedPriceUsd || 0) - (opp.costUsd || 0)
      );
      const keyword = segments[0];

      for (const marketplace of marketplaces) {
        currentDemandMap.set(
          marketplace,
          (currentDemandMap.get(marketplace) || 0) + 1
        );
      }

      for (const segment of segments) {
        const key = segment;
        let stat = segmentMap.get(key);
        if (!stat) {
          stat = {
            key,
            displayName: formatSegmentName(segment),
            count: 0,
            score: 0,
            marginSum: 0,
            roiSum: 0,
            profitSum: 0,
            suggestedSum: 0,
            marketplaces: new Map<string, number>(),
          };
          segmentMap.set(key, stat);
        }

        stat.count += 1;
        stat.score += baseScore;
        stat.marginSum += margin;
        stat.roiSum += roi;
        stat.profitSum += profitPerUnit;
        stat.suggestedSum += toNumber(opp.suggestedPriceUsd || 0);
        for (const marketplace of marketplaces) {
          stat.marketplaces.set(
            marketplace,
            (stat.marketplaces.get(marketplace) || 0) + 1
          );
        }
        if (!stat.sample || margin > stat.sample.profitMargin) {
          stat.sample = {
            title: opp.title,
            profitMargin: margin,
            roiPercentage: roi,
            marketplaces,
            keyword,
          };
        }
      }

      if (margin >= 0.3) {
        hotProducts.push({
          title: opp.title,
          profitMargin: margin,
          roiPercentage: roi,
          suggestedPriceUsd: toNumber(opp.suggestedPriceUsd || 0),
          costUsd: toNumber(opp.costUsd || 0),
          marketplaces,
        });
      }
    }

    const previousDemandMap = new Map<string, number>();
    for (const opp of previousOpportunities) {
      const marketplaces = parseMarketplaceArray(opp.targetMarketplaces);
      for (const marketplace of marketplaces) {
        previousDemandMap.set(
          marketplace,
          (previousDemandMap.get(marketplace) || 0) + 1
        );
      }
    }

    const segments = Array.from(segmentMap.values())
      .map<SegmentStat>((stat) => ({
        key: stat.key,
        displayName: stat.displayName,
        count: stat.count,
        score: stat.score,
        avgMargin: stat.count ? stat.marginSum / stat.count : 0,
        avgRoi: stat.count ? stat.roiSum / stat.count : 0,
        avgProfitPerUnit: stat.count ? stat.profitSum / stat.count : 0,
        avgSuggestedPrice: stat.count ? stat.suggestedSum / stat.count : 0,
        marketplaces: Array.from(stat.marketplaces.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
        sample:
          stat.sample || {
            title: '',
            profitMargin: 0,
            roiPercentage: 0,
            marketplaces: [],
          },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const hotProductSignals = hotProducts
      .sort((a, b) => {
        const marginDiff = b.profitMargin - a.profitMargin;
        if (Math.abs(marginDiff) > 0.02) {
          return marginDiff;
        }
        return b.roiPercentage - a.roiPercentage;
      })
      .slice(0, 6);

    const marketplacesSeen = new Set<string>([
      ...currentDemandMap.keys(),
      ...previousDemandMap.keys(),
    ]);

    const marketplaceDemand: MarketplaceDemandSignal[] = Array.from(
      marketplacesSeen.values()
    )
      .map((marketplace) => {
        const current = currentDemandMap.get(marketplace) || 0;
        const previous = previousDemandMap.get(marketplace) || 0;
        const { trend, changePct } = calculateTrend(current, previous);
        return {
          marketplace,
          current,
          previous,
          changePct: Math.round(changePct * 10) / 10,
          trend,
        };
      })
      .sort((a, b) => b.current - a.current);

    const winningOperations: WinningOperationSignal[] = operations
      .map((op) => {
        const totalProfit = toNumber(op.totalProfit || op.expectedProfit || 0);
        const investment = toNumber(
          op.product?.aliexpressPrice ||
          op.product?.suggestedPrice ||
          op.product?.finalPrice ||
          1
        );
        const roi =
          investment > 0 ? (totalProfit / investment) * 100 : toNumber(op.profitAccuracy || 0);
        return {
          title: op.product?.title || 'Producto sin t+°tulo',
          marketplace: op.sale?.marketplace || 'marketplace',
          totalProfit: Math.round(totalProfit * 100) / 100,
          roi: Math.round(roi * 10) / 10,
          daysToComplete: op.daysToComplete || 0,
          category: op.product?.category || undefined,
        };
      })
      .filter((op) => op.totalProfit > 0)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 5);

    const confidenceNotes: string[] = [];
    if (segments.length) {
      const top = segments[0];
      confidenceNotes.push(
        `Segmento ${top.displayName} gener+¶ ${top.count} oportunidades con margen promedio ${Math.round(
          top.avgMargin * 100
        )}% y ROI ${Math.round(top.avgRoi)}%.`
      );
    }

    for (const demand of marketplaceDemand.slice(0, 2)) {
      if (demand.trend === 'up') {
        confidenceNotes.push(
          `${demand.marketplace} muestra incremento de demanda del ${demand.changePct.toFixed(
            1
          )}% en las +¶ltimas 2 semanas.`
        );
      } else if (demand.trend === 'down') {
        confidenceNotes.push(
          `${demand.marketplace} redujo demanda ${Math.abs(demand.changePct).toFixed(
            1
          )}% respecto al per+°odo anterior.`
        );
      }
    }

    if (winningOperations.length) {
      const op = winningOperations[0];
      confidenceNotes.push(
        `Operaci+¶n exitosa "${op.title}" en ${op.marketplace} alcanz+¶ ROI ${op.roi}% con ganancia $${op.totalProfit.toFixed(
          2
        )}.`
      );
    }

    if (businessData.bestCategory) {
      confidenceNotes.push(
        `Mejor categor+°a hist+¶rica del negocio: ${businessData.bestCategory}.`
      );
    }

    if (userRecentOpportunities.length === 0 && recentOpportunities.length > 0) {
      confidenceNotes.push(
        'Tus oportunidades recientes est+Ìn vac+°as: aprovecha los segmentos detectados para cargar nuevos productos.'
      );
    }

    return {
      segments,
      hotProducts: hotProductSignals,
      winningOperations,
      marketplaceDemand,
      confidenceNotes,
    };
  }

  private buildDataDrivenSuggestions(
    userId: number,
    signals: DataDrivenSignals,
    businessData: UserBusinessData,
    category?: string
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    const filterType = category && category !== 'all' ? category : null;
    let counter = 0;

    const pushSuggestion = (suggestion: AISuggestion) => {
      if (!filterType || suggestion.type === filterType) {
        suggestions.push(suggestion);
      }
    };

    const makeId = (prefix: string) => `${prefix}_${Date.now()}_${counter++}`;

    signals.segments.slice(0, 3).forEach((segment) => {
      const mainMarketplace = segment.marketplaces[0]?.name || 'ebay';
      const avgMarginPct = Math.round(segment.avgMargin * 100);
      const roiPct = Math.round(segment.avgRoi);
      // ‘£‡ CORREGIDO: C+Ìlculo seguro de estimatedRevenue evitando desbordamientos
      const profitPerUnit = Math.max(0, Math.min(segment.avgProfitPerUnit || 0, 10000)); // Limitar a $10k por unidad
      const opportunityCount = Math.max(1, Math.min(segment.count || 1, 100)); // Limitar a 100 oportunidades
      const estimatedRevenue = Math.max(
        60,
        Math.min(
          1000000, // M+Ìximo $1M de impacto
          Math.round(profitPerUnit * Math.min(opportunityCount, 20)) // M+Ìximo 20 oportunidades para c+Ìlculo
        )
      );
      const confidence = Math.min(
        95,
        Math.max(60, Math.round((segment.score / (segment.count || 1)) || 60))
      );
      const priority: 'high' | 'medium' =
        segment.avgMargin >= 0.4 || roiPct >= 50 ? 'high' : 'medium';

      pushSuggestion({
        id: makeId('segment'),
        type: 'inventory',
        priority,
        title: `Expandir cat+Ìlogo en ${segment.displayName} orientado a ${mainMarketplace}`,
        description: `En las +¶ltimas 2 semanas detectamos ${segment.count} oportunidades en ${segment.displayName} con margen promedio ${avgMarginPct}% y ROI ${roiPct}%. Aprovecha el impulso publicando nuevos productos desde AliExpress hacia ${mainMarketplace}.`,
        impact: {
          revenue: estimatedRevenue,
          time: 3,
          difficulty: 'medium',
        },
        confidence,
        actionable: true,
        implemented: false,
        estimatedTime: '90 minutos',
        requirements: [
          'Credenciales activas de AliExpress y marketplaces',
          'Workflow de publicaci+¶n configurado en modo asistido o autom+Ìtico',
          `Listado de palabras clave relacionadas con "${segment.sample.keyword || segment.displayName}"`,
        ],
        steps: [
          'Ir a Oportunidades ‘Â∆ Buscar y usar las palabras clave del segmento detectado.',
          `Filtrar productos con margen m+°nimo ${Math.max(35, avgMarginPct - 5)}% y ROI > ${Math.max(
            40,
            roiPct - 5
          )}%.`,
          `Crear productos desde las oportunidades de mayor confianza y lanzar publicaci+¶n en ${mainMarketplace}.`,
          'Activar seguimiento de ventas para retroalimentar el motor de IA (Reports ‘Â∆ Tracking).',
        ],
        relatedProducts: segment.sample.title ? [segment.sample.title] : undefined,
        metrics: {
          currentValue: avgMarginPct,
          targetValue: Math.min(95, avgMarginPct + 8),
          unit: '%',
        },
        createdAt: new Date().toISOString(),
      });
    });

    signals.hotProducts.slice(0, 2).forEach((product) => {
      const marginPct = Math.round(product.profitMargin * 100);
      const targetPrice = product.suggestedPriceUsd || 0;
      const profitUnit = Math.max(0, Math.min(targetPrice - product.costUsd, 10000)); // Limitar a $10k de ganancia por unidad
      // ‘£‡ CORREGIDO: C+Ìlculo seguro de expectedRevenue evitando desbordamientos
      const expectedRevenue = Math.max(
        50,
        Math.min(
          500000, // M+Ìximo $500k de impacto
          Math.round(profitUnit * Math.min(8, 50)) // M+Ìximo 50 unidades para c+Ìlculo
        )
      );
      const confidence = Math.min(
        92,
        Math.max(55, Math.round(marginPct + product.roiPercentage / 2))
      );
      pushSuggestion({
        id: makeId('pricing'),
        type: 'pricing',
        priority: marginPct >= 40 ? 'high' : 'medium',
        title: `Optimizar pricing para "${product.title.slice(0, 70)}" en ${product.marketplaces.join(', ')}`,
        description: `El producto presenta un margen del ${marginPct}% con ROI ${Math.round(
          product.roiPercentage
        )}%. Ajusta el precio de venta a $${targetPrice.toFixed(
          2
        )} USD y programa repricing autom+Ìtico para permanecer competitivo en ${product.marketplaces.join(
          ', '
        )}.`,
        impact: {
          revenue: expectedRevenue,
          time: 1,
          difficulty: 'easy',
        },
        confidence,
        actionable: true,
        implemented: false,
        estimatedTime: '45 minutos',
        requirements: [
          'Listado publicado en el marketplace objetivo',
          'Configuraci+¶n de marketplace en modo sandbox/prod correcta',
          'Datos de fees actualizados (Settings ‘Â∆ Fees)',
        ],
        steps: [
          'Comparar precio actual vs top competidores.',
          'Ajustar el precio en Products ‘Â∆ Editar y reflejar el margen objetivo.',
          'Configurar regla de repricing autom+Ìtico con margen m+°nimo 5% inferior al promedio.',
          'Monitorear conversiones durante 48h y registrar resultados en Reports.',
        ],
        relatedProducts: [product.title],
        metrics: {
          currentValue: marginPct,
          targetValue: Math.min(95, marginPct + 7),
          unit: '%',
        },
        createdAt: new Date().toISOString(),
      });
    });

    signals.winningOperations.slice(0, 2).forEach((operation) => {
      const confidence = Math.min(90, Math.max(60, Math.round(operation.roi)));
      // ‘£‡ CORREGIDO: C+Ìlculo seguro de expectedRevenue evitando desbordamientos
      const totalProfit = Math.max(0, Math.min(operation.totalProfit || 0, 50000)); // Limitar a $50k de ganancia
      const expectedRevenue = Math.max(
        70,
        Math.min(
          200000, // M+Ìximo $200k de impacto
          Math.round(totalProfit * Math.min(2, 10)) // M+Ìximo multiplicador de 10
        )
      );
      pushSuggestion({
        id: makeId('automation'),
        type: 'automation',
        priority: operation.roi >= 60 ? 'high' : 'medium',
        title: `Automatizar relanzamiento de "${operation.title}" en ${operation.marketplace}`,
        description: `La +¶ltima operaci+¶n complet+¶ en ${operation.daysToComplete} d+°as con ROI ${operation.roi}% y beneficio $${operation.totalProfit.toFixed(
          2
        )}. Configura una regla para repostear autom+Ìticamente cuando el ROI proyectado supere ${Math.max(
          40,
          Math.round(operation.roi * 0.8)
        )}%.`,
        impact: {
          revenue: expectedRevenue,
          time: 2,
          difficulty: 'medium',
        },
        confidence,
        actionable: true,
        implemented: false,
        estimatedTime: '120 minutos',
        requirements: [
          'Workflow stagePublish en modo asistido o autom+Ìtico',
          'Stock disponible en proveedor AliExpress',
          'Reglas de profit threshold definidas',
        ],
        steps: [
          'Ir a Automation ‘Â∆ Reglas y crear regla "Replicar +Æxito".',
          `Definir condici+¶n: ROI previsto ‘Î— ${Math.max(
            40,
            Math.round(operation.roi * 0.8)
          )}% y margen ‘Î— 30%`,
          `Acci+¶n: publicar autom+Ìticamente en ${operation.marketplace} con sincronizaci+¶n de inventario cada 6h.`,
          'Programar revisi+¶n semanal para ajustar umbrales.',
        ],
        relatedProducts: [operation.title],
        metrics: {
          currentValue: operation.roi,
          targetValue: Math.min(120, operation.roi + 15),
          unit: '%',
        },
        createdAt: new Date().toISOString(),
      });
    });

    const trendingMarketplace = signals.marketplaceDemand.find((item) => item.trend === 'up');
    if (trendingMarketplace) {
      // ‘£‡ CORREGIDO: C+Ìlculo seguro de revenue evitando desbordamientos
      const avgProfitPerUnit = Math.max(0, Math.min(signals.segments[0]?.avgProfitPerUnit || 10, 10000));
      pushSuggestion({
        id: makeId('marketing'),
        type: 'marketing',
        priority: 'medium',
        title: `Impulsar visibilidad en ${trendingMarketplace.marketplace}`,
        description: `${trendingMarketplace.marketplace} increment+¶ la demanda ${trendingMarketplace.changePct.toFixed(
          1
        )}% comparado con el per+°odo anterior. Lanza campa+¶a promocional enfocada en los segmentos con mayor margen detectados.`,
        impact: {
          revenue: Math.max(
            80,
            Math.min(
              100000, // M+Ìximo $100k de impacto
              Math.round(avgProfitPerUnit * Math.min(10, 50)) // M+Ìximo 50 unidades
            )
          ),
          time: 2,
          difficulty: 'medium',
        },
        confidence: 70,
        actionable: true,
        implemented: false,
        estimatedTime: '75 minutos',
        requirements: [
          `Credenciales v+Ìlidas de ${trendingMarketplace.marketplace}`,
          'Listado de productos con margen ‘Î— 35%',
          'Presupuesto promocional configurado en marketplace',
        ],
        steps: [
          `Identificar 5 productos prioritarios dentro de ${signals.segments[0]?.displayName || 'los segmentos detectados'}.`,
          `Crear campa+¶a promocional destacando env+°o y ROI proyectado.`,
          'Configurar m+Ætricas de seguimiento y revisar a los 3 d+°as.',
          'Registrar aprendizaje en Reports ‘Â∆ Insights para retroalimentar la IA.',
        ],
        metrics: {
          currentValue: trendingMarketplace.current,
          targetValue: trendingMarketplace.current + Math.max(5, Math.round(trendingMarketplace.current * 0.2)),
          unit: 'listings',
        },
        createdAt: new Date().toISOString(),
      });
    }

    if (signals.confidenceNotes.length) {
      pushSuggestion({
        id: makeId('optimization'),
        type: 'optimization',
        priority: 'medium',
        title: 'Actualizar tablero de inteligencia con se+¶ales recientes',
        description: `Resumen de se+¶ales detectadas por la IA:\n- ${signals.confidenceNotes.join(
          '\n- '
        )}\nUtiliza estos datos para ajustar tu estrategia de b+¶squeda, pricing y automatizaci+¶n.`,
        impact: {
          revenue: 40,
          time: 1,
          difficulty: 'easy',
        },
        confidence: 65,
        actionable: true,
        implemented: false,
        estimatedTime: '30 minutos',
        requirements: [
          'Revisar Dashboard ‘Â∆ Inteligencia antes de la siguiente b+¶squeda',
          'Documentar ajustes en Notas del usuario',
        ],
        steps: [
          'Registrar en tu plan semanal las acciones priorizadas por la IA.',
          'Alinear filtros de b+¶squeda en oportunidades con los segmentos destacados.',
          'Ajustar reglas de automatizaci+¶n seg+¶n los ROI detectados.',
        ],
        createdAt: new Date().toISOString(),
      });
    }

    return suggestions;
  }

  /**
   * ‘£‡ OBJETIVO A: Generar sugerencias de keywords basadas en tendencias
   */
  async generateKeywordSuggestions(userId: number, maxSuggestions: number = 10): Promise<AISuggestion[]> {
    try {
      const keywordSuggestions = await trendSuggestionsService.generateKeywordSuggestions(userId, maxSuggestions);
      
      // Convertir KeywordSuggestion a AISuggestion
      return keywordSuggestions.map((kw, index) => ({
        id: `keyword_${Date.now()}_${index}`,
        type: 'search' as const,
        priority: kw.priority,
        title: `Buscar oportunidades: "${kw.keyword}"`,
        description: kw.reason,
        impact: {
          // ‘£‡ CORREGIDO: C+Ìlculo seguro de revenue evitando desbordamientos
          revenue: Math.max(
            50,
            Math.min(
              50000, // M+Ìximo $50k de impacto por keyword
              Math.round((kw.estimatedOpportunities || 5) * Math.min(10, 100)) // M+Ìximo 100 por oportunidad
            )
          ),
          time: 1,
          difficulty: 'easy' as const,
        },
        confidence: kw.confidence,
        actionable: true,
        implemented: false,
        estimatedTime: '5 minutos',
        requirements: [
          `Credenciales activas de AliExpress`,
          `Credenciales de ${kw.targetMarketplaces.join(' o ')} configuradas`,
        ],
        steps: [
          `Ir a Oportunidades y buscar "${kw.keyword}"`,
          `Filtrar por marketplace: ${kw.targetMarketplaces.join(', ')}`,
          `Revisar oportunidades con margen ‘Î— ${Math.round((kw.supportingMetric.type === 'margin' ? kw.supportingMetric.value : 30))}%`,
          `Importar las mejores oportunidades y publicarlas`,
        ],
        keyword: kw.keyword,
        keywordCategory: kw.category,
        keywordSegment: kw.segment,
        keywordReason: kw.reason,
        keywordSupportingMetric: kw.supportingMetric,
        targetMarketplaces: kw.targetMarketplaces,
        estimatedOpportunities: kw.estimatedOpportunities,
        metrics: {
          currentValue: kw.supportingMetric.value,
          targetValue: kw.estimatedOpportunities,
          unit: kw.supportingMetric.unit,
        },
        createdAt: new Date().toISOString(),
      }));
    } catch (error: any) {
      logger.error('Error generating keyword suggestions', {
        error: error?.message || String(error),
        userId,
        stack: error?.stack
      });
      return [];
    }
  }

  /**
   * Generar sugerencias IA usando GROQ
   */
  async generateSuggestions(userId: number, category?: string): Promise<AISuggestion[]> {
    let dataDrivenSuggestions: AISuggestion[] = [];
    try {
      // ‘£‡ Obtener datos del negocio primero (puede fallar si no hay datos)
      let businessData: UserBusinessData;
      try {
        businessData = await this.getUserBusinessData(userId);
      } catch (dataError: any) {
        logger.error('AISuggestions: Error obteniendo datos del negocio', { error: dataError.message, userId });
        // Si falla, usar datos por defecto
        businessData = {
          totalSales: 0,
          totalRevenue: 0,
          totalProfit: 0,
          activeProducts: 0,
          averageProfitMargin: 0,
          bestCategory: 'General',
          worstCategory: 'General',
          products: [],
          recentOpportunities: 0
        };
      }

      let signals: DataDrivenSignals | null = null;
      try {
        signals = await this.analyzeMarketSignals(userId, businessData);
        dataDrivenSuggestions = this.buildDataDrivenSuggestions(userId, signals, businessData, category);
      } catch (signalsError: any) {
        logger.warn('AISuggestions: No se pudieron analizar se+¶ales de mercado', {
          error: signalsError?.message || signalsError,
          userId,
        });
      }

      // ‘£‡ OBJETIVO A: Incluir sugerencias de keywords en las sugerencias generales
      const keywordSuggestions = await this.generateKeywordSuggestions(userId, 5);

      // Obtener credenciales de GROQ
      let groqCredentials: any = null;
      try {
        groqCredentials = await CredentialsManager.getCredentials(userId, 'groq', 'production');
        
        // ‘£‡ Validar que las credenciales est+Æn presentes y sean v+Ìlidas
        if (groqCredentials && groqCredentials.apiKey) {
          // Limpiar espacios en blanco
          groqCredentials.apiKey = String(groqCredentials.apiKey).trim();
          
          // Validar que la API key no est+Æ vac+°a
          if (!groqCredentials.apiKey || groqCredentials.apiKey.length < 10) {
            logger.warn('AISuggestions: GROQ API key inv+Ìlida (muy corta o vac+°a)', { 
              apiKeyLength: groqCredentials.apiKey?.length || 0 
            });
            groqCredentials = null;
          } else {
            logger.info('AISuggestions: Credenciales GROQ obtenidas correctamente', { 
              hasApiKey: !!groqCredentials.apiKey,
              apiKeyPrefix: groqCredentials.apiKey.substring(0, 10) + '...',
              model: groqCredentials.model || 'default'
            });
          }
        }
      } catch (credError: any) {
        logger.warn('AISuggestions: Error obteniendo credenciales GROQ', { error: credError.message });
        // Continuar sin GROQ, usar fallback
        groqCredentials = null;
      }

      if (!groqCredentials || !groqCredentials.apiKey) {
        logger.warn('AISuggestions: GROQ API no configurada, usando sugerencias de fallback');
        if (dataDrivenSuggestions.length) {
          try {
            await this.saveSuggestions(userId, dataDrivenSuggestions);
          } catch (storeError: any) {
            logger.warn('AISuggestions: No se pudieron guardar sugerencias data-driven', {
              error: storeError?.message || storeError,
            });
          }
          return dataDrivenSuggestions;
        }
        return this.generateFallbackSuggestions(userId);
      }

      // Generar prompt para IA
      const prompt = this.buildPrompt(businessData, signals || undefined, category);

      // Llamar a GROQ API
      let response: any;
      try {
        // ‘£‡ Asegurar que la API key est+Æ limpia
        const cleanApiKey = String(groqCredentials.apiKey).trim();
        const model = groqCredentials.model || 'llama-3.3-70b-versatile';
        
        logger.info('AISuggestions: Llamando a GROQ API', { 
          model,
          apiKeyPrefix: cleanApiKey.substring(0, 10) + '...',
          promptLength: prompt.length
        });

        response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages: [
            {
              role: 'system',
              content: 'Eres un consultor experto en DROPSHIPPING automatizado. Especializado en optimizaci+¶n de flujos AliExpress ‘Â∆ Marketplaces (eBay, Amazon, MercadoLibre). Genera sugerencias ESPEC+ÏFICAS de dropshipping automatizado, NO gen+Æricas de e-commerce. Todas las sugerencias deben estar relacionadas con: scraping de AliExpress, publicaci+¶n en marketplaces, optimizaci+¶n de precios competitivos, gesti+¶n de inventario virtual, automatizaci+¶n del flujo. Responde SOLO en formato JSON v+Ìlido.'
            },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${cleanApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        logger.info('AISuggestions: Respuesta exitosa de GROQ API', { 
          hasContent: !!response.data?.choices?.[0]?.message?.content 
        });
      } catch (apiError: any) {
        // ‘£‡ Logging m+Ìs detallado para diagnosticar el 401
        const errorDetails: any = {
          error: apiError.message,
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          userId,
          apiKeyPrefix: groqCredentials.apiKey ? String(groqCredentials.apiKey).trim().substring(0, 10) + '...' : 'N/A'
        };
        
        // Si hay respuesta del servidor, incluir m+Ìs detalles
        if (apiError.response) {
          errorDetails.responseData = apiError.response.data;
          errorDetails.responseHeaders = apiError.response.headers;
        }
        
        logger.error('AISuggestions: Error llamando a GROQ API', errorDetails);
        
        // Si es 401, sugerir verificar la API key
        if (apiError.response?.status === 401) {
          logger.warn('AISuggestions: GROQ API retorn+¶ 401 (Unauthorized). Verifica que la API key sea v+Ìlida y est+Æ activa.');
        }
        
        return this.generateFallbackSuggestions(userId);
      }

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        logger.warn('AISuggestions: Respuesta vac+°a de GROQ');
        return this.generateFallbackSuggestions(userId);
      }

      // Parsear respuesta JSON
      let aiResponse: any;
      try {
        aiResponse = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (e) {
        logger.error('AISuggestions: Error parseando JSON de GROQ', { content });
        return this.generateFallbackSuggestions(userId);
      }

      // Convertir respuesta de IA a formato AISuggestion
      const aiSuggestions = this.parseAISuggestions(aiResponse, businessData);

      const mergedSuggestions: AISuggestion[] = [];
      const seenTitles = new Set<string>();

      const merge = (list: AISuggestion[]) => {
        for (const suggestion of list) {
          const key = suggestion.title.toLowerCase();
          if (seenTitles.has(key)) continue;
          seenTitles.add(key);
          mergedSuggestions.push(suggestion);
        }
      };

      merge(dataDrivenSuggestions);
      merge(aiSuggestions);
      merge(keywordSuggestions); // ‘£‡ OBJETIVO A: Incluir sugerencias de keywords

      if (!mergedSuggestions.length) {
        merge(await this.generateFallbackSuggestions(userId));
      }

      // ‘£‡ Priorizar sugerencias de keywords al inicio si hay suficientes
      const keywordSuggestionsOnly = mergedSuggestions.filter(s => s.type === 'search');
      const otherSuggestions = mergedSuggestions.filter(s => s.type !== 'search');
      const finalSuggestions = [...keywordSuggestionsOnly.slice(0, 5), ...otherSuggestions.slice(0, 10 - keywordSuggestionsOnly.length)];

      if (finalSuggestions.length > 0) {
        try {
          await this.saveSuggestions(userId, finalSuggestions);
          logger.info(`AISuggestions: ${finalSuggestions.length} sugerencias guardadas para usuario ${userId}`);
        } catch (saveError: any) {
          logger.warn('AISuggestions: Error guardando sugerencias (no cr+°tico)', { error: saveError.message });
          // Continuar y retornar sugerencias de todos modos
        }
      }

      return finalSuggestions;

    } catch (error: any) {
      logger.error('AISuggestions: Error generando sugerencias', { 
        error: error.message, 
        stack: error.stack,
        userId 
      });
      // ‘£‡ Asegurar que siempre retornamos algo, nunca lanzamos error
      try {
        if (dataDrivenSuggestions.length) {
          return dataDrivenSuggestions;
        }
        return this.generateFallbackSuggestions(userId);
      } catch (fallbackError: any) {
        logger.error('AISuggestions: Error incluso en fallback', { error: fallbackError.message });
        // Retornar array vac+°o como +¶ltimo recurso
        return [];
      }
    }
  }

  /**
   * Construir prompt para IA
   */
  private buildPrompt(data: UserBusinessData, signals?: DataDrivenSignals, category?: string): string {
    const segmentSummary = signals?.segments?.length
      ? signals.segments
          .slice(0, 5)
          .map((segment, index) => {
            const marketplaces = segment.marketplaces.slice(0, 2).map((m) => m.name).join(', ') || 'N/A';
            return `${index + 1}. ${segment.displayName}: margen promedio ${Math.round(
              segment.avgMargin * 100
            )}%, ROI ${Math.round(segment.avgRoi)}%, marketplaces clave: ${marketplaces}`;
          })
          .join('\n')
      : 'No se detectaron segmentos destacados en las +¶ltimas 2 semanas.';

    const hotProductsSummary = signals?.hotProducts?.length
      ? signals.hotProducts
          .slice(0, 4)
          .map(
            (product, index) =>
              `${index + 1}. ${product.title} ‘Â∆ margen ${Math.round(product.profitMargin * 100)}%, ROI ${Math.round(
                product.roiPercentage
              )}%, marketplaces sugeridos: ${product.marketplaces.join(', ')}`
          )
          .join('\n')
      : 'Sin productos destacados con ROI alto en las +¶ltimas 2 semanas.';

    const marketplaceDemandSummary = signals?.marketplaceDemand?.length
      ? signals.marketplaceDemand
          .slice(0, 4)
          .map(
            (item) =>
              `‘«Û ${item.marketplace}: demanda actual ${item.current}, cambio ${item.changePct.toFixed(
                1
              )}% (${item.trend})`
          )
          .join('\n')
      : 'No hay variaciones significativas de demanda por marketplace.';

    const operationsSummary = signals?.winningOperations?.length
      ? signals.winningOperations
          .slice(0, 3)
          .map(
            (op, index) =>
              `${index + 1}. ${op.title} en ${op.marketplace} ‘Â∆ ROI ${op.roi}% con beneficio $${op.totalProfit.toFixed(
                2
              )}`
          )
          .join('\n')
      : 'Sin operaciones exitosas recientes registradas.';

    const notesSummary = signals?.confidenceNotes?.length
      ? signals.confidenceNotes.map((note) => `- ${note}`).join('\n')
      : '- Sin notas adicionales.';

    return `Eres un consultor experto en DROPSHIPPING automatizado. Analiza los siguientes datos de un negocio de dropshipping que opera con AliExpress como proveedor y publica en marketplaces (eBay, Amazon, MercadoLibre).

CONTEXTO DEL SISTEMA:
- Este es un sistema automatizado de dropshipping
- Fuente de productos: AliExpress (scraping automatizado)
- Canales de venta: eBay, Amazon, MercadoLibre (publicaci+¶n automatizada)
- El sistema tiene: b+¶squeda de oportunidades, scraping, publicaci+¶n autom+Ìtica, gesti+¶n de inventario virtual, c+Ìlculo de comisiones

DATOS DEL NEGOCIO:
- Ventas totales: ${data.totalSales}
- Ingresos totales: $${data.totalRevenue.toFixed(2)}
- Ganancia total: $${data.totalProfit.toFixed(2)}
- Productos activos: ${data.activeProducts}
- Margen de ganancia promedio: ${data.averageProfitMargin.toFixed(1)}%
- Mejor categor+°a: ${data.bestCategory}
- Categor+°a con menor rendimiento: ${data.worstCategory}
- Oportunidades recientes encontradas: ${data.recentOpportunities}

SE+ÊALES RECIENTES DETECTADAS (+¶ltimos 14 d+°as):
Segmentos con mayor margen:
${segmentSummary}

Productos con mejor ROI:
${hotProductsSummary}

Demanda por marketplace:
${marketplaceDemandSummary}

Operaciones exitosas:
${operationsSummary}

Notas de confianza IA:
${notesSummary}

${category ? `FILTRO: Genera solo sugerencias de tipo "${category}"` : 'GENERA SUGERENCIAS EN TODAS LAS CATEGOR+ÏAS'}

IMPORTANTE: Las sugerencias DEBEN ser ESPEC+ÏFICAS para DROPSHIPPING automatizado, NO gen+Æricas de e-commerce.

TIPOS DE SUGERENCIAS ESPEC+ÏFICAS PARA DROPSHIPPING:

1. PRICING (Optimizaci+¶n de precios):
   - Ajustar precios bas+Ìndose en competencia de marketplaces espec+°ficos
   - Implementar repricing autom+Ìtico seg+¶n cambios en AliExpress
   - Optimizar m+Ìrgenes considerando fees de marketplaces
   - Ejemplo: "Ajustar precios en eBay para competir con Amazon en categor+°a ${data.bestCategory}"

2. INVENTORY (Gesti+¶n de inventario virtual):
   - Sincronizar disponibilidad entre marketplaces
   - Gestionar productos sin stock en AliExpress
   - Automatizar pausa de listados cuando AliExpress no tiene stock
   - Ejemplo: "Configurar sincronizaci+¶n autom+Ìtica de inventario entre eBay y MercadoLibre"

3. MARKETING (Campa+¶as espec+°ficas de marketplaces):
   - Optimizar promociones en marketplaces espec+°ficos
   - Mejorar visibilidad en b+¶squedas de eBay/Amazon/MercadoLibre
   - Ejemplo: "Crear campa+¶a promocional en MercadoLibre para productos de ${data.bestCategory}"

4. LISTING (Optimizaci+¶n de listados):
   - Mejorar t+°tulos y descripciones para SEO de marketplaces
   - Optimizar keywords para b+¶squedas en AliExpress
   - Mejorar im+Ìgenes y especificaciones para conversi+¶n
   - Ejemplo: "Optimizar t+°tulos de productos en ${data.worstCategory} para mejorar ranking en b+¶squedas de eBay"

5. OPTIMIZATION (Optimizaciones del flujo):
   - Mejorar velocidad de publicaci+¶n desde AliExpress
   - Optimizar selecci+¶n de productos rentables
   - Mejorar filtrado de oportunidades
   - Ejemplo: "Filtrar oportunidades de ${data.worstCategory} para enfocarse en ${data.bestCategory}"

6. AUTOMATION (Automatizaciones del flujo):
   - Automatizar publicaci+¶n desde oportunidades encontradas
   - Configurar reglas de auto-aprobaci+¶n de productos
   - Automatizar repricing seg+¶n competencia
   - Ejemplo: "Configurar auto-publicaci+¶n de productos con margen >40% desde AliExpress a eBay"

Genera entre 5-8 sugerencias ESPEC+ÏFICAS DE DROPSHIPPING en formato JSON:
{
  "suggestions": [
    {
      "type": "pricing|inventory|marketing|listing|optimization|automation",
      "priority": "high|medium|low",
      "title": "T+°tulo espec+°fico de dropshipping (ej: 'Optimizar precios en eBay bas+Ìndose en competencia de Amazon')",
      "description": "Descripci+¶n detallada espec+°fica para dropshipping automatizado, mencionando AliExpress y marketplaces",
      "impactRevenue": n+¶mero_estimado,
      "impactTime": n+¶mero_horas_ahorradas,
      "difficulty": "easy|medium|hard",
      "confidence": n+¶mero_0_100,
      "estimatedTime": "X minutos/horas",
      "requirements": ["requisito espec+°fico de dropshipping"],
      "steps": ["paso espec+°fico relacionado con AliExpress/marketplaces"],
      "relatedProducts": ["producto espec+°fico si aplica"] (opcional),
      "metrics": {
        "currentValue": n+¶mero,
        "targetValue": n+¶mero,
        "unit": "USD|%|unidades"
      } (opcional)
    }
  ]
}

REGLAS ESTRICTAS:
- NO generar sugerencias gen+Æricas como "crear listados atractivos" o "mejorar sitio web"
- SIEMPRE mencionar AliExpress, marketplaces (eBay/Amazon/MercadoLibre), o automatizaci+¶n
- Las sugerencias deben ser accionables dentro del sistema de dropshipping
- Basarse en los datos reales proporcionados (m+Ìrgenes, categor+°as, ventas)
- Priorizar sugerencias que mejoren el flujo automatizado AliExpress ‘Â∆ Marketplaces`;
  }

  /**
   * Parsear respuesta de IA a formato AISuggestion
   */
  /**
   * ‘£‡ CORRECCI+ÙN CR+ÏTICA: Sanitizar valores num+Æricos para prevenir valores extremos
   */
  private sanitizeNumericValue(value: any, min: number, max: number, defaultValue: number = 0): number {
    if (value === null || value === undefined) return defaultValue;
    
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    
    if (!isFinite(numValue) || isNaN(numValue)) {
      return defaultValue;
    }
    
    // Detectar valores extremos o en notaci+¶n cient+°fica
    if (Math.abs(numValue) > 1e10 || (Math.abs(numValue) > 0 && Math.abs(numValue) < 1e-10)) {
      logger.warn('AISuggestions: Valor fuera de rango razonable detectado', { value: numValue, min, max });
      if (Math.abs(numValue) > max) return max;
      if (Math.abs(numValue) < min && numValue > 0) return min;
      return defaultValue;
    }
    
    return Math.max(min, Math.min(max, numValue));
  }

  private parseAISuggestions(aiResponse: any, businessData: UserBusinessData): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    const aiSuggestions = aiResponse.suggestions || [];

    for (let i = 0; i < aiSuggestions.length; i++) {
      const sug = aiSuggestions[i];
      try {
        // ‘£‡ CORRECCI+ÙN CR+ÏTICA: Sanitizar todos los valores num+Æricos antes de usar
        const sanitizedRevenue = this.sanitizeNumericValue(sug.impactRevenue, 0, 1000000, 0);
        const sanitizedTime = this.sanitizeNumericValue(sug.impactTime, 0, 1000, 0);
        const sanitizedConfidence = this.sanitizeNumericValue(sug.confidence, 0, 100, 75);
        
        suggestions.push({
          id: `ai_${Date.now()}_${i}`,
          type: sug.type || 'optimization',
          priority: sug.priority || 'medium',
          title: sug.title || 'Sugerencia sin t+°tulo',
          description: sug.description || '',
          impact: {
            revenue: sanitizedRevenue,
            time: sanitizedTime,
            difficulty: sug.difficulty || 'medium'
          },
          confidence: sanitizedConfidence,
          actionable: true,
          implemented: false,
          estimatedTime: sug.estimatedTime || '30 minutos',
          requirements: Array.isArray(sug.requirements) ? sug.requirements : [],
          steps: Array.isArray(sug.steps) ? sug.steps : [],
          relatedProducts: Array.isArray(sug.relatedProducts) ? sug.relatedProducts : undefined,
          metrics: sug.metrics ? {
            currentValue: this.sanitizeNumericValue(sug.metrics.currentValue, 0, 1e6, 0),
            targetValue: this.sanitizeNumericValue(sug.metrics.targetValue, 0, 1e6, 0),
            unit: sug.metrics.unit || 'USD'
          } : undefined,
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        logger.warn('AISuggestions: Error parseando sugerencia', { suggestion: sug, error: e });
      }
    }

    return suggestions;
  }

  /**
   * Generar sugerencias de fallback sin IA
   */
  private async generateFallbackSuggestions(userId: number): Promise<AISuggestion[]> {
    let data: UserBusinessData;
    try {
      data = await this.getUserBusinessData(userId);
    } catch (error: any) {
      logger.warn('AISuggestions: Error obteniendo datos para fallback, usando valores por defecto', { error: error.message });
      // Usar datos por defecto si falla
      data = {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        activeProducts: 0,
        averageProfitMargin: 0,
        bestCategory: 'General',
        worstCategory: 'General',
        products: [],
        recentOpportunities: 0
      };
    }
    
    const suggestions: AISuggestion[] = [];

    // Sugerencia de pricing espec+°fica de dropshipping
    if (data.averageProfitMargin < 30) {
      suggestions.push({
        id: `fallback_${Date.now()}_1`,
        type: 'pricing',
        priority: 'high',
        title: 'Optimizar precios en marketplaces bas+Ìndose en competencia',
        description: `Tu margen promedio es ${data.averageProfitMargin.toFixed(1)}%. Analiza precios de competencia en eBay, Amazon y MercadoLibre para productos similares y ajusta tus precios para alcanzar al menos 40% de margen manteniendo competitividad.`,
        impact: {
          revenue: data.totalRevenue * 0.15,
          time: 2,
          difficulty: 'easy'
        },
        confidence: 85,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a configuraci+¶n de precios en marketplaces', 'API de marketplaces configurada'],
        steps: [
          'Revisar productos con menor margen en el sistema',
          'Buscar productos similares en eBay, Amazon y MercadoLibre',
          'Comparar precios de competencia vs precio de AliExpress',
          'Ajustar precios incrementando 10-15% manteniendo competitividad',
          'Configurar reglas de repricing autom+Ìtico si est+Ì disponible'
        ],
        metrics: {
          currentValue: data.averageProfitMargin,
          targetValue: 40,
          unit: '%'
        },
        createdAt: new Date().toISOString()
      });
    }

    // Sugerencia de inventory espec+°fica de dropshipping
    if (data.activeProducts < 10) {
      // ‘£‡ CORREGIDO: C+Ìlculo seguro de revenue evitando desbordamientos
      const totalRevenue = Math.max(0, Math.min(data.totalRevenue || 0, 1000000)); // Limitar a $1M
      const estimatedImpact = Math.max(150, Math.min(100000, Math.round(totalRevenue * 0.3))); // M+Ìximo $100k
      suggestions.push({
        id: `fallback_${Date.now()}_2`,
        type: 'inventory',
        priority: 'medium',
        title: 'Expandir cat+Ìlogo desde AliExpress usando b+¶squeda de oportunidades',
        description: `Tienes ${data.activeProducts} productos activos. Usa la funci+¶n de b+¶squeda de oportunidades para encontrar productos rentables en AliExpress en la categor+°a ${data.bestCategory} y publicarlos autom+Ìticamente en tus marketplaces configurados.`,
        impact: {
          revenue: estimatedImpact,
          time: 3,
          difficulty: 'medium'
        },
        confidence: 80,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a b+¶squeda de oportunidades', 'APIs de marketplaces configuradas', 'Credenciales de AliExpress'],
        steps: [
          'Ir a la secci+¶n "Oportunidades" del dashboard',
          `Buscar productos en AliExpress de la categor+°a ${data.bestCategory}`,
          'Revisar oportunidades encontradas y filtrar por margen >40%',
          'Seleccionar productos rentables y crear productos desde oportunidades',
          'Publicar autom+Ìticamente en eBay, Amazon o MercadoLibre'
        ],
        createdAt: new Date().toISOString()
      });
    }

    // Sugerencia de listing espec+°fica de dropshipping
    if (data.totalSales > 0 && data.totalSales < 20) {
      // ‘£‡ CORREGIDO: C+Ìlculo seguro de revenue evitando desbordamientos
      const totalRevenue = Math.max(0, Math.min(data.totalRevenue || 0, 1000000)); // Limitar a $1M
      const estimatedImpact = Math.max(125, Math.min(75000, Math.round(totalRevenue * 0.25))); // M+Ìximo $75k
      suggestions.push({
        id: `fallback_${Date.now()}_3`,
        type: 'listing',
        priority: 'medium',
        title: 'Optimizar t+°tulos y descripciones para SEO en marketplaces',
        description: `Tus productos tienen ${data.totalSales} ventas. Mejora los t+°tulos y descripciones de tus listados en eBay, Amazon y MercadoLibre agregando keywords relevantes y detalles espec+°ficos del producto para mejorar su ranking en b+¶squedas y aumentar conversiones.`,
        impact: {
          revenue: estimatedImpact,
          time: 2,
          difficulty: 'easy'
        },
        confidence: 75,
        actionable: true,
        implemented: false,
        estimatedTime: '1-2 horas',
        requirements: ['Acceso a edici+¶n de productos', 'Productos publicados en marketplaces'],
        steps: [
          'Revisar productos con menos ventas en el dashboard',
          'Analizar t+°tulos de productos similares exitosos en cada marketplace',
          'Agregar keywords espec+°ficos de b+¶squeda (marca, modelo, caracter+°sticas)',
          'Mejorar descripciones con detalles t+Æcnicos del producto de AliExpress',
          'Actualizar im+Ìgenes de alta calidad desde AliExpress si es necesario',
          'Aplicar cambios en todos los marketplaces donde est+Ì publicado'
        ],
        createdAt: new Date().toISOString()
      });
    }

    // ‘£‡ Guardar sugerencias de fallback tambi+Æn
    if (suggestions.length > 0) {
      try {
        await this.saveSuggestions(userId, suggestions);
        logger.info(`AISuggestions: ${suggestions.length} sugerencias de fallback guardadas para usuario ${userId}`);
      } catch (saveError: any) {
        logger.warn('AISuggestions: Error guardando sugerencias de fallback (no cr+°tico)', { error: saveError.message });
      }
    }

    return suggestions;
  }

  /**
   * Guardar sugerencias en BD
   */
  private async saveSuggestions(userId: number, suggestions: AISuggestion[]): Promise<void> {
    try {
      // ‘£‡ Verificar si la tabla existe antes de guardar
      try {
        for (const suggestion of suggestions) {
          // Buscar si ya existe
          const existing = await prisma.aISuggestion.findFirst({
            where: {
              userId,
              title: suggestion.title
            }
          });

          if (existing) {
            await prisma.aISuggestion.update({
              where: { id: existing.id },
              data: {
                type: suggestion.type,
                priority: suggestion.priority,
                description: suggestion.description,
                impactRevenue: suggestion.impact.revenue,
                impactTime: suggestion.impact.time,
                difficulty: suggestion.impact.difficulty,
                confidence: suggestion.confidence,
                estimatedTime: suggestion.estimatedTime,
                requirements: JSON.stringify(suggestion.requirements),
                steps: JSON.stringify(suggestion.steps),
                relatedProducts: suggestion.relatedProducts ? JSON.stringify(suggestion.relatedProducts) : null,
                metrics: suggestion.metrics ? JSON.stringify(suggestion.metrics) : null,
                updatedAt: new Date()
              }
            });
          } else {
            await prisma.aISuggestion.create({
              data: {
                userId,
                type: suggestion.type,
                priority: suggestion.priority,
                title: suggestion.title,
                description: suggestion.description,
                impactRevenue: suggestion.impact.revenue,
                impactTime: suggestion.impact.time,
                difficulty: suggestion.impact.difficulty,
                confidence: suggestion.confidence,
                actionable: suggestion.actionable,
                implemented: suggestion.implemented,
                estimatedTime: suggestion.estimatedTime,
                requirements: JSON.stringify(suggestion.requirements),
                steps: JSON.stringify(suggestion.steps),
                relatedProducts: suggestion.relatedProducts ? JSON.stringify(suggestion.relatedProducts) : null,
                metrics: suggestion.metrics ? JSON.stringify(suggestion.metrics) : null,
                createdAt: new Date()
              }
            });
          }
        }
      } catch (dbError: any) {
        // Si la tabla no existe, solo loguear y continuar
        if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('ai_suggestions')) {
          logger.warn('AISuggestions: Tabla no existe a+¶n, no se pueden guardar sugerencias. Ejecuta la migraci+¶n.');
          return; // ‘£‡ Salir silenciosamente, no es cr+°tico
        }
        // Para otros errores de DB, loguear pero no lanzar
        logger.warn('AISuggestions: Error de base de datos al guardar (no cr+°tico)', { 
          error: dbError.message, 
          code: dbError.code 
        });
        return; // ‘£‡ No lanzar error, solo loguear
      }
    } catch (error: any) {
      logger.error('AISuggestions: Error guardando sugerencias', { 
        error: error?.message || String(error), 
        userId 
      });
      // ‘£‡ No lanzar error, solo loguear - guardar sugerencias no es cr+°tico
    }
  }

  /**
   * Obtener sugerencias guardadas del usuario
   */
  async getSuggestions(userId: number, filter?: string): Promise<AISuggestion[]> {
    try {
      // ‘£‡ Verificar si la tabla existe antes de consultar
      try {
        const where: any = { userId, implemented: false };
        if (filter && filter !== 'all') {
          where.type = filter;
        }

        const dbSuggestions = await prisma.aISuggestion.findMany({
          where,
          orderBy: [
            { priority: 'desc' },
            { confidence: 'desc' }
          ],
          take: 20
        });

        // ‘£‡ Logging para debugging
        logger.info(`AISuggestions: getSuggestions retornando ${dbSuggestions.length} sugerencias`, {
          userId,
          filter: filter || 'all',
          types: dbSuggestions.map(s => s.type),
          implementedCount: dbSuggestions.filter(s => s.implemented).length
        });

      // ‘£‡ Funci+¶n helper recursiva para limpiar cualquier Decimal en el objeto
      // Con l+°mite de profundidad para evitar stack overflow y referencias circulares
      // ‘£‡ MEJORADO: Manejo m+Ìs robusto de tipos complejos y validaci+¶n estricta
      const sanitizeForJson = (obj: any, depth: number = 0, visited: WeakSet<any> = new WeakSet()): any => {
        // L+°mite de profundidad para evitar stack overflow
        if (depth > 10) {
          logger.warn('AISuggestions: Profundidad m+Ìxima alcanzada en sanitizeForJson', { depth });
          return null;
        }

        if (obj === null || obj === undefined) {
          return obj;
        }
        
        // ‘£‡ Detectar referencias circulares ANTES de procesar
        if (typeof obj === 'object' && obj !== null) {
          if (visited.has(obj)) {
            logger.warn('AISuggestions: Referencia circular detectada en sanitizeForJson');
            return '[Circular Reference]';
          }
          visited.add(obj);
        }
        
        // ‘£‡ Detectar Prisma.Decimal ANTES de otros objetos
        if (obj && typeof obj === 'object') {
          // Verificar si es Prisma.Decimal (puede tener m+¶ltiples propiedades que lo identifiquen)
          if ('toNumber' in obj && typeof obj.toNumber === 'function') {
            try {
              const num = obj.toNumber();
              if (!isFinite(num) || isNaN(num)) {
                return 0;
              }
              // Limitar valores extremos para prevenir problemas de serializaci+¶n
              if (Math.abs(num) > 1e12) {
                logger.warn('AISuggestions: Valor extremo detectado, limitando', { original: num });
                return num > 0 ? 1e12 : -1e12;
              }
              return num;
            } catch (error) {
              logger.warn('AISuggestions: Error convirtiendo Decimal a number', { error });
              return 0;
            }
          }
          
          // ‘£‡ Si es Date, convertir a ISO string
          if (obj instanceof Date) {
            try {
              return obj.toISOString();
            } catch {
              return new Date().toISOString();
            }
          }
          
          // ‘£‡ Si es Array, sanitizar cada elemento
          if (Array.isArray(obj)) {
            try {
              const sanitized = obj.map(item => sanitizeForJson(item, depth + 1, visited));
              // Limitar tama+¶o de arrays para prevenir problemas
              return sanitized.slice(0, 1000);
            } catch (error) {
              logger.warn('AISuggestions: Error sanitizando array', { error });
              return [];
            }
          }
          
          // ‘£‡ Si es objeto, sanitizar propiedades
          const sanitized: any = {};
          try {
            let keyCount = 0;
            for (const [key, value] of Object.entries(obj)) {
              // Limitar n+¶mero de propiedades para prevenir objetos demasiado grandes
              if (keyCount++ > 100) {
                logger.warn('AISuggestions: Objeto con demasiadas propiedades, truncando');
                break;
              }
              
