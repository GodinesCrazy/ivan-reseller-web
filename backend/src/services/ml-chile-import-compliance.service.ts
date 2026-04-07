/**
 * ML Chile Import Compliance Service
 *
 * Centralizes the "business truth" for dropshipping products imported from China and
 * sold via Mercado Libre Chile. Provides:
 *
 *  1. buildMLChileImportFooter()  — generates the legal / commercial appendix that
 *     must be appended to every ML Chile imported-product description.
 *  2. getMLChileBusinessTruth()   — consolidated truth model for a product/listing
 *     pair: shipping truth, ETA, IVA status, legal text status, readiness signals.
 *
 * EXECUTIVE SUMMARY COMPLIANCE:
 *  - Ley 19.496 (Consumidor): garantía 6 meses, retracto 10 días
 *  - Reglamento Comercio Electrónico (2022): precio total, plazos, contacto
 *  - IVA Digital (oct 2025): ML cobra 19% IVA en ventas <US$500, exime aduanas
 *  - Origen importado debe declararse ("Producto importado de China")
 *  - ETA real de envío internacional (20-40 días estándar, 10-15 express)
 */

import { trace } from '../utils/boot-trace';
trace('loading ml-chile-import-compliance.service');

import logger from '../config/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default ETA range (calendar days) for standard CN→CL dropshipping shipment. */
export const ML_CHILE_STANDARD_ETA_MIN_DAYS = 20;
export const ML_CHILE_STANDARD_ETA_MAX_DAYS = 40;

/** IVA rate applied to Chilean digital purchases under US$500 (Ley IVA digital Oct 2025). */
export const CL_IVA_RATE = 0.19;

/** Consumer guarantee period under Ley 19.496. */
export const CL_GUARANTEE_MONTHS = 6;

/** Withdrawal right (retracto) window in days under Ley 19.496 / Reglamento CE 2022. */
export const CL_RETRACTO_DAYS = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShippingTruthStatus =
  | 'me2_enforced'             // ML me2 mode set and confirmed on API
  | 'me2_attempted_not_enforced' // me2 attempted post-create but ML reverted (SHIPPING_TRUTH_NOT_ENFORCED_ON_ML)
  | 'not_specified'            // ML defaulted to not_specified
  | 'unknown';                 // Status not yet verified

export interface MLChileImportFooterOptions {
  /** Origin country displayed in description. Default: 'China'. */
  originCountry?: string;
  /** ETA minimum in calendar days. Default: 20. */
  etaMinDays?: number;
  /** ETA maximum in calendar days. Default: 40. */
  etaMaxDays?: number;
  /** Whether to include the IVA clause. Default: true (always true for MLC). */
  includeIvaClause?: boolean;
  /** Whether to include the retracto (withdrawal right) clause. Default: true. */
  includeRetractoClause?: boolean;
  /** Whether to include the guarantee clause. Default: true. */
  includeGuaranteeClause?: boolean;
  /** Seller contact channel hint (e.g. "preguntas del producto"). Default: system default. */
  contactChannel?: string;
}

export interface MLChileBusinessTruth {
  /** Product origin country (CN for AliExpress). */
  originCountry: string;
  /** Sourcing type for the current product. */
  sourcingType: 'dropshipping_aliexpress' | 'local_stock' | 'unknown';
  /** Estimated delivery range visible to buyer. */
  eta: {
    minDays: number;
    maxDays: number;
    label: string;
    basis: 'configured' | 'product_data' | 'default';
  };
  /** ML shipping mode truth. */
  shippingTruth: {
    status: ShippingTruthStatus;
    mode: string;
    handlingTimeDays: number;
    freeShipping: boolean;
    knownLimitation: string | null;
  };
  /** IVA / tax status for this listing. */
  taxTruth: {
    ivaIncluded: boolean; // ML handles IVA collection for digital imports <US$500
    ivaRate: number;
    ivaHandledBy: 'mercadolibre_platform' | 'buyer_at_customs' | 'unknown';
    estimatedIvaOnSalePrice: number | null; // USD, calculated internally (not charged extra to buyer)
  };
  /** Legal text compliance for the listing description. */
  legalCompliance: {
    legalTextsAppended: boolean;
    guaranteeIncluded: boolean;
    retractoIncluded: boolean;
    importedProductDeclared: boolean;
    ivaClauseIncluded: boolean;
  };
  /** Fulfillment readiness signals. */
  fulfillmentReadiness: {
    aliexpressUrlPresent: boolean;
    profitabilityGateOk: boolean | null; // null = not evaluated
    manualInterventionRequired: boolean;
    notes: string[];
  };
  /** Overall readiness score: 'ready' | 'partial' | 'not_ready'. */
  overallReadiness: 'ready' | 'partial' | 'not_ready';
  /** Human-readable summary for the operator. */
  operatorSummary: string[];
}

