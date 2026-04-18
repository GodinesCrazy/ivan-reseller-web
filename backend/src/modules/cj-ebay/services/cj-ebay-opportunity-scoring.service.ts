/**
 * CJ → eBay USA — Opportunity Scoring Engine (FASE 3G).
 *
 * Scores each candidate on 7 dimensions with configurable weights.
 * Every sub-score is 0–100. The final totalScore is the weighted average.
 *
 * Dimensions:
 *  1. demand           — trend confidence + category market signal
 *  2. margin           — net margin quality (higher = better)
 *  3. competitiveness  — how our price compares to market
 *  4. shippingConfidence — clarity of shipping cost + delivery window
 *  5. simplicity       — low variant count, easy to manage for new account
 *  6. accountRisk      — overall safety for an eBay new account
 *  7. supplierReliability — stock depth + cost stability
 *
 * STARTER mode applies additional filters and a penalty multiplier for risky categories.
 * All scores are fully explained via the `reasons` array.
 */

import type {
  CjCandidateMatch,
  CjOpportunityPricingResult,
  OpportunityRunSettings,
  OpportunityScoreBreakdown,
  ScoringWeights,
  DataSourceType,
} from './cj-ebay-opportunity.types';

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function weightedTotal(scores: Record<keyof ScoringWeights, number>, weights: ScoringWeights): number {
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return 0;
  let sum = 0;
  for (const key of Object.keys(weights) as (keyof ScoringWeights)[]) {
    sum += (scores[key] ?? 0) * (weights[key] / totalWeight);
  }
  return Math.round(sum * 10) / 10;
}

// ====================================
// SUB-SCORE FUNCTIONS
// ====================================

function scoreDemand(match: CjCandidateMatch): { score: number; reasons: string[] } {
  const confidence = match.seed.trendConfidence;
  const reasons: string[] = [];

  // Linear map: 0.0 → 20, 0.5 → 50, 0.8 → 82, 1.0 → 100.
  const raw = clamp(Math.round(confidence * 100));

  if (confidence >= 0.8) {
    reasons.push(`Señal de tendencia alta (${Math.round(confidence * 100)}%) para "${match.seed.keyword}"`);
  } else if (confidence >= 0.65) {
    reasons.push(`Señal de tendencia moderada (${Math.round(confidence * 100)}%) para "${match.seed.keyword}"`);
  } else {
    reasons.push(`Señal de tendencia baja (${Math.round(confidence * 100)}%) — riesgo de demanda insuficiente`);
  }

  // Bonus if seed has a category.
  const bonus = match.seed.category ? 5 : 0;
  if (bonus > 0) reasons.push('Categoría de mercado identificada (+5)');

  return { score: clamp(raw + bonus), reasons };
}

function scoreMargin(pricing: CjOpportunityPricingResult): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (pricing.netMarginPct == null) {
    return { score: 10, reasons: ['Margen neto no calculable'] };
  }
  const m = pricing.netMarginPct;

  let score: number;
  if (m >= 35) {
    score = 100;
    reasons.push(`Margen excelente: ${m.toFixed(1)}% (≥35%)`);
  } else if (m >= 28) {
    score = 85;
    reasons.push(`Margen muy bueno: ${m.toFixed(1)}% (28–35%)`);
  } else if (m >= 20) {
    score = 68;
    reasons.push(`Margen aceptable: ${m.toFixed(1)}% (20–28%)`);
  } else if (m >= 14) {
    score = 45;
    reasons.push(`Margen ajustado: ${m.toFixed(1)}% (14–20%) — cuidado con incidencias`);
  } else if (m >= 8) {
    score = 25;
    reasons.push(`Margen muy ajustado: ${m.toFixed(1)}% (<14%) — poco colchón para incidencias`);
  } else {
    score = 5;
    reasons.push(`Margen insuficiente: ${m.toFixed(1)}% — no viable para sostenibilidad`);
  }

  reasons.push(
    `Precio sugerido: $${pricing.suggestedPriceUsd} | Costo total: $${pricing.totalCostUsd} | Ganancia: $${pricing.netProfitUsd}`
  );

  return { score: clamp(score), reasons };
}

