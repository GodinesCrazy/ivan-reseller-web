#!/usr/bin/env tsx
/**
 * Test E2E: Ciclo completo de dropshipping (hasta utilidad cuando se incluye post-sale)
 *
 * Llama POST /api/internal/test-full-dropshipping-cycle y valida:
 * - Respuesta HTTP 200 y JSON válido
 * - Estructura completa: success, stageResults/stages (10 etapas con ok/real)
 * - Datos por etapa cuando están presentes (trends.count, pricing.netProfit, sale.orderId, accounting.revenue, etc.)
 * - Cuando post-sale corre: saleCreated con saleId y netProfit (y netProfit numérico)
 *
 * Requiere: INTERNAL_RUN_SECRET (desde .env o env)
 * Requiere: Backend corriendo (por defecto http://localhost:4000)
 * Opcional: VERIFIER_TARGET_URL, keyword, SKIP_POST_SALE=0 para ciclo hasta utilidad
 *
 * Uso:
 *   npm run test-full-dropshipping-cycle
 *   SKIP_POST_SALE=0 npm run test-full-dropshipping-cycle
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
const REQUEST_TIMEOUT_MS = Number(process.env.TEST_FULL_CYCLE_TIMEOUT_MS) || 120_000;

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
] as const;

interface StageResult {
  ok?: boolean;
  real?: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

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

/** Validaciones adicionales por etapa (data shape). No fallan el test, solo reportan. */
function validateStageData(stages: Record<string, StageResult>): { warnings: string[] } {
  const warnings: string[] = [];
  if (stages.trends?.ok && stages.trends.data) {
    const d = stages.trends.data as Record<string, unknown>;
    if (typeof d.count !== 'number' && d.count !== undefined) warnings.push('trends.data.count debería ser number');
  }
  if (stages.aliexpressSearch?.ok && stages.aliexpressSearch.data) {
    const d = stages.aliexpressSearch.data as Record<string, unknown>;
    if (typeof d.count !== 'number' && d.count !== undefined) warnings.push('aliexpressSearch.data.count debería ser number');
  }
  if (stages.pricing?.ok && stages.pricing.data) {
    const d = stages.pricing.data as Record<string, unknown>;
    if (d.netProfit !== undefined && typeof d.netProfit !== 'number') warnings.push('pricing.data.netProfit debería ser number');
  }
  if (stages.sale?.ok && stages.sale.data) {
    const d = stages.sale.data as Record<string, unknown>;
    if (!d.orderId && d.orderId !== undefined) warnings.push('sale.data.orderId debería estar presente cuando sale.ok');
  }
  if (stages.accounting?.ok && stages.accounting.data) {
    const d = stages.accounting.data as Record<string, unknown>;
    if (d.revenue !== undefined && typeof d.revenue !== 'number') warnings.push('accounting.data.revenue debería ser number');
  }
  return { warnings };
}

function printStageReport(stages: Record<string, StageResult>): void {
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
    let dataStr = '';
    if (s.data && typeof s.data === 'object') {
      if (stage === 'trends' && 'count' in s.data) dataStr = ` count=${s.data.count}`;
      else if (stage === 'aliexpressSearch' && 'count' in s.data) dataStr = ` count=${s.data.count}`;
      else if (stage === 'pricing' && 'netProfit' in s.data) dataStr = ` netProfit=${s.data.netProfit}`;
      else if (stage === 'sale' && 'orderId' in s.data) dataStr = ` orderId=${s.data.orderId}`;
      else if (stage === 'accounting' && 'revenue' in s.data) dataStr = ` revenue=${s.data.revenue}`;
    }
    console.log(`  ${stage}: ${okStr} ${realStr}${dataStr}${errStr}`);
  }
}

async function main(): Promise<number> {
  console.log('=== Test E2E: Ciclo de Dropshipping ===');
  console.log(`URL: ${BASE_URL}/api/internal/test-full-dropshipping-cycle`);
  console.log(`Keyword: ${KEYWORD}, skipPostSale: ${SKIP_POST_SALE}, timeout: ${REQUEST_TIMEOUT_MS}ms\n`);

  if (!INTERNAL_SECRET) {
    console.error('❌ INTERNAL_RUN_SECRET no configurado. Añádelo a .env.local');
    return 1;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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

    const stages = (data.stageResults || data.stages) as Record<string, StageResult>;
    printStageReport(stages);

    const { warnings } = validateStageData(stages);
    if (warnings.length > 0) {
      console.log('\n--- Advertencias (data) ---');
      warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    }

    const saleCreated = data.saleCreated as { saleId: number; netProfit: number } | undefined | null;
    if (saleCreated != null && typeof saleCreated.saleId === 'number') {
      console.log('\n--- Utilidad (Sale) ---');
      console.log(`  saleId: ${saleCreated.saleId}, netProfit: ${saleCreated.netProfit}`);
      if (typeof saleCreated.netProfit !== 'number') {
        console.error('❌ saleCreated.netProfit debe ser number');
        return 1;
      }
      if (saleCreated.netProfit < 0 && !SKIP_POST_SALE) {
        console.error(`❌ saleCreated.netProfit no debe ser negativo cuando post-sale corre (got ${saleCreated.netProfit})`);
        return 1;
      }
    }

    const success = data.success === true;
    const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
    if (diagnostics.length > 0) {
      console.log('\n--- Diagnostics ---');
      diagnostics.forEach((d: unknown) => console.log(`  - ${d}`));
    }

    if (success) {
      const postSaleRan = !SKIP_POST_SALE;
      const utilidadOk =
        saleCreated != null &&
        typeof saleCreated.saleId === 'number' &&
        typeof saleCreated.netProfit === 'number';
      if (postSaleRan && !utilidadOk) {
        console.error(
          '\n❌ Test FAILED: post-sale se ejecutó pero la respuesta no incluye utilidad (saleCreated con saleId y netProfit).'
        );
        console.error(
          '   Esperado cuando SKIP_POST_SALE=0: Sale creada tras fulfillment y saleCreated en la respuesta.'
        );
        return 1;
      }
      if (postSaleRan && utilidadOk) {
        console.log('\n✅ Test PASSED: Ciclo completo hasta utilidad (success=true, saleCreated con netProfit)');
      } else {
        console.log('\n✅ Test PASSED: Ciclo de dropshipping completo y correcto (success=true)');
      }
      return 0;
    }

    console.log('\n❌ Test FAILED: success=false. Posibles causas:');
    console.log('   - APIs no configuradas (AliExpress, eBay, PayPal, Trends)');
    console.log('   - Errores en alguna etapa (ver diagnostics arriba)');
    console.log('\n   Usa TEST_STRUCTURE_ONLY=1 para pasar si solo la estructura es válida.');
    return process.env.TEST_STRUCTURE_ONLY === '1' ? 0 : 1;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`❌ Request timeout (${REQUEST_TIMEOUT_MS}ms). El ciclo completo puede tardar varios minutos.`);
      console.error('   Aumenta TEST_FULL_CYCLE_TIMEOUT_MS si es necesario.');
    } else {
      console.error('❌ Request failed:', err instanceof Error ? err.message : err);
    }
    console.error('   Asegúrate de que el backend esté corriendo en', BASE_URL);
    return 1;
  }
}

main().then((code) => process.exit(code));
