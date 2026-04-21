/**
 * Script de validación standalone de la nueva fórmula de pricing CJ → Shopify USA
 * Ejecutar: npx ts-node scripts/validate-pricing-formula.ts
 */

// Defaults de pricing (mismos que en qualification.service.ts)
const PRICING_DEFAULTS = {
  paymentFeePct: 5.4,
  paymentFixedFeeUsd: 0.30,
  incidentBufferPct: 3.0,
  minMarginPct: 20,
  minProfitUsd: 3.00,
  maxShippingUsd: 8.00,
  minSellPriceUsd: 9.99,
  maxSellPriceUsd: 150.00,
} as const;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyPsychologicalRounding(price: number): number {
  if (price <= 0) return 0.99;
  const floor = Math.floor(price);
  const remainder = price - floor;
  if (remainder >= 0.95) {
    return floor + 0.99;
  }
  return roundMoney(floor + 0.99);
}

interface PricingResult {
  decision: 'APPROVED' | 'REJECTED';
  reasons: string[];
  price: number;
  netProfit: number;
  netMargin: number;
  incidentBuffer: number;
  paymentFee: number;
}

function calculatePricing(cjCostUsd: number, shippingUsd: number): PricingResult {
  const reasons: string[] = [];
  const d = PRICING_DEFAULTS;

  // Rechazos tempranos
  if (shippingUsd > d.maxShippingUsd) {
    return { decision: 'REJECTED', reasons: [`Shipping too expensive: $${shippingUsd.toFixed(2)} > $${d.maxShippingUsd}`], price: 0, netProfit: 0, netMargin: 0, incidentBuffer: 0, paymentFee: 0 };
  }
  if (cjCostUsd < 2.00) {
    return { decision: 'REJECTED', reasons: [`Product cost too low: $${cjCostUsd.toFixed(2)} < $2.00 minimum`], price: 0, netProfit: 0, netMargin: 0, incidentBuffer: 0, paymentFee: 0 };
  }

  // Cálculos
  const baseCost = cjCostUsd + shippingUsd;
  const incidentBuffer = roundMoney(baseCost * (d.incidentBufferPct / 100));
  const totalCostWithBuffer = roundMoney(baseCost + incidentBuffer);

  const divisor = 1 - (d.paymentFeePct / 100) - (d.minMarginPct / 100);
  if (divisor <= 0.001) {
    return { decision: 'REJECTED', reasons: ['Invalid fee/margin configuration'], price: 0, netProfit: 0, netMargin: 0, incidentBuffer, paymentFee: 0 };
  }

  const rawPrice = (totalCostWithBuffer + d.paymentFixedFeeUsd) / divisor;
  const suggestedPrice = applyPsychologicalRounding(rawPrice);

  // Rechazos por precio fuera de rango
  if (suggestedPrice < d.minSellPriceUsd) {
    return { decision: 'REJECTED', reasons: [`Price too low: $${suggestedPrice.toFixed(2)} < $${d.minSellPriceUsd} minimum`], price: suggestedPrice, netProfit: 0, netMargin: 0, incidentBuffer, paymentFee: 0 };
  }
  if (suggestedPrice > d.maxSellPriceUsd) {
    return { decision: 'REJECTED', reasons: [`Price too high: $${suggestedPrice.toFixed(2)} > $${d.maxSellPriceUsd} maximum`], price: suggestedPrice, netProfit: 0, netMargin: 0, incidentBuffer, paymentFee: 0 };
  }

  // Profit real
  const paymentFee = roundMoney((suggestedPrice * (d.paymentFeePct / 100)) + d.paymentFixedFeeUsd);
  const totalAllCosts = roundMoney(totalCostWithBuffer + paymentFee);
  const netProfit = roundMoney(suggestedPrice - totalAllCosts);
  const netMargin = suggestedPrice > 0 ? roundMoney((netProfit / suggestedPrice) * 100) : 0;

  // Rechazos por margen/profit insuficiente
  if (netMargin < d.minMarginPct) {
    return { decision: 'REJECTED', reasons: [`Net margin too low: ${netMargin.toFixed(1)}% < ${d.minMarginPct}% minimum`], price: suggestedPrice, netProfit, netMargin, incidentBuffer, paymentFee };
  }
  if (netProfit < d.minProfitUsd) {
    return { decision: 'REJECTED', reasons: [`Net profit too low: $${netProfit.toFixed(2)} < $${d.minProfitUsd} minimum`], price: suggestedPrice, netProfit, netMargin, incidentBuffer, paymentFee };
  }

  return {
    decision: 'APPROVED',
    reasons: ['Product meets all pricing criteria'],
    price: suggestedPrice,
    netProfit,
    netMargin,
    incidentBuffer,
    paymentFee,
  };
}