function scoreCompetitiveness(pricing: CjOpportunityPricingResult): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const delta = pricing.competitivenessDeltaPct;

  if (delta == null) {
    reasons.push('Precio de mercado observado no disponible — competitividad estimada');
    return { score: 50, reasons };
  }

  let score: number;
  if (delta <= -10) {
    score = 100;
    reasons.push(`Precio ${Math.abs(delta).toFixed(1)}% más barato que el mercado — ventaja competitiva fuerte`);
  } else if (delta <= -3) {
    score = 80;
    reasons.push(`Precio ${Math.abs(delta).toFixed(1)}% por debajo del mercado — competitivo`);
  } else if (delta <= 5) {
    score = 62;
    reasons.push(`Precio alineado con el mercado (delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`);
  } else if (delta <= 15) {
    score = 40;
    reasons.push(`Precio ${delta.toFixed(1)}% sobre el mercado — podría dificultar conversiones`);
  } else {
    score = 15;
    reasons.push(`Precio ${delta.toFixed(1)}% sobre el mercado — muy poco competitivo`);
  }

  reasons.push(
    `Precio sugerido: $${pricing.suggestedPriceUsd} | Mercado observado: $${pricing.marketObservedPriceUsd}`
  );

  return { score: clamp(score), reasons };
}

function scoreShippingConfidence(match: CjCandidateMatch): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const sh = match.shipping;

  if (!sh) {
    return { score: 0, reasons: ['Sin datos de envío — candidato no debería haber llegado aquí'] };
  }

  let base: number;

  // Cost component.
  if (sh.amountUsd <= 3) {
    base = 90;
    reasons.push(`Envío muy económico: $${sh.amountUsd}`);
  } else if (sh.amountUsd <= 6) {
    base = 75;
    reasons.push(`Envío razonable: $${sh.amountUsd}`);
  } else if (sh.amountUsd <= 9) {
    base = 55;
    reasons.push(`Envío moderado: $${sh.amountUsd} — afecta margen`);
  } else {
    base = 30;
    reasons.push(`Envío caro: $${sh.amountUsd} — comprime margen significativamente`);
  }

  // Confidence bonus.
  if (sh.confidence === 'KNOWN') {
    base += 10;
    reasons.push('Costo de envío confirmado por API (KNOWN)');
  } else {
    reasons.push('Costo de envío estimado (ESTIMATED) — puede variar al hacer pedido real');
  }

  // Delivery window.
  if (sh.daysMin != null && sh.daysMax != null) {
    const maxDays = sh.daysMax;
    if (maxDays <= 14) {
      base += 5;
      reasons.push(`Tiempo de entrega: ${sh.daysMin}–${sh.daysMax} días (+5)`);
    } else if (maxDays <= 25) {
      reasons.push(`Tiempo de entrega: ${sh.daysMin}–${sh.daysMax} días`);
    } else {
      base -= 10;
      reasons.push(`Tiempo de entrega largo: ${sh.daysMax}d (>25d) — riesgo de disputas de comprador`);
    }
  }

  return { score: clamp(base), reasons };
}

function scoreSimplicity(match: CjCandidateMatch): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const variants = match.totalVariants;

  // Fewer variants = simpler to manage inventory, fewer listing errors.
  let score: number;
  if (variants === 1) {
    score = 100;
    reasons.push('Producto de 1 variante — máxima simplicidad operativa');
  } else if (variants <= 3) {
    score = 85;
    reasons.push(`${variants} variantes — fácil de gestionar`);
  } else if (variants <= 6) {
    score = 65;
    reasons.push(`${variants} variantes — complejidad moderada`);
  } else if (variants <= 10) {
    score = 40;
    reasons.push(`${variants} variantes — alta complejidad para cuenta nueva`);
  } else {
    score = 15;
    reasons.push(`${variants} variantes — muy complejo, riesgo de errores de listing`);
  }

  return { score: clamp(score), reasons };
}

function scoreAccountRisk(
  match: CjCandidateMatch,
  settings: OpportunityRunSettings
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const title = match.cjProductTitle.toLowerCase();
  const cost = match.selectedVariant.unitCostUsd;

  let riskPenalty = 0;

  // Risky keyword detection.
  const riskyKeywords = ['battery', 'lithium', 'knife', 'weapon', 'glass', 'fragile', 'heavy', 'oversized'];
  const found = riskyKeywords.filter((kw) => title.includes(kw));
  if (found.length > 0) {
    riskPenalty += found.length * 15;
    reasons.push(`Palabras clave de riesgo detectadas: ${found.join(', ')} (-${found.length * 15})`);
  }

  // High unit cost = capital risk for account.
  if (cost > 40) {
    riskPenalty += 20;
    reasons.push(`Costo unitario alto ($${cost}) — riesgo de capital para cuenta nueva (-20)`);
  } else if (cost > 20) {
    riskPenalty += 8;
    reasons.push(`Costo unitario moderado ($${cost}) (-8)`);
  }

  // Price range safety.
  const suggested = match.selectedVariant.unitCostUsd + (match.shipping?.amountUsd ?? 0);
  if (suggested > 50) {
    riskPenalty += 15;
    reasons.push('Precio de venta estimado >$50 — mayor riesgo de disputas en cuenta nueva (-15)');
  }

  const score = clamp(100 - riskPenalty);
  if (riskPenalty === 0) {
    reasons.push('Sin factores de riesgo detectados para cuenta nueva');
  }

  return { score, reasons };
}

