/**
 * Política mínima y honesta CJ → eBay USA (FASE 3D).
 * - Origen China por defecto (dropshipping internacional). Cuando CJ_EBAY_WAREHOUSE_AWARE=true
 *   y se confirma warehouse USA vía freightCalculate, el origen pasa a ser US.
 * - Handling = días hábiles de preparación antes del envío (buffer de cuenta + suplemento si la cotización CJ no da plazo fiable).
 * - Tiempos de tránsito: solo si vienen en la cotización CJ; si no, texto explícito de “unknown” — sin ebay-us-delivery-estimate legacy.
 * - REGLA DE VERACIDAD: si el origen no está confirmado, se declara China. Nunca prometer USA sin confirmación freight_api_confirmed.
 */

/** Default (China-first). Dynamic value passed to buildListingDescriptionHtml when warehouse-aware. */
export const CJ_LISTING_ORIGIN_COUNTRY = 'CN';
export const CJ_LISTING_ORIGIN_LABEL = 'China';

/** Resolve origin country code and label from the stored shipping quote origin. */
export function resolveListingOrigin(originCountryCode: string | null | undefined): {
  country: string;
  label: string;
} {
  const code = String(originCountryCode || 'CN').trim().toUpperCase();
  if (code === 'US') {
    return { country: 'US', label: 'USA (CJ US Warehouse)' };
  }
  // Default: China. Any unrecognized code is treated as CN for safety.
  return { country: 'CN', label: 'China' };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Días hábiles de handling para la ficha: siempre incluye `handlingBufferDays` de cuenta.
 * Si la confianza del plazo CJ es `unknown`, suma 1 día hábil como colchón operativo (no es promesa de entrega).
 */
export function computeHandlingTimeDays(
  settingsHandlingBufferDays: number,
  quoteConfidence: string
): number {
  const base = Math.max(1, Math.min(30, Number(settingsHandlingBufferDays) || 3));
  const c = String(quoteConfidence || '').toLowerCase();
  if (c === 'unknown' || c === '') {
    return Math.min(30, base + 1);
  }
  return base;
}

export function buildListingDescriptionHtml(params: {
  productDescriptionPlain: string | null;
  handlingTimeDays: number;
  shippingMinDays: number | null;
  shippingMaxDays: number | null;
  quoteConfidence: string;
  /** @deprecated No longer shown in buyer-facing description. Retained for call-site compatibility. */
  shippingCostUsd?: number;
  shippingMethod: string | null;
  /**
   * Origin country from the shipping quote (e.g. "US" or "CN").
   * When "US" and warehouseEvidence=freight_api_confirmed, ships from USA.
   * Defaults to CJ_LISTING_ORIGIN_LABEL (China) if not provided.
   */
  originCountryCode?: string | null;
}): string {
  const resolved = resolveListingOrigin(params.originCountryCode);
  const origin = escapeHtml(resolved.label);
  const handling = escapeHtml(String(params.handlingTimeDays));
  const conf = escapeHtml(String(params.quoteConfidence || 'unknown'));
  const method = params.shippingMethod ? escapeHtml(params.shippingMethod) : 'international carrier';

  let transitBlock: string;
  if (
    params.shippingMinDays != null &&
    params.shippingMaxDays != null &&
    Number.isFinite(params.shippingMinDays) &&
    Number.isFinite(params.shippingMaxDays)
  ) {
    transitBlock = `<p><strong>Transit estimate (supplier to USA, not a guaranteed delivery date):</strong> approximately ${escapeHtml(String(params.shippingMinDays))}–${escapeHtml(String(params.shippingMaxDays))} days after dispatch (source: CJ freight quote; confidence: ${conf}).</p>`;
  } else {
    transitBlock = `<p><strong>Transit time:</strong> not provided by the supplier API for this item (confidence: ${conf}). The listing ships from ${origin}; see checkout for the carrier service and delivery window offered under our eBay business policies.</p>`;
  }

  const plain = (params.productDescriptionPlain || '').trim().slice(0, 12000);
  const bodyEscaped = escapeHtml(plain) || 'Product sourced from supplier catalog.';

  return `<div>
<p><strong>Ships from ${origin}.</strong> International dropshipping — not US domestic same-day delivery.</p>
<p><strong>Handling time:</strong> up to ${handling} business days before we dispatch your order.</p>
${transitBlock}
<p><strong>Shipping method:</strong> ${method}. Carrier and delivery window are confirmed at checkout under our eBay business policies.</p>
<p><strong>Disclaimer:</strong> Transit times are estimates only. Customs clearance, weather, or carrier delays may extend delivery.</p>
<hr/>
<p>${bodyEscaped.replace(/\n/g, '<br/>')}</p>
</div>`;
}
