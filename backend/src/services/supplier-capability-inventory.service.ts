import { CredentialsManager } from './credentials-manager.service';
import { getAlibabaSupplierCapability } from './alibaba-supplier-capability.service';

export type SupplierCapabilityState =
  | 'production_usable_now'
  | 'partially_implemented'
  | 'code_skeleton_only'
  | 'unsafe_or_incomplete'
  | 'deprecated'
  | 'dead_code'
  | 'promising_but_blocked_by_credentials_env';

export type SupplierTruthQuality = 'high' | 'medium' | 'low' | 'none';

export interface SupplierCapabilityEntry {
  supplierPath: string;
  currentState: SupplierCapabilityState;
  stockTruthQuality: SupplierTruthQuality;
  shippingTruthQuality: SupplierTruthQuality;
  marginViability: 'high' | 'medium' | 'low' | 'unknown';
  destinationSupport: 'broad' | 'limited' | 'unknown' | 'none';
  productionSafety: 'safe' | 'partial' | 'unsafe';
  notes: string;
}

export interface SupplierCapabilityInventory {
  entries: SupplierCapabilityEntry[];
  summary: {
    productionUsableNow: string[];
    partiallyImplemented: string[];
    blockedByCredentialsOrEnv: string[];
    noProductionSafeAlternativeInCodebase: boolean;
    strongestRunnableStrategy:
      | 'aliexpress_hybrid_internal_fallbacks'
      | 'no_production_safe_alternative_in_codebase';
  };
}

export interface SupplierStrategySelectionInput {
  scanned: number;
  validated: number;
  rejectionSummaryByCode: Record<string, number>;
}

export interface SupplierStrategySelection {
  strategy:
    | 'improve_aliexpress_only_strategy'
    | 'activate_safer_existing_fallback'
    | 'combine_aliexpress_with_existing_fallback_ranking'
    | 'no_production_safe_alternative_exists_yet_in_codebase';
  rationale: string;
  recommendedNextMove:
    | 'continue_ebay_with_new_supplier_strategy'
    | 'start_mercadolibre_after_supplier_strategy_change'
    | 'require_new_supplier_integration_before_any_more_marketplace_work'
    | 'stop_first_sale_loop_until_new_source_capability_exists';
}

async function hasCredential(userId: number, provider: string): Promise<boolean> {
  const production = await CredentialsManager.getCredentials(userId, provider, 'production');
  if (production) return true;
  const sandbox = await CredentialsManager.getCredentials(userId, provider, 'sandbox');
  return Boolean(sandbox);
}