function scoreSupplierReliability(match: CjCandidateMatch): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const stock = match.selectedVariant.stock;

  let score: number;
  if (stock > 200) {
    score = 100;
    reasons.push(`Stock profundo: ${stock} unidades — proveedor estable`);
  } else if (stock > 50) {
    score = 80;
    reasons.push(`Stock bueno: ${stock} unidades`);
  } else if (stock > 10) {
    score = 55;
    reasons.push(`Stock moderado: ${stock} unidades — monitorear disponibilidad`);
  } else if (stock > 0) {
    score = 30;
    reasons.push(`Stock bajo: ${stock} unidades — riesgo de ruptura`);
  } else {
    score = 20;
    reasons.push('Stock no reportado o desconocido — fiabilidad incierta');
  }

  return { score: clamp(score), reasons };
}

// ====================================
// DATA QUALITY SCORING (3G.1)
// ====================================

/**
 * dataQualityScore (0–100): composite quality of all underlying signals.
 *
 * Weights:
 *   Trend source (40%): REAL=40, HYBRID=25, MOCK=10
 *   Market price source (40%): REAL=40 × confidence, HYBRID=20, ESTIMATED/MOCK=8
 *   Shipping source (20%): KNOWN=20, ESTIMATED=12, UNKNOWN=4
 */
function computeDataQualityScore(
  trendSource: DataSourceType,
  marketPriceSource: DataSourceType,
  marketPriceConfidence: number,
  shippingConfidence: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN',
): number {
  const trendPart =
    trendSource === 'REAL' ? 40 :
    trendSource === 'HYBRID' ? 25 : 10;

  const marketPart =
    marketPriceSource === 'REAL' ? Math.round(40 * marketPriceConfidence) :
    marketPriceSource === 'HYBRID' ? 20 : 8;

  const shippingPart =
    shippingConfidence === 'KNOWN' ? 20 :
    shippingConfidence === 'ESTIMATED' ? 12 : 4;

  return clamp(trendPart + marketPart + shippingPart);
}

/**
 * marketRealityScore (0–100): how real/verified the market-price signals are.
 *
 * Uses the market price source type and the raw confidence from the provider.
 */
function computeMarketRealityScore(
  marketPriceSource: DataSourceType,
  marketPriceConfidence: number,
): number {
  const base =
    marketPriceSource === 'REAL' ? Math.round(100 * marketPriceConfidence) :
    marketPriceSource === 'HYBRID' ? 50 :
    marketPriceSource === 'ESTIMATED' ? 22 : 10;
  return clamp(base);
}

/**
 * Data quality penalty factor (0.7–1.0) applied to totalScore.
 * A candidate with strong score but unreliable data is penalized so it
 * does not rank equally to a well-evidenced candidate.
 */
function dataQualityPenaltyFactor(dataQualityScore: number): number {
  if (dataQualityScore >= 75) return 1.00;
  if (dataQualityScore >= 55) return 0.93;
  if (dataQualityScore >= 35) return 0.85;
  return 0.78;
}

// ====================================
// SCORING SERVICE
// ====================================

