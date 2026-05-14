import type {
  CjDestinationInventorySummary,
  CjProductDetail,
  CjProductSummary,
  CjQuoteShippingToUsRealInput,
  ICjSupplierAdapter,
} from '../adapters/cj-supplier.adapter.interface';

export type CjEbayUsWarehouseStatus =
  | 'US_CONFIRMED'
  | 'US_PROBABLE'
  | 'CN_CONFIRMED'
  | 'UNKNOWN'
  | 'CONFLICTING';

export type CjEbayUsWarehouseEvidenceSource =
  | 'freight_us'
  | 'destination_inventory'
  | 'freight_cn_fallback'
  | 'none'
  | 'conflicting';

export interface CjEbayUsWarehouseEvidence {
  status: CjEbayUsWarehouseStatus;
  source: CjEbayUsWarehouseEvidenceSource;
  confidenceScore: number;
  reasons: string[];
  destinationInventory?: CjDestinationInventorySummary | null;
  freight?: Awaited<ReturnType<ICjSupplierAdapter['quoteShippingToUsWarehouseAware']>> | null;
}

function localInventoryUnits(entry: CjDestinationInventorySummary | null | undefined): number | null {
  if (!entry) return null;
  const total = entry.totalInventoryNum;
  const cj = entry.cjInventoryNum;
  const factory = entry.factoryInventoryNum;
  const nonFactoryTotal = total != null ? Math.max(total - (factory ?? 0), 0) : null;
  if (cj != null && Number.isFinite(cj)) return Math.max(cj, nonFactoryTotal ?? 0);
  if (nonFactoryTotal != null && Number.isFinite(nonFactoryTotal)) return nonFactoryTotal;
  return null;
}

export function findUsDestinationInventory(
  item: Pick<CjProductSummary | CjProductDetail, 'destinationInventories'>
): CjDestinationInventorySummary | null {
  const rows = Array.isArray(item.destinationInventories) ? item.destinationInventories : [];
  return rows.find((entry) => String(entry.countryCode || '').trim().toUpperCase() === 'US') ?? null;
}

export function classifyUsDestinationInventory(
  item: Pick<CjProductSummary | CjProductDetail, 'destinationInventories'>
): CjEbayUsWarehouseEvidence {
  const destinationInventory = findUsDestinationInventory(item);
  const units = localInventoryUnits(destinationInventory);
  if (destinationInventory?.verifiedWarehouse === true && (units ?? 0) > 0) {
    return {
      status: 'US_PROBABLE',
      source: 'destination_inventory',
      confidenceScore: 75,
      destinationInventory,
      reasons: [`CJ search/detail reports verified US warehouse inventory (${units} units).`],
    };
  }
  if ((units ?? 0) > 0) {
    return {
      status: 'US_PROBABLE',
      source: 'destination_inventory',
      confidenceScore: 60,
      destinationInventory,
      reasons: [`CJ search/detail reports US destination inventory (${units} units), but warehouse verification flag is missing.`],
    };
  }
  return {
    status: 'UNKNOWN',
    source: 'none',
    confidenceScore: 0,
    destinationInventory,
    reasons: destinationInventory
      ? ['CJ exposes a US destination inventory row, but usable local units were not confirmed.']
      : ['CJ did not expose a US destination inventory row.'],
  };
}

export const cjEbayUsWarehouseEvidenceService = {
  async resolve(input: {
    adapter: ICjSupplierAdapter;
    product?: Pick<CjProductSummary | CjProductDetail, 'destinationInventories'> | null;
    freightInput: CjQuoteShippingToUsRealInput;
  }): Promise<CjEbayUsWarehouseEvidence> {
    const inventoryEvidence = input.product
      ? classifyUsDestinationInventory(input.product)
      : {
          status: 'UNKNOWN' as const,
          source: 'none' as const,
          confidenceScore: 0,
          reasons: ['No CJ product inventory evidence was available.'],
          destinationInventory: null,
        };

    try {
      const freight = await input.adapter.quoteShippingToUsWarehouseAware(input.freightInput);
      if (freight.fulfillmentOrigin === 'US') {
        return {
          status: 'US_CONFIRMED',
          source: 'freight_us',
          confidenceScore: 100,
          destinationInventory: inventoryEvidence.destinationInventory,
          freight,
          reasons: [
            'CJ freightCalculate accepted startCountryCode=US for this variant.',
            ...inventoryEvidence.reasons,
          ],
        };
      }

      if (inventoryEvidence.status === 'US_PROBABLE') {
        return {
          status: 'CONFLICTING',
          source: 'conflicting',
          confidenceScore: 40,
          destinationInventory: inventoryEvidence.destinationInventory,
          freight,
          reasons: [
            'CJ destination inventory suggests US stock, but freightCalculate fell back to CN.',
            ...inventoryEvidence.reasons,
          ],
        };
      }

      return {
        status: 'CN_CONFIRMED',
        source: 'freight_cn_fallback',
        confidenceScore: 90,
        destinationInventory: inventoryEvidence.destinationInventory,
        freight,
        reasons: [
          'CJ freightCalculate did not confirm US origin and returned a CN fallback quote.',
          ...inventoryEvidence.reasons,
        ],
      };
    } catch (error) {
      if (inventoryEvidence.status === 'US_PROBABLE') {
        return {
          ...inventoryEvidence,
          reasons: [
            ...inventoryEvidence.reasons,
            `US freight probe failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        };
      }
      return {
        status: 'UNKNOWN',
        source: 'none',
        confidenceScore: 0,
        destinationInventory: inventoryEvidence.destinationInventory,
        reasons: [
          ...inventoryEvidence.reasons,
          `US warehouse evidence probe failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  },
};
