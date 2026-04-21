import { CjSupplierError } from '../../cj-ebay/adapters/cj-supplier.errors';
import type {
  CjDestinationInventorySummary,
  CjProductDetail,
  CjProductSummary,
  ICjSupplierAdapter,
} from '../../cj-ebay/adapters/cj-supplier.adapter.interface';
import { CJ_CHILE_DEST_COUNTRY, CJ_CHILE_PROBE_POSTAL } from '../adapters/cj-ml-chile-supplier.adapter';

export type MlChileOperabilityStatus = 'operable' | 'stock_unknown' | 'unavailable';
export type MlChileLocalStockStatus = 'chile_local' | 'global_only' | 'stock_unknown' | 'out_of_stock';

export interface MlChileSearchCandidateSummary extends CjProductSummary {
  operabilityStatus: MlChileOperabilityStatus;
  localStockStatus: MlChileLocalStockStatus;
  warehouseChileConfirmed: boolean;
  localStockEvidenceSource:
    | 'search_destination_inventory'
    | 'live_stock_and_freight'
    | 'live_stock_only'
    | 'none';
  destinationInventory?: CjDestinationInventorySummary | null;
  localReadyVariantId?: string;
}

export interface MlChileLocalStockProbeResult {
  operabilityStatus: MlChileOperabilityStatus;
  localStockStatus: MlChileLocalStockStatus;
  warehouseChileConfirmed: boolean;
  localStockEvidenceSource:
    | 'search_destination_inventory'
    | 'live_stock_and_freight'
    | 'live_stock_only'
    | 'none';
  destinationInventory?: CjDestinationInventorySummary | null;
  localReadyVariantId?: string;
  checkedVariantCount: number;
  candidateVariantCount: number;
  liveStockFound: boolean;
}

function localInventoryUnits(entry: CjDestinationInventorySummary | null | undefined): number | null {
  if (!entry) return null;
  const total = entry.totalInventoryNum;
  const cj = entry.cjInventoryNum;
  const factory = entry.factoryInventoryNum;

  const nonFactoryTotal =
    total != null ? Math.max(total - (factory ?? 0), 0) : null;

  if (cj != null && Number.isFinite(cj)) {
    return Math.max(cj, nonFactoryTotal ?? 0);
  }
  if (nonFactoryTotal != null && Number.isFinite(nonFactoryTotal)) {
    return nonFactoryTotal;
  }
  return null;
}

export function findChileDestinationInventory(
  item: Pick<CjProductSummary, 'destinationInventories'>
): CjDestinationInventorySummary | null {
  const rows = Array.isArray(item.destinationInventories) ? item.destinationInventories : [];
  return rows.find((entry) => String(entry.countryCode || '').trim().toUpperCase() === CJ_CHILE_DEST_COUNTRY) ?? null;
}

export function seedMlChileSearchCandidate(item: CjProductSummary): MlChileSearchCandidateSummary {
  const destinationInventory = findChileDestinationInventory(item);
  const readyByDestinationInventory =
    destinationInventory?.verifiedWarehouse === true &&
    (localInventoryUnits(destinationInventory) ?? 0) > 0;

  if (readyByDestinationInventory) {
    return {
      ...item,
      operabilityStatus: 'operable',
      localStockStatus: 'chile_local',
      warehouseChileConfirmed: true,
      localStockEvidenceSource: 'search_destination_inventory',
      destinationInventory,
    };
  }

  if (item.inventoryTotal === 0) {
    return {
      ...item,
      operabilityStatus: 'unavailable',
      localStockStatus: 'out_of_stock',
      warehouseChileConfirmed: false,
      localStockEvidenceSource: 'none',
      destinationInventory,
    };
  }

  return {
    ...item,
    operabilityStatus: 'stock_unknown',
    localStockStatus: 'stock_unknown',
    warehouseChileConfirmed: false,
    localStockEvidenceSource: 'none',
    destinationInventory,
  };
}

function liveStockVariantKeys(detail: CjProductDetail): string[] {
  return detail.variants
    .map((variant) => String(variant.cjVid || '').trim())
    .filter(Boolean);
}

export async function enrichMlChileProductDetailWithLiveStock(
  adapter: ICjSupplierAdapter,
  detail: CjProductDetail,
  probeLimit = 100
): Promise<{
  product: CjProductDetail;
  liveStockCoverage: { checked: number; total: number; complete: boolean };
}> {
  const variantKeys = liveStockVariantKeys(detail);
  const probeKeys = variantKeys.slice(0, Math.min(probeLimit, variantKeys.length));
  if (probeKeys.length === 0) {
    return {
      product: detail,
      liveStockCoverage: { checked: 0, total: 0, complete: true },
    };
  }

  const liveStock = await adapter.getStockForSkus(probeKeys);
  return {
    product: {
      ...detail,
      variants: detail.variants.map((variant) => {
        const key = String(variant.cjVid || '').trim();
        const stock = key ? liveStock.get(key) : undefined;
        return stock === undefined ? variant : { ...variant, stock };
      }),
    },
    liveStockCoverage: {
      checked: probeKeys.length,
      total: variantKeys.length,
      complete: probeKeys.length >= variantKeys.length,
    },
  };
}

