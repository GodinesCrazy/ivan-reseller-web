/**
 * CJ Open API 2.0 — `POST .../logistic/freightCalculate` (modo simple).
 *
 * Fuente: documentación oficial CJ — sección "1.1 Freight Calculation (POST)" en:
 * https://developers.cjdropshipping.com/en/api/api2/api/logistic.html
 *
 * No mezclar con `freightCalculateTip` (modo distinto, otros campos obligatorios).
 */

import { CjSupplierError } from './cj-supplier.errors';

/** URL path relativo a `https://developers.cjdropshipping.com/api2.0/v1/` */
export const CJ_FREIGHT_CALCULATE_PATH = 'logistic/freightCalculate' as const;

export const CJ_FREIGHT_OFFICIAL_DOC =
  'https://developers.cjdropshipping.com/en/api/api2/api/logistic.html#_1-1-freight-calculation-post';

/**
 * Cuerpo de petición oficial (ejemplo CURL en la doc).
 * Obligatorios: startCountryCode, endCountryCode, products[].quantity, products[].vid
 * Opcionales en raíz: zip, taxId, houseNumber, iossNumber
 * Nota: la doc no incluye `warehouse` / `storageId` en este modo; el modo "Tip" usa otro contrato.
 */
export interface CjOfficialFreightCalculateRequest {
  startCountryCode: string;
  endCountryCode: string;
  products: Array<{ quantity: number; vid: string }>;
  zip?: string;
  taxId?: string;
  houseNumber?: string;
  iossNumber?: string;
}

/** Una fila de la respuesta `data` (array) en respuesta exitosa de la doc. */
export interface CjOfficialFreightOptionRow {
  logisticAging?: string;
  logisticPrice?: number;
  logisticPriceCn?: number;
  logisticName?: string;
  taxesFee?: number;
  clearanceOperationFee?: number;
  totalPostageFee?: number;
}

export interface CjShippingQuoteNormalized {
  cost: number;
  method: string;
  estimatedDays: number | null;
  /** Respuesta completa del campo `data` de CJ (array de opciones de envío). */
  raw: unknown;
}

function asFreightRow(x: unknown): CjOfficialFreightOptionRow | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  return x as CjOfficialFreightOptionRow;
}

/**
 * `logisticAging` en la doc es string (ej. "2-5"). Devolvemos el límite superior numérico si es parseable
 * (conservador para cumplimiento); si no, null.
 */
export function parseLogisticAgingToMaxDays(aging: string | undefined): number | null {
  if (!aging || typeof aging !== 'string') return null;
  const t = aging.trim();
  const m = t.match(/(\d+)\s*[-–~]\s*(\d+)/);
  if (m) {
    const hi = Number(m[2]);
    return Number.isFinite(hi) ? hi : null;
  }
  const single = t.match(/^\d+$/);
  if (single) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowUsdCost(row: CjOfficialFreightOptionRow): number {
  const p = row.logisticPrice;
  if (typeof p === 'number' && Number.isFinite(p) && p >= 0) return p;
  const total = row.totalPostageFee;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) return total;
  return NaN;
}

/**
 * Construye el JSON exacto del CURL oficial + zip opcional (campo `zip` en la tabla de parámetros).
 */
export function buildOfficialFreightCalculatePayload(params: {
  vid: string;
  quantity: number;
  endCountryCode: string;
  startCountryCode?: string;
  zip?: string;
}): CjOfficialFreightCalculateRequest {
  const vid = String(params.vid || '').trim();
  const q = Math.floor(Number(params.quantity));
  if (!vid) {
    throw new CjSupplierError('freightCalculate: vid required', { code: 'CJ_INVALID_SKU' });
  }
  if (!Number.isFinite(q) || q < 1) {
    throw new CjSupplierError('freightCalculate: quantity must be >= 1', { code: 'CJ_INVALID_SKU' });
  }
  const body: CjOfficialFreightCalculateRequest = {
    startCountryCode: String(params.startCountryCode || 'CN').trim() || 'CN',
    endCountryCode: String(params.endCountryCode || 'US').trim() || 'US',
    products: [{ quantity: q, vid }],
  };
  const zip = params.zip?.trim();
  if (zip) body.zip = zip;
  return body;
}

/**
 * Normaliza `data` de CJ: debe ser un array no vacío de opciones. Elige la opción de menor coste USD
 * entre filas con `logisticPrice` / `totalPostageFee` válidos.
 */
export function normalizeFreightCalculateData(data: unknown): CjShippingQuoteNormalized {
  if (!Array.isArray(data) || data.length === 0) {
    throw new CjSupplierError('CJ freightCalculate returned no shipping options (empty data array)', {
      code: 'CJ_SHIPPING_UNAVAILABLE',
    });
  }

  const rows = data.map(asFreightRow).filter((r): r is CjOfficialFreightOptionRow => r !== null);

  let best: CjOfficialFreightOptionRow | null = null;
  let bestCost = Infinity;

  for (const row of rows) {
    const c = rowUsdCost(row);
    if (Number.isFinite(c) && c < bestCost) {
      bestCost = c;
      best = row;
    }
  }

  if (!best || !Number.isFinite(bestCost)) {
    throw new CjSupplierError(
      'CJ returned shipping rows but no usable logisticPrice/totalPostageFee',
      { code: 'CJ_SHIPPING_UNAVAILABLE' }
    );
  }

  const method = typeof best.logisticName === 'string' && best.logisticName.trim()
    ? best.logisticName.trim()
    : 'unknown';

  return {
    cost: bestCost,
    method,
    estimatedDays: parseLogisticAgingToMaxDays(
      typeof best.logisticAging === 'string' ? best.logisticAging : undefined
    ),
    raw: data,
  };
}
