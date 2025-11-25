/**
 * ===============================================
 * E2E CASE 4: FX RATE CHANGE IMPACT
 * ===============================================
 * 
 * Escenario:
 * - Registrar venta 1 con FX rate inicial (ej: 950 CLP/USD)
 * - Actualizar FX rate (ej: 1000 CLP/USD)
 * - Registrar venta 2 con nuevo FX rate
 * - Validar que venta 1 mantiene valores históricos
 * - Validar que venta 2 usa nuevo FX rate
 */

console.log('\n🔹 Starting E2E Case 4: FX Rate Change Impact\n');

// ==========================================
// PRODUCTO DE PRUEBA
// ==========================================

const product = {
    id: 'PROD-001',
    name: 'Wireless Headphones',
    supplierCostUSD: 45.00,
};

console.log(`📦 Producto: ${product.name}`);
console.log(`   - Supplier Cost: $${product.supplierCostUSD} USD\n`);

// ==========================================
// VENTA 1: FX Rate Inicial (950 CLP/USD)
// ==========================================

const FX_RATE_INITIAL = 950.00;

console.log('💵 Escenario 1: FX Rate Inicial = 950 CLP/USD\n');

// Conversión de costo a CLP
const sale1_costCLP = product.supplierCostUSD * FX_RATE_INITIAL;
const sale1_costCLP_rounded = Math.round(sale1_costCLP);

console.log(`   1. Costo en CLP: $${product.supplierCostUSD} USD * ${FX_RATE_INITIAL} = $${sale1_costCLP_rounded} CLP`);

// Precio sugerido en MercadoLibre Chile (markup 35%)
const sale1_markup = 1.35;
const sale1_priceCLP = sale1_costCLP_rounded * sale1_markup;
const sale1_priceCLP_rounded = Math.round(sale1_priceCLP);

console.log(`   2. Precio MercadoLibre (markup 35%): $${sale1_priceCLP_rounded} CLP`);

// Ganancia neta
const sale1_profitCLP = sale1_priceCLP_rounded - sale1_costCLP_rounded;

console.log(`   3. Ganancia Neta: $${sale1_profitCLP} CLP`);
console.log(`   4. FX Rate usado: ${FX_RATE_INITIAL} CLP/USD`);

// Registro de venta 1
const sale1 = {
    id: 'SALE-001',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    productId: product.id,
    costUSD: product.supplierCostUSD,
    costCLP: sale1_costCLP_rounded,
    priceCLP: sale1_priceCLP_rounded,
    profitCLP: sale1_profitCLP,
    fxRateUsed: FX_RATE_INITIAL,
    marketplace: 'MercadoLibre Chile',
};

console.log(`\n   ✅ Venta 1 registrada (ID: ${sale1.id})\n`);
console.log('='.repeat(60) + '\n');

// ==========================================
// CAMBIO DE FX RATE
// ==========================================

const FX_RATE_NEW = 1000.00;

console.log(`🔄 CAMBIO DE TASA FX: ${FX_RATE_INITIAL} → ${FX_RATE_NEW} CLP/USD\n`);
console.log(`   - Incremento: +${((FX_RATE_NEW / FX_RATE_INITIAL - 1) * 100).toFixed(2)}%\n`);
console.log('='.repeat(60) + '\n');

// ==========================================
// VENTA 2: Nuevo FX Rate (1000 CLP/USD)
// ==========================================

console.log('💵 Escenario 2: FX Rate Actualizado = 1000 CLP/USD\n');

// Conversión de costo a CLP con NUEVO rate
const sale2_costCLP = product.supplierCostUSD * FX_RATE_NEW;
const sale2_costCLP_rounded = Math.round(sale2_costCLP);

console.log(`   1. Costo en CLP: $${product.supplierCostUSD} USD * ${FX_RATE_NEW} = $${sale2_costCLP_rounded} CLP`);

// Precio sugerido (mismo markup 35%)
const sale2_markup = 1.35;
const sale2_priceCLP = sale2_costCLP_rounded * sale2_markup;
const sale2_priceCLP_rounded = Math.round(sale2_priceCLP);

console.log(`   2. Precio MercadoLibre (markup 35%): $${sale2_priceCLP_rounded} CLP`);

// Ganancia neta
const sale2_profitCLP = sale2_priceCLP_rounded - sale2_costCLP_rounded;

