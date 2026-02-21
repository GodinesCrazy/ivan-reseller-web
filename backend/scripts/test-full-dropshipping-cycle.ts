#!/usr/bin/env tsx
/**
 * Test: Ciclo completo de dropshipping
 *
 * Llama POST /api/internal/test-full-dropshipping-cycle y valida:
 * - Respuesta HTTP 200
 * - Estructura de stages (trends, aliexpressSearch, pricing, publish, etc.)
 * - success=true cuando todas las APIs están configuradas
 *
 * Requiere: INTERNAL_RUN_SECRET (desde .env o env)
 * Requiere: Backend corriendo (por defecto http://localhost:4000)
 * Opcional: VERIFIER_TARGET_URL para apuntar a otro backend (ej. Railway)
 *
 * Por defecto skipPostSale=true (solo discovery) para poder pasar con trends + AliExpress.
 * SKIP_POST_SALE=0 para ciclo completo (PayPal + compra AliExpress).
 *
 * Uso:
 *   npm run test-full-dropshipping-cycle
 *   npm run test:dropshipping-cycle
 *   keyword=auriculares npm run test-full-dropshipping-cycle
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const BASE_URL = process.env.VERIFIER_TARGET_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;
const SKIP_POST_SALE = process.env.SKIP_POST_SALE === '0' ? false : true;
const KEYWORD = process.env.keyword || 'phone case';

const EXPECTED_STAGES = [
  'trends',
  'aliexpressSearch',
  'pricing',
  'marketplaceCompare',
  'publish',
  'sale',
  'paypalCapture',
  'aliexpressPurchase',
  'tracking',
  'accounting',
];

function validateStructure(data: Record<string, unknown>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof data.success !== 'boolean') {
    errors.push('response.success debe ser boolean');
  }
  const stages = (data.stageResults || data.stages) as Record<string, unknown> | undefined;
  if (!stages || typeof stages !== 'object') {
    errors.push('response debe tener stageResults o stages');
    return { ok: false, errors };
  }
  for (const stage of EXPECTED_STAGES) {
    if (!stages[stage]) {
      errors.push(`falta stage: ${stage}`);
      continue;
    }
    const s = stages[stage] as Record<string, unknown>;
    if (typeof s?.ok !== 'boolean') errors.push(`stage.${stage}.ok debe ser boolean`);
    if (typeof s?.real !== 'boolean') errors.push(`stage.${stage}.real debe ser boolean`);
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

function printStageReport(stages: Record<string, { ok?: boolean; real?: boolean; error?: string }>): void {
  console.log('\n--- Stages ---');
  for (const stage of EXPECTED_STAGES) {
    const s = stages[stage];
    if (!s) {
      console.log(`  ${stage}: (missing)`);
      continue;
    }
    const okStr = s.ok ? '✓' : '✗';
    const realStr = s.real ? '(real)' : '(fallback/skip)';
    const errStr = s.error ? ` - ${s.error}` : '';
    console.log(`  ${stage}: ${okStr} ${realStr}${errStr}`);
  }
}

async function main(): Promise<number> {
  console.log('=== Test: Ciclo de Dropshipping ===');
  console.log(`URL: ${BASE_URL}/api/internal/test-full-dropshipping-cycle`);
  console.log(`Keyword: ${KEYWORD}, skipPostSale: ${SKIP_POST_SALE}\n`);

  if (!INTERNAL_SECRET) {
    console.error('❌ INTERNAL_RUN_SECRET no configurado. Añádelo a .env.local');
    return 1;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/internal/test-full-dropshipping-cycle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        keyword: KEYWORD,
        skipPostSale: SKIP_POST_SALE,
      }),
    });

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      console.error('❌ Respuesta no es JSON válido');
      return 1;
    }

    if (!res.ok) {
      console.error(`❌ HTTP ${res.status}`, data);
      return 1;
    }

    const structureCheck = validateStructure(data);
    if (!structureCheck.ok) {
      console.error('❌ Estructura de respuesta inválida:');
      structureCheck.errors.forEach((e) => console.error(`   - ${e}`));
      return 1;
    }

    const stages = (data.stageResults || data.stages) as Record<string, { ok?: boolean; real?: boolean; error?: string }>;
    printStageReport(stages);

    const success = data.success === true;
    const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
    if (diagnostics.length > 0) {
      console.log('\n--- Diagnostics ---');
      diagnostics.forEach((d: unknown) => console.log(`  - ${d}`));
    }

    if (success) {
      console.log('\n✅ Test PASSED: Ciclo de dropshipping completo y correcto (success=true)');
      return 0;
    }

    console.log('\n❌ Test FAILED: success=false. Posibles causas:');
    console.log('   - APIs no configuradas (AliExpress, eBay, PayPal, Trends)');
    console.log('   - Errores en alguna etapa (ver diagnostics arriba)');
    console.log('\n   Usa TEST_STRUCTURE_ONLY=1 para pasar si solo la estructura es válida.');
    return process.env.TEST_STRUCTURE_ONLY === '1' ? 0 : 1;
  } catch (err: unknown) {
    console.error('❌ Request failed:', err instanceof Error ? err.message : err);
    console.error('   Asegúrate de que el backend esté corriendo en', BASE_URL);
    return 1;
  }
}

main().then((code) => process.exit(code));
