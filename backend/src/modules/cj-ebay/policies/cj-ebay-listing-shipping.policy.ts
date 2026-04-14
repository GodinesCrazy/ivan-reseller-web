/**
 * Política mínima y honesta CJ → eBay USA (FASE 3D).
 * - Origen China (dropshipping internacional), sin simular stock local USA.
 * - Handling = días hábiles de preparación antes del envío (buffer de cuenta + suplemento si la cotización CJ no da plazo fiable).
 * - Tiempos de tránsito: solo si vienen en la cotización CJ; si no, texto explícito de “unknown” — sin ebay-us-delivery-estimate legacy.
 */

export const CJ_LISTING_ORIGIN_COUNTRY = 'CN';
export const CJ_LISTING_ORIGIN_LABEL = 'China';

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
  shippingCostUsd: number;
  shippingMethod: string | null;
}): string {
  const origin = escapeHtml(CJ_LISTING_ORIGIN_LABEL);
  const handling = escapeHtml(String(params.handlingTimeDays));
  const conf = escapeHtml(String(params.quoteConfidence || 'unknown'));
  const method = params.shippingMethod ? escapeHtml(params.shippingMethod) : 'supplier logistics';
  const cost =
    Number.isFinite(params.shippingCostUsd) && params.shippingCostUsd >= 0
      ? escapeHtml(params.shippingCostUsd.toFixed(2))
      : 'n/a';

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
<p><strong>Handling time:</strong> up to ${handling} business days before we dispatch your order (includes configured operational buffer).</p>
${transitBlock}
<p><strong>Supplier shipping reference:</strong> ${method} — internal freight estimate USD ${cost} (for our cost planning; buyer pays per eBay checkout).</p>
<p><strong>Disclaimer:</strong> Dates are estimates only. Customs, weather, or carrier delays may apply.</p>
<hr/>
<p>${bodyEscaped.replace(/\n/g, '<br/>')}</p>
</div>`;
}