// ─── Footer Builder ───────────────────────────────────────────────────────────

/**
 * Build the legal/commercial appendix to be appended to ML Chile product descriptions.
 *
 * This text is:
 *  - Compliant with Ley 19.496 (garantía, retracto)
 *  - Compliant with Reglamento Comercio Electrónico 2022 (plazos, precio, contacto)
 *  - Compliant with IVA Digital Oct 2025 (ML cobra 19% IVA; comprador exento en aduana)
 *  - Professional and readable (not a legal wall of text)
 *
 * The footer is intentionally concise to preserve description space and ML quality.
 */
export function buildMLChileImportFooter(opts: MLChileImportFooterOptions = {}): string {
  const origin = opts.originCountry || 'China';
  const etaMin = opts.etaMinDays ?? ML_CHILE_STANDARD_ETA_MIN_DAYS;
  const etaMax = opts.etaMaxDays ?? ML_CHILE_STANDARD_ETA_MAX_DAYS;
  const includeIva = opts.includeIvaClause !== false;
  const includeRetracto = opts.includeRetractoClause !== false;
  const includeGuarantee = opts.includeGuaranteeClause !== false;

  const lines: string[] = [
    '---',
    `Producto importado de ${origin} | Envío internacional con tracking incluido.`,
    `Tiempo estimado de entrega: ${etaMin}-${etaMax} días hábiles desde ${origin}.`,
  ];

  if (includeGuarantee) {
    lines.push(`Garantía legal: ${CL_GUARANTEE_MONTHS} meses por defectos de fabricación (Ley 19.496).`);
  }

  if (includeRetracto) {
    lines.push(`Derecho de retracto: ${CL_RETRACTO_DAYS} días desde recepción (Ley del Consumidor).`);
  }

  if (includeIva) {
    lines.push('Precio incluye IVA (19%) según normativa digital chilena. Sin cargos adicionales de importación.');
  }

  lines.push('Consultas: usa el sistema de preguntas del producto en Mercado Libre.');

  return lines.join('\n');
}

/**
 * Returns the character length of the footer for pre-publish space validation.
 * ML description max = 5000 chars. Caller should check: baseDesc.length + footer.length <= 5000.
 */
export function mlChileImportFooterLength(opts: MLChileImportFooterOptions = {}): number {
  return buildMLChileImportFooter(opts).length;
}

/**
 * Append the ML Chile import footer to a description, respecting the 5000 char ML limit.
 * If the description + footer exceeds the limit, the description is trimmed (not the footer).
 *
 * Returns { finalDescription, footerAppended, truncated }.
 */
export function appendMLChileImportFooter(
  description: string,
  opts: MLChileImportFooterOptions = {}
): { finalDescription: string; footerAppended: boolean; truncated: boolean } {
  const footer = buildMLChileImportFooter(opts);
  const separator = '\n\n';
  const ML_DESC_MAX = 5000;

  const combined = (description || '').trim() + separator + footer;

  if (combined.length <= ML_DESC_MAX) {
    return { finalDescription: combined, footerAppended: true, truncated: false };
  }

  // Trim description to make room for footer
  const available = ML_DESC_MAX - separator.length - footer.length;
  if (available < 50) {
    // Footer + separator already near limit — append without separator, truncate description
    const trimmed = (description || '').substring(0, ML_DESC_MAX - footer.length - 1) + '\n' + footer;
    return { finalDescription: trimmed.substring(0, ML_DESC_MAX), footerAppended: true, truncated: true };
  }

  const trimmedDesc = (description || '').substring(0, available);
  return {
    finalDescription: trimmedDesc + separator + footer,
    footerAppended: true,
    truncated: true,
  };
}

// ─── Business Truth Model ─────────────────────────────────────────────────────

/**
 * Build the ML Chile Business Truth for a given product and optional listing data.
 *
 * This consolidates all relevant facts about a product's import/shipping/tax/legal
 * status into a single object that can be:
 *   - Returned from an API endpoint for operator dashboards
 *   - Logged at publish time for audit purposes
 *   - Used by the fulfillment layer to decide if manual intervention is needed
 */
