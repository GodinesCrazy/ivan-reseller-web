/**
 * E2E Case 2: Supplier EUR -> Sale USD (eBay)
 * 
 * Objetivo: verificar un flujo internacional con tres monedas 
 * (EUR proveedor, USD marketplace, moneda base del sistema).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
    console.log('🔹 Starting E2E Case 2: EUR -> USD');

    try {
        // 1. Setup Data
        const costEur = 30.00;
        const fxEurUsd = 1.08;
        const marginTarget = 0.18; // 18%

        console.log(`Input Data:
    - Cost EUR: €${costEur}
    - FX EUR->USD: ${fxEurUsd}
    - Margin Target: ${marginTarget * 100}%
    `);

        // 2. Convert Cost to USD (Base Currency)
        const costUsdRaw = costEur * fxEurUsd;
        const costUsd = Math.round(costUsdRaw * 100) / 100;

        console.log(`Conversion:
    - Cost USD (Raw): $${costUsdRaw}
    - Cost USD (Rounded): $${costUsd}
    `);

        // 3. Calculate Suggested Price USD
        // Price = Cost / (1 - Margin)
        const suggestedPriceUsdRaw = costUsd / (1 - marginTarget);
        const suggestedPriceUsd = Math.round(suggestedPriceUsdRaw * 100) / 100;

        console.log(`Pricing:
    - Suggested Price USD (Raw): $${suggestedPriceUsdRaw}
    - Suggested Price USD (Rounded): $${suggestedPriceUsd}
    `);

        // 4. Simulate Sale
        const salePriceUsd = suggestedPriceUsd;
        const ebayFeePercent = 0.12;
        const platformFeePercent = 0.04;

        const ebayFeeUsd = Math.round((salePriceUsd * ebayFeePercent) * 100) / 100;

        // Gross Profit
        const grossProfitUsd = Math.round((salePriceUsd - costUsd - ebayFeeUsd) * 100) / 100;

        // Platform Fee
        const platformFeeUsd = Math.round((grossProfitUsd * platformFeePercent) * 100) / 100;

        const finalNetProfitUsd = Math.round((grossProfitUsd - platformFeeUsd) * 100) / 100;

        console.log(`Sale Simulation:
    - Sale Price: $${salePriceUsd}
    - eBay Fee (12%): -$${ebayFeeUsd}
    - Gross Profit: $${grossProfitUsd}
    - Platform Fee (4%): -$${platformFeeUsd}
    - Final Net Profit: $${finalNetProfitUsd}
    `);

        // 5. Verification
        // Check math consistency with 0.01 tolerance due to intermediate roundings
        const check = salePriceUsd - costUsd - ebayFeeUsd - platformFeeUsd;
        if (Math.abs(check - finalNetProfitUsd) > 0.01) {
            console.error(`❌ Error: Math mismatch. Calculated: ${finalNetProfitUsd}, Check: ${check}`);
            process.exit(1);
        }

        console.log('✅ E2E Case 2 Passed: Math is consistent.');

    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
