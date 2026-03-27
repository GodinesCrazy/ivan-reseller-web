export interface MlChileLandedCostResult {
  costCurrency: string;
  importTaxMethod: 'cl_vat_19_product_plus_shipping_low_value';
  shippingCost: number;
  importTaxAmount: number;
  totalCost: number;
  landedCostCompleteness: 'complete' | 'incomplete';
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateMlChileLandedCost(params: {
  productCost: number;
  shippingCost: number;
  currency?: string;
}): MlChileLandedCostResult {
  const productCost = Number(params.productCost);
  const shippingCost = Number(params.shippingCost);
  const costCurrency = String(params.currency || 'USD').trim().toUpperCase() || 'USD';
  const complete = Number.isFinite(productCost) && productCost >= 0 && Number.isFinite(shippingCost) && shippingCost >= 0;

  if (!complete) {
    return {
      costCurrency,
      importTaxMethod: 'cl_vat_19_product_plus_shipping_low_value',
      shippingCost: Number.isFinite(shippingCost) ? roundCurrency(shippingCost) : 0,
      importTaxAmount: 0,
      totalCost: 0,
      landedCostCompleteness: 'incomplete',
    };
  }

  const importTaxAmount = roundCurrency((productCost + shippingCost) * 0.19);
  return {
    costCurrency,
    importTaxMethod: 'cl_vat_19_product_plus_shipping_low_value',
    shippingCost: roundCurrency(shippingCost),
    importTaxAmount,
    totalCost: roundCurrency(productCost + shippingCost + importTaxAmount),
    landedCostCompleteness: 'complete',
  };
}