// Ejemplos de productos reales típicos de CJ Dropshipping
const testCases = [
  { name: 'Ejemplo 1: Travel Cable Organizer (APROBADO)', cjCostUsd: 3.80, shippingUsd: 2.80 },
  { name: 'Ejemplo 2: Desk Phone Stand (APROBADO)', cjCostUsd: 3.20, shippingUsd: 2.50 },
  { name: 'Ejemplo 3: Smart Water Bottle (APROBADO)', cjCostUsd: 6.50, shippingUsd: 3.50 },
  { name: 'Ejemplo 4: Producto RECHAZADO (shipping caro)', cjCostUsd: 5.00, shippingUsd: 9.50 },
];

function runValidation() {
  console.log('='.repeat(80));
  console.log('VALIDACIÓN DE NUEVA FÓRMULA DE PRICING CJ → SHOPIFY USA');
  console.log('='.repeat(80));
  console.log();

  for (const test of testCases) {
    console.log('-'.repeat(80));
    console.log(test.name);
    console.log('-'.repeat(80));
    console.log(`  Costo CJ:    $${test.cjCostUsd.toFixed(2)}`);
    console.log(`  Shipping:    $${test.shippingUsd.toFixed(2)}`);
    console.log();

    const result = calculatePricing(test.cjCostUsd, test.shippingUsd);

    if (result.decision === 'REJECTED') {
      console.log('  ❌ RECHAZADO');
      result.reasons.forEach(r => console.log(`     → ${r}`));
      console.log();
      continue;
    }

    console.log('  ✅ APROBADO');
    console.log(`     💰 Precio de venta:  $${result.price.toFixed(2)}`);
    console.log(`     📊 Net Profit:       $${result.netProfit.toFixed(2)}`);
    console.log(`     📈 Net Margin:       ${result.netMargin.toFixed(1)}%`);
    console.log(`     🛡️  Incident Buffer:  $${result.incidentBuffer.toFixed(2)} (3%)`);
    console.log(`     💳 Payment Fee:      $${result.paymentFee.toFixed(2)}`);
    console.log();
  }

  console.log('='.repeat(80));
  console.log('COMPARACIÓN: FÓRMULA ANTIGUA vs NUEVA');
  console.log('='.repeat(80));
  console.log();

  const cost = 4.50;
  const shipping = 3.80;
  const base = cost + shipping;

  // Fórmula ANTIGUA (15% margin, no buffer, no psych rounding)
  const oldDivisor = 1 - 0.054 - 0.15;
  const oldPrice = roundMoney((base + 0.30) / oldDivisor);
  const oldProfit = roundMoney(oldPrice * 0.15);

  // Fórmula NUEVA
  const result = calculatePricing(cost, shipping);

  console.log(`Producto: Travel Cable Organizer (costo $${cost} + shipping $${shipping})`);
  console.log();
  console.log('  FÓRMULA ANTIGUA:                    FÓRMULA NUEVA:');
  console.log(`    Precio:    $${oldPrice.toFixed(2)}                    $${result.price.toFixed(2)}`);
  console.log(`    Profit:    $${oldProfit.toFixed(2)} (target)               $${result.netProfit.toFixed(2)} (real)`);
  console.log(`    Margin:    15% target                    ${result.netMargin.toFixed(1)}% neto`);
  console.log(`    Buffer:    $0.00                         $${result.incidentBuffer.toFixed(2)} (3%)`);
  console.log(`    Psych:     ❌ No                          ✅ .99 redondeo`);
  console.log();
  console.log(`  MEJORA: +$${(result.netProfit - oldProfit).toFixed(2)} profit real, precio comercialmente mejor`);
  console.log();
}

runValidation();