export function buildMLChileBusinessTruth(params: {
  product: {
    id?: number;
    aliexpressUrl?: string | null;
    aliexpressPrice?: number | string | null;
    shippingCost?: number | string | null;
    importTax?: number | string | null;
    totalCost?: number | string | null;
    targetCountry?: string | null;
    originCountry?: string | null;
    suggestedPrice?: number | string | null;
    finalPrice?: number | string | null;
    currency?: string | null;
    productData?: string | object | null;
  };
  listing?: {
    shippingTruthStatus?: string | null;
    legalTextsAppended?: boolean | null;
    handlingTimeDays?: number | null;
    freeShipping?: boolean | null;
  } | null;
  /** User-configured handling time (from workflow config mlHandlingTimeDays). */
  handlingTimeDays?: number;
}): MLChileBusinessTruth {
  const { product, listing, handlingTimeDays = 30 } = params;

  // ── Parse productData for ETA ──
  let productData: Record<string, any> = {};
  try {
    if (product.productData) {
      productData =
        typeof product.productData === 'string'
          ? JSON.parse(product.productData)
          : (product.productData as Record<string, any>);
    }
  } catch {
    productData = {};
  }

  const estimatedDays =
    productData?.estimatedDeliveryDays ??
    productData?.shipping?.estimatedDays ??
    productData?.deliveryDays;

  let etaMin: number;
  let etaMax: number;
  let etaBasis: 'configured' | 'product_data' | 'default';

  if (handlingTimeDays && handlingTimeDays > 0 && handlingTimeDays !== 30) {
    etaMin = Math.max(1, Math.floor(handlingTimeDays * 0.7));
    etaMax = Math.ceil(handlingTimeDays * 1.2);
    etaBasis = 'configured';
  } else if (typeof estimatedDays === 'number' && estimatedDays > 0) {
    etaMin = Math.max(1, Math.floor(estimatedDays * 0.8));
    etaMax = Math.ceil(estimatedDays * 1.2);
    etaBasis = 'product_data';
  } else {
    etaMin = ML_CHILE_STANDARD_ETA_MIN_DAYS;
    etaMax = ML_CHILE_STANDARD_ETA_MAX_DAYS;
    etaBasis = 'default';
  }

  // ── Origin / sourcing ──
  const originCountry = (product.originCountry || 'CN').toUpperCase();
  const sourcingType: MLChileBusinessTruth['sourcingType'] =
    (product.aliexpressUrl || '').length > 0 ? 'dropshipping_aliexpress' : 'unknown';

  // ── Shipping truth ──
  const rawShippingStatus = (listing?.shippingTruthStatus || 'unknown') as ShippingTruthStatus;
  const knownLimitations: Record<string, string> = {
    me2_attempted_not_enforced:
      'ML Chile revertió modo me2 a not_specified durante la creación del listing (limitación de plataforma). ' +
      'El comprador verá "Entrega a acordar con el vendedor". La descripción incluye ETA real.',
    not_specified:
      'El listing opera en modo not_specified. El comprador debe acordar entrega con el vendedor.',
  };

  const shippingTruth: MLChileBusinessTruth['shippingTruth'] = {
    status: rawShippingStatus,
    mode: rawShippingStatus === 'me2_enforced' ? 'me2' : 'not_specified',
    handlingTimeDays: listing?.handlingTimeDays ?? handlingTimeDays,
    freeShipping: listing?.freeShipping ?? false,
    knownLimitation: knownLimitations[rawShippingStatus] ?? null,
  };

  // ── Tax truth ──
  const salePrice =
    Number(product.finalPrice ?? product.suggestedPrice ?? 0);
  const estimatedIva = salePrice > 0 ? Math.round(salePrice * CL_IVA_RATE * 100) / 100 : null;

  const taxTruth: MLChileBusinessTruth['taxTruth'] = {
    ivaIncluded: true, // ML Chile platform collects IVA for digital imports <US$500 (Oct 2025)
    ivaRate: CL_IVA_RATE,
    ivaHandledBy: 'mercadolibre_platform',
    estimatedIvaOnSalePrice: estimatedIva,
  };

  // ── Legal compliance ──
  const legalCompliance: MLChileBusinessTruth['legalCompliance'] = {
    legalTextsAppended: listing?.legalTextsAppended ?? false,
    guaranteeIncluded: listing?.legalTextsAppended ?? false,
    retractoIncluded: listing?.legalTextsAppended ?? false,
    importedProductDeclared: listing?.legalTextsAppended ?? false,
    ivaClauseIncluded: listing?.legalTextsAppended ?? false,
  };

  // ── Fulfillment readiness ──
  const notes: string[] = [];
  const aliexpressUrlPresent = Boolean((product.aliexpressUrl || '').trim().length > 0);
  if (!aliexpressUrlPresent) {
    notes.push('FALTA URL AliExpress — compra automática bloqueada.');
  }

  const totalCost = Number(product.totalCost ?? 0);
  const listingPrice = Number(product.finalPrice ?? product.suggestedPrice ?? 0);
  let profitabilityGateOk: boolean | null = null;
  if (totalCost > 0 && listingPrice > 0) {
    profitabilityGateOk = listingPrice > totalCost;
    if (!profitabilityGateOk) {
      notes.push(`PRECIO DE VENTA (${listingPrice}) <= COSTO TOTAL (${totalCost}). Compra automática bloqueada.`);
    }
  }

  const manualInterventionRequired =
    !aliexpressUrlPresent || profitabilityGateOk === false;

  if (rawShippingStatus === 'me2_attempted_not_enforced') {
    notes.push('SHIPPING_TRUTH_NOT_ENFORCED_ON_ML: Listing opera en not_specified. Monitorear por ml_forbidden.');
  }

  if (!legalCompliance.legalTextsAppended) {
    notes.push('Textos legales de importación NO appended en descripción. Republicar para corregir.');
  }

  // ── Overall readiness ──
  const criticalIssues = notes.filter((n) => n.startsWith('FALTA') || n.startsWith('PRECIO'));
  const warnings = notes.filter((n) => n.startsWith('SHIPPING') || n.startsWith('Textos'));

  let overallReadiness: MLChileBusinessTruth['overallReadiness'];
  if (criticalIssues.length > 0) {
    overallReadiness = 'not_ready';
  } else if (warnings.length > 0) {
    overallReadiness = 'partial';
  } else {
    overallReadiness = 'ready';
  }

  // ── Operator summary ──
  const operatorSummary: string[] = [
    `Origen: ${originCountry === 'CN' ? 'China (AliExpress dropshipping)' : originCountry}`,
    `ETA: ${etaMin}-${etaMax} días (base: ${etaBasis})`,
    `Shipping mode: ${shippingTruth.mode} | Handling: ${shippingTruth.handlingTimeDays} días`,
    `IVA: ${(CL_IVA_RATE * 100).toFixed(0)}% — gestionado por Mercado Libre`,
    `Textos legales en descripción: ${legalCompliance.legalTextsAppended ? 'SÍ' : 'NO'}`,
    `Readiness: ${overallReadiness.toUpperCase()}`,
    ...notes,
  ];

  return {
    originCountry,
    sourcingType,
    eta: {
      minDays: etaMin,
      maxDays: etaMax,
      label: `${etaMin}-${etaMax} días`,
      basis: etaBasis,
    },
    shippingTruth,
    taxTruth,
    legalCompliance,
    fulfillmentReadiness: {
      aliexpressUrlPresent,
      profitabilityGateOk,
      manualInterventionRequired,
      notes,
    },
    overallReadiness,
    operatorSummary,
  };
}

/**
 * Log the business truth at publish time (audit trail).
 */
export function logMLChilePublishTruth(
  truth: MLChileBusinessTruth,
  context: { productId?: number; listingId?: string; userId?: number }
): void {
  logger.info('[ML-CHILE-COMPLIANCE] Business truth at publish time', {
    productId: context.productId,
    listingId: context.listingId,
    userId: context.userId,
    originCountry: truth.originCountry,
    etaLabel: truth.eta.label,
    etaBasis: truth.eta.basis,
    shippingTruthStatus: truth.shippingTruth.status,
    shippingMode: truth.shippingTruth.mode,
    handlingTimeDays: truth.shippingTruth.handlingTimeDays,
    legalTextsAppended: truth.legalCompliance.legalTextsAppended,
    ivaHandledBy: truth.taxTruth.ivaHandledBy,
    overallReadiness: truth.overallReadiness,
    notes: truth.fulfillmentReadiness.notes,
  });
}