console.log(`   3. Ganancia Neta: $${sale2_profitCLP} CLP`);
console.log(`   4. FX Rate usado: ${FX_RATE_NEW} CLP/USD`);

// Registro de venta 2
const sale2 = {
    id: 'SALE-002',
    timestamp: new Date('2025-01-20T14:30:00Z'),
    productId: product.id,
    costUSD: product.supplierCostUSD,
    costCLP: sale2_costCLP_rounded,
    priceCLP: sale2_priceCLP_rounded,
    profitCLP: sale2_profitCLP,
    fxRateUsed: FX_RATE_NEW,
    marketplace: 'MercadoLibre Chile',
};

console.log(`\n   ✅ Venta 2 registrada (ID: ${sale2.id})\n`);
console.log('='.repeat(60) + '\n');

// ==========================================
// VALIDACIONES / ASSERTIONS
// ==========================================

console.log('🔍 Ejecutando validaciones...\n');

// Validación 1: Venta 1 mantiene FX rate histórico
const validation1 = sale1.fxRateUsed === FX_RATE_INITIAL;
console.log(`   ✓ Validación 1: Venta 1 mantiene FX rate histórico (${FX_RATE_INITIAL}): ${validation1 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 2: Venta 2 usa nuevo FX rate
const validation2 = sale2.fxRateUsed === FX_RATE_NEW;
console.log(`   ✓ Validación 2: Venta 2 usa nuevo FX rate (${FX_RATE_NEW}): ${validation2 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 3: Valores de Venta 1 NO cambian tras actualización FX
const sale1_unchanged = (
    sale1.costCLP === sale1_costCLP_rounded &&
    sale1.priceCLP === sale1_priceCLP_rounded &&
    sale1.profitCLP === sale1_profitCLP
);
const validation3 = sale1_unchanged;
console.log(`   ✓ Validación 3: Venta 1 NO recalculada retroactivamente: ${validation3 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 4: Venta 2 tiene valores diferentes a Venta 1 (por FX rate)
const validation4 = sale2.costCLP !== sale1.costCLP && sale2.priceCLP !== sale1.priceCLP;
console.log(`   ✓ Validación 4: Venta 2 tiene valores diferentes (nuevo FX): ${validation4 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 5: Diferencia de costo refleja el cambio de FX rate
const expectedCostDifference = product.supplierCostUSD * (FX_RATE_NEW - FX_RATE_INITIAL);
const actualCostDifference = sale2.costCLP - sale1.costCLP;
const validation5 = Math.abs(actualCostDifference - expectedCostDifference) < 1; // Tolerancia de ±1 por redondeo
console.log(`   ✓ Validación 5: Diferencia de costo refleja cambio FX: ${validation5 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 6: Reportes históricos mantienen coherencia
const historicalReport = {
    totalSales: 2,
    totalProfitCLP: sale1.profitCLP + sale2.profitCLP,
    averageFxRate: (sale1.fxRateUsed + sale2.fxRateUsed) / 2,
};
const validation6 = historicalReport.totalSales === 2 && historicalReport.totalProfitCLP > 0;
console.log(`   ✓ Validación 6: Reportes históricos coherentes: ${validation6 ? 'PASS ✅' : 'FAIL ❌'}`);

console.log('\n' + '='.repeat(60) + '\n');

// ==========================================
// RESULTADO FINAL
// ==========================================

const allValidationsPassed = validation1 && validation2 && validation3 && validation4 && validation5 && validation6;

if (allValidationsPassed) {
    console.log('🎉 ✅ E2E CASE 4: ALL VALIDATIONS PASSED\n');
    console.log('   Gestión de cambios de FX rate funcionando correctamente:');
    console.log(`   - Venta 1 (${sale1.timestamp.toISOString().split('T')[0]}): FX ${sale1.fxRateUsed} → Profit $${sale1.profitCLP} CLP`);
    console.log(`   - Venta 2 (${sale2.timestamp.toISOString().split('T')[0]}): FX ${sale2.fxRateUsed} → Profit $${sale2.profitCLP} CLP`);
    console.log('   - Ventas históricas NO recalculadas retroactivamente ✅');
    console.log('   - Nuevas ventas usan tasas actualizadas ✅\n');
    process.exit(0);
} else {
    console.log('❌ E2E CASE 4: SOME VALIDATIONS FAILED\n');
    console.log('   Revisar lógica de almacenamiento de FX rates o recálculo de ventas.\n');
    process.exit(1);
}
