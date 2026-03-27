/**
 * P89 — Single auditable Mercado Libre Chile (MLC) listing economics path for publish/preflight.
 * All fee/profit numbers come from `runPreventiveEconomicsCore` (preventive supplier + fee intelligence + ledger).
 */

import type {
  AssertProductValidForPublishingParams,
  PreventiveEconomicsCoreFailure,
  PreventiveEconomicsCoreSuccess,
} from './pre-publish-validator.service';
import { runPreventiveEconomicsCore } from './pre-publish-validator.service';

export type MlcCanonicalPricingAssessment =
  | {
      ok: true;
      source: 'preventive_economics_core';
      listingSalePriceUsd: number;
      shipCountry: string;
      listingCurrency: string;
      profitabilityUsd: {
        netProfitUsd: number;
        marginRatio: number;
        totalCostUsd: number;
        supplierUnitUsd: number;
        shippingUsd: number;
        importTaxUsd: number;
      };
      profitabilityMarketplaceCurrency: {
        listingSalePrice: number;
        netProfit: number;
        totalCost: number;
        marketplaceFee: number;
        paymentFee: number;
        listingFee: number;
        finalValueFee: number;
        taxes: number;
      };
      feeLedger: {
        marketplaceFeeModel: string;
        totalKnownCost: number;
        projectedProfit: number;
        projectedMargin: number;
        completenessState: string;
        blockedByFinancialIncompleteness: boolean;
        blockingReasons: string[];
      };
    }
  | {
      ok: false;
      source: 'preventive_economics_core';
      listingSalePriceUsd: number;
      failureReasons: string[];
    };

export function mlcCanonicalPricingFromEconomicsCore(
  listingSalePriceUsd: number,
  econ: PreventiveEconomicsCoreSuccess | PreventiveEconomicsCoreFailure
): MlcCanonicalPricingAssessment {
  if (econ.ok === false) {
    return {
      ok: false,
      source: 'preventive_economics_core',
      listingSalePriceUsd,
      failureReasons: [econ.message],
    };
  }
  const { profitability, feeLedger, shipCountry } = econ;
  return {
    ok: true,
    source: 'preventive_economics_core',
    listingSalePriceUsd,
    shipCountry,
    listingCurrency: profitability.listingCurrency,
    profitabilityUsd: {
      netProfitUsd: profitability.netProfitUsd,
      marginRatio: profitability.marginRatio,
      totalCostUsd: profitability.totalCostUsd,
      supplierUnitUsd: profitability.supplierUnitUsd,
      shippingUsd: profitability.shippingUsd,
      importTaxUsd: profitability.importTaxUsd,
    },
    profitabilityMarketplaceCurrency: {
      listingSalePrice: profitability.listingSalePriceMarketplaceCurrency,
      netProfit: profitability.netProfitMarketplaceCurrency,
      totalCost: profitability.totalCostMarketplaceCurrency,
      marketplaceFee: profitability.marketplaceFeeMarketplaceCurrency,
      paymentFee: profitability.paymentFeeMarketplaceCurrency,
      listingFee: profitability.listingFeeMarketplaceCurrency,
      finalValueFee: profitability.finalValueFeeMarketplaceCurrency,
      taxes: profitability.taxesMarketplaceCurrency,
    },
    feeLedger: {
      marketplaceFeeModel: feeLedger.marketplaceFeeModel,
      totalKnownCost: feeLedger.totalKnownCost,
      projectedProfit: feeLedger.projectedProfit,
      projectedMargin: feeLedger.projectedMargin,
      completenessState: feeLedger.completenessState,
      blockedByFinancialIncompleteness: feeLedger.blockedByFinancialIncompleteness,
      blockingReasons: feeLedger.blockingReasons,
    },
  };
}

export async function assessMlcCanonicalListingPrice(
  params: AssertProductValidForPublishingParams
): Promise<MlcCanonicalPricingAssessment> {
  const listingSalePriceUsd = params.listingSalePrice;
  const econ = await runPreventiveEconomicsCore(params);
  return mlcCanonicalPricingFromEconomicsCore(listingSalePriceUsd, econ);
}
