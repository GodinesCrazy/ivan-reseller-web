import multiRegionValidationService, {
  P6_FIRST_PRODUCT_RECOVERY_QUERIES,
  type MultiRegionValidationRunResult,
} from './multi-region-validation.service';
import { getSupplierTargetSelection } from './supplier-target-selection.service';

export interface NewSupplierRecoveryBlockedResult {
  strategy: 'alibaba_minimal';
  executed: false;
  productionSafe: false;
  scanned: 0;
  rejected: 0;
  nearValid: 0;
  validated: 0;
  rejectionSummaryByCode: Record<string, number>;
  blockingReasons: string[];
  targetSelection: Awaited<ReturnType<typeof getSupplierTargetSelection>>;
}

export type NewSupplierRecoveryResult =
  | {
      strategy: 'aliexpress_internal';
      executed: true;
      productionSafe: true;
      result: MultiRegionValidationRunResult;
    }
  | NewSupplierRecoveryBlockedResult;

export async function runFirstProductRecoveryWithSupplierStrategy(params: {
  userId: number;
  maxPriceUsd?: number;
  maxSearchResults?: number;
  minSupplierSearch?: number;
  environment?: 'sandbox' | 'production';
}): Promise<NewSupplierRecoveryResult> {
  const selection = await getSupplierTargetSelection(params.userId);

  if (selection.primaryTarget === 'alibaba') {
    return {
      strategy: 'alibaba_minimal',
      executed: false,
      productionSafe: false,
      scanned: 0,
      rejected: 0,
      nearValid: 0,
      validated: 0,
      rejectionSummaryByCode: {
        supplier_data_incomplete: 1,
      },
      blockingReasons: selection.alibabaCapability.blockers,
      targetSelection: selection,
    };
  }

  const result = await multiRegionValidationService.runMultiRegionValidation({
    userId: params.userId,
    marketplaces: ['ebay'],
    queries: [...P6_FIRST_PRODUCT_RECOVERY_QUERIES],
    maxPriceUsd: params.maxPriceUsd,
    maxSearchResults: params.maxSearchResults,
    minSupplierSearch: params.minSupplierSearch,
    environment: params.environment,
    enableAlternativeProductFallback: true,
  });

  return {
    strategy: 'aliexpress_internal',
    executed: true,
    productionSafe: true,
    result,
  };
}

export default {
  runFirstProductRecoveryWithSupplierStrategy,
};