export async function quoteShippingToChileLocalWarehouse(
  adapter: ICjSupplierAdapter,
  input: { variantId?: string; productId?: string; quantity: number; destPostalCode?: string }
) {
  const freight = await adapter.quoteShippingToUsReal({
    variantId: input.variantId,
    productId: input.productId,
    quantity: input.quantity,
    destPostalCode: input.destPostalCode ?? CJ_CHILE_PROBE_POSTAL,
    startCountryCode: CJ_CHILE_DEST_COUNTRY,
    destCountryCode: CJ_CHILE_DEST_COUNTRY,
  });
  return {
    ...freight,
    warehouseChileConfirmed: true as const,
  };
}

export async function probeProductChileLocalStock(
  adapter: ICjSupplierAdapter,
  cjProductId: string,
  variantProbeLimit = 1
): Promise<MlChileLocalStockProbeResult> {
  const detail = await adapter.getProductById(cjProductId);
  const candidateVariants = [...detail.variants]
    .filter((variant) => variant.stock > 0 || String(variant.cjVid || '').trim())
    .sort((a, b) => b.stock - a.stock);
  const probeVariants = candidateVariants.slice(0, Math.min(candidateVariants.length, Math.max(1, variantProbeLimit)));

  if (probeVariants.length === 0) {
    return {
      operabilityStatus: 'unavailable',
      localStockStatus: 'out_of_stock',
      warehouseChileConfirmed: false,
      localStockEvidenceSource: 'none',
      checkedVariantCount: 0,
      candidateVariantCount: candidateVariants.length,
      liveStockFound: false,
    };
  }

  let liveStockFound = false;
  let sawShippingUnavailable = false;
  let sawUnprobeablePositiveStock = false;

  for (const variant of probeVariants) {
    const vid = String(variant.cjVid || '').trim();
    if (!vid) {
      if (variant.stock > 0) {
        sawUnprobeablePositiveStock = true;
      }
      continue;
    }

    const stockMap = await adapter.getStockForSkus([vid]);
    const liveStock = stockMap.get(vid);
    if (liveStock == null) {
      continue;
    }
    if (liveStock < 1) {
      continue;
    }

    liveStockFound = true;

    try {
      await quoteShippingToChileLocalWarehouse(adapter, {
        productId: cjProductId,
        variantId: vid,
        quantity: 1,
      });
      return {
        operabilityStatus: 'operable',
        localStockStatus: 'chile_local',
        warehouseChileConfirmed: true,
        localStockEvidenceSource: 'live_stock_and_freight',
        localReadyVariantId: vid,
        checkedVariantCount: probeVariants.length,
        candidateVariantCount: candidateVariants.length,
        liveStockFound: true,
      };
    } catch (error) {
      if (error instanceof CjSupplierError && error.code === 'CJ_SHIPPING_UNAVAILABLE') {
        sawShippingUnavailable = true;
        continue;
      }
      throw error;
    }
  }

  if (liveStockFound && sawShippingUnavailable) {
    return {
      operabilityStatus: 'unavailable',
      localStockStatus: 'global_only',
      warehouseChileConfirmed: false,
      localStockEvidenceSource: 'live_stock_only',
      checkedVariantCount: probeVariants.length,
      candidateVariantCount: candidateVariants.length,
      liveStockFound: true,
    };
  }

  if (liveStockFound) {
    return {
      operabilityStatus: 'stock_unknown',
      localStockStatus: 'stock_unknown',
      warehouseChileConfirmed: false,
      localStockEvidenceSource: 'live_stock_only',
      checkedVariantCount: probeVariants.length,
      candidateVariantCount: candidateVariants.length,
      liveStockFound: true,
    };
  }

  if (sawUnprobeablePositiveStock) {
    return {
      operabilityStatus: 'stock_unknown',
      localStockStatus: 'stock_unknown',
      warehouseChileConfirmed: false,
      localStockEvidenceSource: 'live_stock_only',
      checkedVariantCount: probeVariants.length,
      candidateVariantCount: candidateVariants.length,
      liveStockFound: false,
    };
  }

  return {
    operabilityStatus: 'unavailable',
    localStockStatus: 'out_of_stock',
    warehouseChileConfirmed: false,
    localStockEvidenceSource: 'none',
    checkedVariantCount: probeVariants.length,
    candidateVariantCount: candidateVariants.length,
    liveStockFound: false,
  };
}