class CjEbayOpportunityScoringService {
  score(
    match: CjCandidateMatch,
    pricing: CjOpportunityPricingResult,
    settings: OpportunityRunSettings,
  ): OpportunityScoreBreakdown {
    const demand = scoreDemand(match);
    const margin = scoreMargin(pricing);
    const competitiveness = scoreCompetitiveness(pricing);
    const shipping = scoreShippingConfidence(match);
    const simplicity = scoreSimplicity(match);
    const accountRisk = scoreAccountRisk(match, settings);
    const supplierReliability = scoreSupplierReliability(match);

    const rawScores: Record<keyof ScoringWeights, number> = {
      demand: demand.score,
      margin: margin.score,
      competitiveness: competitiveness.score,
      shippingConfidence: shipping.score,
      simplicity: simplicity.score,
      accountRisk: accountRisk.score,
      supplierReliability: supplierReliability.score,
    };

    let totalScore = weightedTotal(rawScores, settings.scoringWeights);

    // ---- STARTER mode checks ----
    const starterFlags: string[] = [];
    let starterPenaltyApplied = false;

    if (settings.mode === 'STARTER' && settings.starterModeConfig) {
      const sc = settings.starterModeConfig;

      if (match.totalVariants > sc.maxVariants) {
        starterFlags.push('EXCEEDS_MAX_VARIANTS');
      }
      if (pricing.netMarginPct != null && pricing.netMarginPct < sc.minMarginPctStarter) {
        starterFlags.push('MARGIN_BELOW_STARTER_MINIMUM');
      }

      const titleLower = match.cjProductTitle.toLowerCase();
      const seedLower = match.seed.keyword.toLowerCase();
      const matchesPenalized = sc.penalizedCategories.some(
        (cat) => titleLower.includes(cat) || seedLower.includes(cat),
      );
      if (matchesPenalized) {
        starterFlags.push('RISKY_CATEGORY_FOR_STARTER');
        totalScore = Math.round(totalScore * sc.riskyCategoyPenalty * 10) / 10;
        starterPenaltyApplied = true;
      }
    }

    // ---- 3G.1: data quality scoring ----
    const trendSource: DataSourceType =
      match.seed.source === 'EBAY_RESEARCH' ? 'REAL' :
      match.seed.source === 'MANUAL' ? 'HYBRID' : 'MOCK';

    const shippingConf = match.shipping?.confidence ?? 'UNKNOWN';

    // marketPriceConfidence from the pricing result (stored in marketPriceSourceType context)
    // We use a proxy: if marketObservedPriceUsd is present → some confidence, else low
    const mptSource = pricing.marketPriceSourceType ?? 'ESTIMATED';
    const mptConfidence =
      mptSource === 'REAL' ? 0.75 :   // will be overwritten by caller if more precise
      mptSource === 'HYBRID' ? 0.50 :
      mptSource === 'ESTIMATED' ? 0.22 : 0.10;

    const dataQualityScore = computeDataQualityScore(
      trendSource,
      mptSource,
      mptConfidence,
      shippingConf,
    );

    const marketRealityScore = computeMarketRealityScore(mptSource, mptConfidence);

    // Apply data quality penalty to totalScore
    const penaltyFactor = dataQualityPenaltyFactor(dataQualityScore);
    totalScore = Math.round(totalScore * penaltyFactor * 10) / 10;

    const dqReasons: string[] = [];
    dqReasons.push(
      `Calidad de datos: ${dataQualityScore}/100 (tendencia: ${trendSource}, precio mercado: ${mptSource}, envío: ${shippingConf})`,
    );
    if (penaltyFactor < 1.0) {
      dqReasons.push(
        `Penalización por datos incompletos aplicada: ×${penaltyFactor.toFixed(2)}`,
      );
    }

    const allReasons = [
      ...demand.reasons,
      ...margin.reasons,
      ...competitiveness.reasons,
      ...shipping.reasons,
      ...simplicity.reasons,
      ...accountRisk.reasons,
      ...supplierReliability.reasons,
      ...dqReasons,
    ];

    return {
      demandScore: demand.score,
      marginScore: margin.score,
      competitivenessScore: competitiveness.score,
      shippingConfidenceScore: shipping.score,
      simplicityScore: simplicity.score,
      accountRiskScore: accountRisk.score,
      supplierReliabilityScore: supplierReliability.score,
      totalScore,
      reasons: allReasons,
      starterFlags,
      starterPenaltyApplied,
      // 3G.1
      dataQualityScore,
      marketRealityScore,
      dataQualityPenaltyFactor: penaltyFactor,
    };
  }

  /**
   * Build a concise human-readable recommendation summary from the score breakdown.
   */
  buildRecommendationReason(score: OpportunityScoreBreakdown, pricing: CjOpportunityPricingResult): string {
    const parts: string[] = [];

    if (score.totalScore >= 70) {
      parts.push('Candidato fuerte');
    } else if (score.totalScore >= 50) {
      parts.push('Candidato aceptable');
    } else {
      parts.push('Candidato débil');
    }

    if (pricing.netMarginPct != null) {
      parts.push(`margen ${pricing.netMarginPct.toFixed(1)}%`);
    }

    if (pricing.competitivenessDeltaPct != null) {
      const deltaStr =
        pricing.competitivenessDeltaPct < 0
          ? `${Math.abs(pricing.competitivenessDeltaPct).toFixed(1)}% bajo mercado`
          : `${pricing.competitivenessDeltaPct.toFixed(1)}% sobre mercado`;
      parts.push(deltaStr);
    }

    if (score.starterFlags.length > 0) {
      parts.push(`alertas starter: ${score.starterFlags.join(', ')}`);
    }

    // 3G.1: surface data quality clearly
    const dq = score.dataQualityScore ?? 0;
    if (dq < 35) {
      parts.push('datos: ESTIMADOS');
    } else if (dq < 65) {
      parts.push('datos: PARCIALES');
    } else {
      parts.push('datos: REALES');
    }

    return parts.join(' | ');
  }
}

export const cjEbayOpportunityScoringService = new CjEbayOpportunityScoringService();
