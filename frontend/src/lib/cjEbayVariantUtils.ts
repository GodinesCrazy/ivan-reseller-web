/**
 * CJ Open API variant rows as returned by GET /api/cj-ebay/cj/product/:pid
 */

export type CjProductVariantApi = {
  cjSku: string;
  cjVid?: string;
  attributes?: Record<string, string>;
  unitCostUsd?: number;
  stock?: number;
};

export function cjVariantKey(v: CjProductVariantApi): string {
  const vid = String(v.cjVid || '').trim();
  if (vid) return vid;
  return String(v.cjSku || '').trim();
}

export function cjVariantLabel(v: CjProductVariantApi): string {
  const attrs = v.attributes;
  const attrStr =
    attrs && typeof attrs === 'object'
      ? Object.entries(attrs)
          .map(([k, val]) => `${k}: ${val}`)
          .join(' · ')
      : '';
  const base = attrStr || v.cjSku || 'variant';
  const vid = String(v.cjVid || '').trim();
  return vid ? `${base} · vid ${vid}` : `${base} · SKU ${v.cjSku}`;
}