export async function getSupplierCapabilityInventory(
  userId: number
): Promise<SupplierCapabilityInventory> {
  const alibabaCapability = await getAlibabaSupplierCapability(userId);
  const [
    hasAffiliate,
    hasDropshipping,
    hasLegacyAliExpress,
    hasScraperApi,
    hasZenRows,
  ] = await Promise.all([
    hasCredential(userId, 'aliexpress-affiliate'),
    hasCredential(userId, 'aliexpress-dropshipping'),
    hasCredential(userId, 'aliexpress'),
    hasCredential(userId, 'scraperapi'),
    hasCredential(userId, 'zenrows'),
  ]);

  const entries: SupplierCapabilityEntry[] = [
    {
      supplierPath: 'AliExpress Affiliate API discovery',
      currentState: hasAffiliate
        ? 'production_usable_now'
        : 'promising_but_blocked_by_credentials_env',
      stockTruthQuality: 'low',
      shippingTruthQuality: 'none',
      marginViability: 'medium',
      destinationSupport: 'broad',
      productionSafety: hasAffiliate ? 'partial' : 'unsafe',
      notes: 'Good for candidate discovery only; not sufficient for publish-safe supplier proof.',
    },
    {
      supplierPath: 'AliExpress Dropshipping API validation/purchase',
      currentState: hasDropshipping
        ? 'production_usable_now'
        : 'promising_but_blocked_by_credentials_env',
      stockTruthQuality: 'high',
      shippingTruthQuality: 'high',
      marginViability: 'medium',
      destinationSupport: 'broad',
      productionSafety: hasDropshipping ? 'safe' : 'unsafe',
      notes: 'Primary truth source for SKU, stock, destination shipping, and safe fulfillment.',
    },
    {
      supplierPath: 'AliExpress preventive supplier audit + fallback ranking',
      currentState:
        hasAffiliate && hasDropshipping
          ? 'production_usable_now'
          : 'promising_but_blocked_by_credentials_env',
      stockTruthQuality: 'high',
      shippingTruthQuality: 'high',
      marginViability: 'medium',
      destinationSupport: 'broad',
      productionSafety: hasAffiliate && hasDropshipping ? 'safe' : 'unsafe',
      notes: 'Strict supplier validation already wired into publish-safe preparation.',
    },
    {
      supplierPath: 'AliExpress alternative product fallback',
      currentState:
        hasAffiliate && hasDropshipping
          ? 'production_usable_now'
          : 'promising_but_blocked_by_credentials_env',
      stockTruthQuality: 'high',
      shippingTruthQuality: 'high',
      marginViability: 'medium',
      destinationSupport: 'broad',
      productionSafety: hasAffiliate && hasDropshipping ? 'partial' : 'unsafe',
      notes: 'Still AliExpress-only, but can swap to a different product with stock when the original candidate fails.',
    },
    {
      supplierPath: 'Smart supplier selector for manual fulfillment',
      currentState: hasDropshipping ? 'partially_implemented' : 'unsafe_or_incomplete',
      stockTruthQuality: 'medium',
      shippingTruthQuality: 'medium',
      marginViability: 'unknown',
      destinationSupport: 'limited',
      productionSafety: 'partial',
      notes: 'Useful for manual/reactive paths, not the main strict validated-catalog engine.',
    },
    {
      supplierPath: 'AliExpress native/advanced scraping discovery',
      currentState:
        hasScraperApi || hasZenRows
          ? 'partially_implemented'
          : 'promising_but_blocked_by_credentials_env',
      stockTruthQuality: 'low',
      shippingTruthQuality: 'none',
      marginViability: 'low',
      destinationSupport: 'unknown',
      productionSafety: 'unsafe',
      notes: 'Discovery helper only; not a publish-safe supplier truth path.',
    },
    {
      supplierPath: 'Supplier adapter abstraction',
      currentState: 'code_skeleton_only',
      stockTruthQuality: 'none',
      shippingTruthQuality: 'none',
      marginViability: 'unknown',
      destinationSupport: 'unknown',
      productionSafety: 'unsafe',
      notes: 'Architecture exists for multiple suppliers, but only AliExpress adapter is implemented.',
    },
    {
      supplierPath: 'Non-AliExpress production-safe supplier connector',
      currentState: 'dead_code',
      stockTruthQuality: 'none',
      shippingTruthQuality: 'none',
      marginViability: 'unknown',
      destinationSupport: 'none',
      productionSafety: 'unsafe',
      notes: 'No production-safe non-AliExpress supplier connector was found in the current codebase.',
    },
    {
      supplierPath: 'Alibaba planned supplier path',
      currentState: alibabaCapability.currentState,
      stockTruthQuality: alibabaCapability.skuStockTruth === 'present' ? 'high' : 'none',
      shippingTruthQuality:
        alibabaCapability.destinationShippingTruth === 'present' ? 'high' : 'none',
      marginViability: alibabaCapability.shippingCostTruth === 'present' ? 'medium' : 'low',
      destinationSupport:
        alibabaCapability.discoveryCapability === 'present' ? 'limited' : 'none',
      productionSafety: alibabaCapability.productionSafe ? 'safe' : 'unsafe',
      notes: alibabaCapability.blockers.join(' '),
    },
  ];

  const productionUsableNow = entries
    .filter((entry) => entry.currentState === 'production_usable_now')
    .map((entry) => entry.supplierPath);
  const partiallyImplemented = entries
    .filter((entry) => entry.currentState === 'partially_implemented')
    .map((entry) => entry.supplierPath);
  const blockedByCredentialsOrEnv = entries
    .filter((entry) => entry.currentState === 'promising_but_blocked_by_credentials_env')
    .map((entry) => entry.supplierPath);
  const noProductionSafeAlternativeInCodebase = !entries.some(
    (entry) =>
      entry.supplierPath !== 'Non-AliExpress production-safe supplier connector' &&
      entry.supplierPath !== 'Alibaba planned supplier path' &&
      entry.supplierPath.toLowerCase().includes('non-aliexpress') === false &&
      entry.productionSafety === 'safe' &&
      !entry.supplierPath.toLowerCase().includes('aliexpress')
  );

  return {
    entries,
    summary: {
      productionUsableNow,
      partiallyImplemented,
      blockedByCredentialsOrEnv,
      noProductionSafeAlternativeInCodebase,
      strongestRunnableStrategy: noProductionSafeAlternativeInCodebase
        ? 'aliexpress_hybrid_internal_fallbacks'
        : 'no_production_safe_alternative_in_codebase',
    },
  };
}

export function selectSupplierStrategyForFirstValidatedProduct(
  inventory: SupplierCapabilityInventory,
  evidence: SupplierStrategySelectionInput
): SupplierStrategySelection {
  const noStock = evidence.rejectionSummaryByCode.no_stock_for_destination || 0;
  const marginInvalid = evidence.rejectionSummaryByCode.margin_invalid || 0;
  const supplierUnavailable = evidence.rejectionSummaryByCode.supplier_unavailable || 0;

  if (
    inventory.summary.noProductionSafeAlternativeInCodebase &&
    evidence.validated === 0 &&
    evidence.scanned >= 40 &&
    noStock >= marginInvalid
  ) {
    return {
      strategy: 'no_production_safe_alternative_exists_yet_in_codebase',
      rationale: `Current codebase remains AliExpress-centric. Evidence is already strong (${evidence.scanned} scanned / ${evidence.validated} validated, no_stock_for_destination=${noStock}, margin_invalid=${marginInvalid}, supplier_unavailable=${supplierUnavailable}), so more marketplace work would be lower leverage than adding a new supplier path.`,
      recommendedNextMove: 'require_new_supplier_integration_before_any_more_marketplace_work',
    };
  }

  return {
    strategy: 'combine_aliexpress_with_existing_fallback_ranking',
    rationale: 'The only production-safe supplier path currently available is AliExpress with internal fallback ranking and alternative-product substitution. The best next step is to squeeze that path fairly before integrating a new supplier.',
    recommendedNextMove: 'continue_ebay_with_new_supplier_strategy',
  };
}

export default {
  getSupplierCapabilityInventory,
  selectSupplierStrategyForFirstValidatedProduct,
};
