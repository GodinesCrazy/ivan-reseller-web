export interface NormalizedAliExpressSku {
  skuId: string;
  stock: number;
  salePrice: number;
  /** Parsed from DS `sku_property_list` / nested `ae_sku_property` when present */
  attributes: Record<string, string>;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function getNumberishField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const direct = toFiniteNumber(value);
    if (direct != null) return direct;
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      const nestedValue =
        toFiniteNumber(nested.value) ??
        toFiniteNumber(nested.amount) ??
        toFiniteNumber(nested.cent) ??
        toFiniteNumber(nested.cent_amount);
      if (nestedValue != null) return nestedValue;
    }
  }
  return null;
}

function unwrapAeSkuPropertyRows(list: unknown): unknown[] {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  if (typeof list === 'object') {
    const o = list as Record<string, unknown>;
    const inner =
      o.ae_sku_property ??
      o.aeSkuProperty ??
      o.sku_property ??
      o.property ??
      o.ae_sku_property_d_t_o;
    if (Array.isArray(inner)) return inner;
    if (inner && typeof inner === 'object') return [inner];
  }
  return [];
}

function mergePropertyRowsIntoAttributes(
  out: Record<string, string>,
  list: unknown,
): void {
  for (const p of unwrapAeSkuPropertyRows(list)) {
    if (!p || typeof p !== 'object') continue;
    const rec = p as Record<string, unknown>;
    const name =
      getStringField(rec, ['sku_property_name', 'property_name', 'attr_name', 'name']) ?? null;
    const value =
      getStringField(rec, ['sku_property_value', 'property_value', 'attr_value', 'value']) ?? null;
    if (name && value) out[name] = value;
  }
}

/** Best-effort: DS `aliexpress.ds.product.get` uses `sku_property_list` or `ae_sku_property_dtos`. */
export function extractAeSkuAttributesFromRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  mergePropertyRowsIntoAttributes(out, row.sku_property_list ?? row.skuPropertyList);

  const dtoWrap = row.ae_sku_property_dtos ?? row.aeSkuPropertyDtos;
  if (dtoWrap && typeof dtoWrap === 'object') {
    const dw = dtoWrap as Record<string, unknown>;
    const inner = dw.ae_sku_property_d_t_o ?? dw.ae_sku_property_dto ?? dw.ae_sku_property;
    mergePropertyRowsIntoAttributes(out, inner);
  }

  return out;
}

export function normalizeAliExpressRawSkus(info: Record<string, unknown>): NormalizedAliExpressSku[] {
  const rawContainer = (info as Record<string, any>)?.ae_item_sku_info_dtos;
  const rawList =
    rawContainer?.ae_item_sku_info_d_t_o ??
    rawContainer?.ae_item_sku_info_dto ??
    rawContainer?.ae_item_sku_info ??
    [];

  const rows = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
  const normalized: NormalizedAliExpressSku[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const skuId = getStringField(record, ['sku_id', 'skuId', 'id']);
    const stock = getNumberishField(record, [
      'sku_available_stock',
      'available_stock',
      'stock',
      'sku_stock',
      'ipm_sku_stock',
    ]);
    const salePrice = getNumberishField(record, [
      'offer_sale_price',
      'sku_price',
      'price',
      'sale_price',
      'offer_price',
    ]);

    if (!skuId || stock == null || salePrice == null) continue;
    normalized.push({
      skuId,
      stock,
      salePrice,
      attributes: extractAeSkuAttributesFromRow(record),
    });
  }

  return normalized;
}
