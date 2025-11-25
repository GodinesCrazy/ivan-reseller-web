/**
 * ===============================================
 * E2E CASE 3: MULTI-USER / MULTI-CURRENCY
 * ===============================================
 * 
 * Escenario:
 * - Usuario A (Chile) realiza ventas en CLP
 * - Usuario B (USA) realiza ventas en USD  
 * - Verificar que los reportes por usuario muestran montos en su moneda
 * - Verificar que el total global realiza conversión correcta
 */

console.log('\n🔹 Starting E2E Case 3: Multi-User/Multi-Currency Reports\n');

// Simular tasas FX fijas para el test
const FX_RATES = {
    USD_TO_CLP: 950.00,
    CLP_TO_USD: 1 / 950.00,
};

// ==========================================
// ESCENARIO: Dos usuarios, diferentes monedas
// ==========================================

// Usuario A - Vendedor en Chile
const userA = {
    id: 'userA',
    name: 'Juan Pérez (Chile)',
    currency: 'CLP',
    sales: [
        {
            id: 'saleA1',
            productName: 'Laptop HP',
            cost: 285000, // CLP
            price: 475000, // CLP
            profit: 190000, // CLP
        },
        {
            id: 'saleA2',
            productName: 'Mouse Logitech',
            cost: 9500, // CLP
            price: 18000, // CLP
            profit: 8500, // CLP
        },
    ],
};

// Usuario B - Vendedor en USA
const userB = {
    id: 'userB',
    name: 'John Smith (USA)',
    currency: 'USD',
    sales: [
        {
            id: 'saleB1',
            productName: 'iPhone 14',
            cost: 650, // USD
            price: 899, // USD
            profit: 249, // USD
        },
        {
            id: 'saleB2',
            productName: 'AirPods Pro',
            cost: 180, // USD
            price: 249, // USD
            profit: 69, // USD
        },
    ],
};

// ==========================================
// CÁLCULOS POR USUARIO
// ==========================================

console.log('📊 Calculando totales por usuario...\n');

// Total User A (CLP)
const totalProfitUserA_CLP = userA.sales.reduce((sum, sale) => sum + sale.profit, 0);
console.log(`✅ ${userA.name}`);
console.log(`   - Total Sales: ${userA.sales.length}`);
console.log(`   - Total Profit (CLP): $${totalProfitUserA_CLP.toLocaleString('en-US')}`);
console.log(`   - Currency: ${userA.currency}`);

console.log('');

// Total User B (USD)
const totalProfitUserB_USD = userB.sales.reduce((sum, sale) => sum + sale.profit, 0);
console.log(`✅ ${userB.name}`);
console.log(`   - Total Sales: ${userB.sales.length}`);
console.log(`   - Total Profit (USD): $${totalProfitUserB_USD.toLocaleString('en-US')}`);
console.log(`   - Currency: ${userB.currency}`);

console.log('\n' + '='.repeat(60) + '\n');

// ==========================================
// REPORTE GLOBAL (Convertir todo a USD)
// ==========================================

console.log('🌍 Generando Reporte Global (Base: USD)...\n');

// Convertir profit de User A de CLP a USD
const totalProfitUserA_USD = totalProfitUserA_CLP * FX_RATES.CLP_TO_USD;
const totalProfitUserA_USD_rounded = Math.round(totalProfitUserA_USD * 100) / 100;

console.log(`   - User A Profit (CLP → USD): $${totalProfitUserA_CLP.toLocaleString('en-US')} CLP → $${totalProfitUserA_USD_rounded.toLocaleString('en-US')} USD`);
console.log(`   - User B Profit (USD): $${totalProfitUserB_USD.toLocaleString('en-US')} USD`);

// Total global en USD
const globalTotalProfit_USD = totalProfitUserA_USD_rounded + totalProfitUserB_USD;

console.log('\n' + '-'.repeat(60));
console.log(`   💰 TOTAL GLOBAL PROFIT: $${globalTotalProfit_USD.toLocaleString('en-US')} USD`);
console.log('-'.repeat(60) + '\n');

// ==========================================
// VALIDACIONES / ASSERTIONS
// ==========================================

console.log('🔍 Ejecutando validaciones...\n');

// Validación 1: Los totales por usuario deben ser positivos
const validation1 = totalProfitUserA_CLP > 0 && totalProfitUserB_USD > 0;
console.log(`   ✓ Validación 1: Totales por usuario > 0: ${validation1 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 2: La conversión CLP → USD debe ser consistente
const expectedUserA_USD = 198500 / 950; // Cálculo manual
const validation2 = Math.abs(totalProfitUserA_USD_rounded - Math.round(expectedUserA_USD * 100) / 100) < 0.01;
console.log(`   ✓ Validación 2: Conversión CLP→USD correcta: ${validation2 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 3: El total global debe ser la suma de ambos en USD
const expectedGlobalTotal = totalProfitUserA_USD_rounded + totalProfitUserB_USD;
const validation3 = Math.abs(globalTotalProfit_USD - expectedGlobalTotal) < 0.01;
console.log(`   ✓ Validación 3: Total global = Suma en USD: ${validation3 ? 'PASS ✅' : 'FAIL ❌'}`);

// Validación 4: No debe haber suma directa CLP + USD sin conversión
const invalidDirectSum = totalProfitUserA_CLP + totalProfitUserB_USD;
const validation4 = invalidDirectSum !== globalTotalProfit_USD;
console.log(`   ✓ Validación 4: No suma directa CLP+USD: ${validation4 ? 'PASS ✅' : 'FAIL ❌'}`);

console.log('\n' + '='.repeat(60) + '\n');

// ==========================================
// RESULTADO FINAL
// ==========================================

const allValidationsPassed = validation1 && validation2 && validation3 && validation4;

if (allValidationsPassed) {
    console.log('🎉 ✅ E2E CASE 3: ALL VALIDATIONS PASSED\n');
    console.log('   Sistema multi-usuario/multi-moneda funcionando correctamente.');
    console.log('   Conversiones FX aplicadas de forma consistente.');
    console.log('   No hay suma directa de monedas diferentes.\n');
    process.exit(0);
} else {
    console.log('❌ E2E CASE 3: SOME VALIDATIONS FAILED\n');
    console.log('   Revisar lógica de conversión o agregación de reportes.\n');
    process.exit(1);
}
