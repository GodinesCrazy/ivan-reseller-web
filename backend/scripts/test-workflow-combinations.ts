/**
 * Script de prueba para verificar todas las combinaciones de workflow
 * 
 * Prueba:
 * - Sandbox/Production
 * - Manual/Automatic/Hybrid
 * - Modos individuales por etapa (manual/automatic/guided)
 */

import { PrismaClient } from '@prisma/client';
import { workflowConfigService } from '../src/services/workflow-config.service';
import { resolveEnvironment } from '../src/utils/environment-resolver';

const prisma = new PrismaClient();

interface TestResult {
  combination: string;
  environment: 'sandbox' | 'production';
  workflowMode: 'manual' | 'automatic' | 'hybrid';
  stageConfigs: Record<string, 'manual' | 'automatic' | 'guided'>;
  effectiveModes: Record<string, 'manual' | 'automatic' | 'guided'>;
  status: 'PASS' | 'FAIL' | 'WARNING';
  issues: string[];
}

const stages = ['scrape', 'analyze', 'publish', 'purchase', 'fulfillment', 'customerService'] as const;

async function testWorkflowCombination(
  userId: number,
  environment: 'sandbox' | 'production',
  workflowMode: 'manual' | 'automatic' | 'hybrid',
  stageConfigs: Record<string, 'manual' | 'automatic' | 'guided'>
): Promise<TestResult> {
  console.log(`\n🧪 Testing: ${workflowMode} / ${environment}`);
  console.log(`   Stage configs:`, stageConfigs);

  // Actualizar configuración
  await workflowConfigService.updateUserConfig(userId, {
    environment,
    workflowMode,
    stageScrape: stageConfigs.scrape,
    stageAnalyze: stageConfigs.analyze,
    stagePublish: stageConfigs.publish,
    stagePurchase: stageConfigs.purchase,
    stageFulfillment: stageConfigs.fulfillment,
    stageCustomerService: stageConfigs.customerService || 'manual'
  });

  // Obtener modos efectivos
  const effectiveModes: Record<string, 'manual' | 'automatic' | 'guided'> = {};
  const issues: string[] = [];

  for (const stage of stages) {
    const effectiveMode = await workflowConfigService.getStageMode(userId, stage);
    effectiveModes[stage] = effectiveMode;

    // Verificar consistencia
    if (workflowMode === 'manual' && effectiveMode !== 'manual') {
      issues.push(`Stage ${stage}: expected 'manual' but got '${effectiveMode}'`);
    } else if (workflowMode === 'automatic' && effectiveMode !== 'automatic') {
      issues.push(`Stage ${stage}: expected 'automatic' but got '${effectiveMode}'`);
    } else if (workflowMode === 'hybrid' && effectiveMode !== stageConfigs[stage]) {
      issues.push(`Stage ${stage}: expected '${stageConfigs[stage]}' (hybrid mode) but got '${effectiveMode}'`);
    }
  }

  // Verificar resolución de environment
  const resolvedEnv = await resolveEnvironment({
    userId,
    default: 'production'
  });

  if (resolvedEnv !== environment) {
    issues.push(`Environment mismatch: expected '${environment}' but resolved to '${resolvedEnv}'`);
  }

  // Validar configuración
  const validation = await workflowConfigService.validateConfig(userId);
  if (!validation.valid) {
    issues.push(...validation.errors);
  }
  if (validation.warnings.length > 0) {
    issues.push(...validation.warnings.map(w => `WARNING: ${w}`));
  }

  const status: 'PASS' | 'FAIL' | 'WARNING' = 
    issues.some(i => i.startsWith('Stage') || i.includes('mismatch') || i.startsWith('ERROR')) 
      ? 'FAIL' 
      : issues.length > 0 
        ? 'WARNING' 
        : 'PASS';

  return {
    combination: `${workflowMode}-${environment}`,
    environment,
    workflowMode,
    stageConfigs,
    effectiveModes,
    status,
    issues
  };
}

async function runTests() {
  console.log('🚀 Iniciando pruebas de combinaciones de workflow...\n');

  // Crear usuario de prueba (o usar uno existente)
  let testUser = await prisma.user.findFirst({
    where: { username: 'workflow_test_user' }
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        username: 'workflow_test_user',
        email: 'workflow_test@example.com',
        password: 'test_password_hash',
        role: 'USER'
      }
    });

    // Crear configuración inicial
    await workflowConfigService.getUserConfig(testUser.id);
  }

  const userId = testUser.id;
  console.log(`📋 Usando usuario de prueba: ${userId} (${testUser.username})`);

  const results: TestResult[] = [];

  // Test 1: Manual + Sandbox
  results.push(await testWorkflowCombination(
    userId,
    'sandbox',
    'manual',
    {
      scrape: 'automatic', // Será ignorado (override a manual)
      analyze: 'guided',
      publish: 'automatic',
      purchase: 'guided',
      fulfillment: 'automatic',
      customerService: 'guided'
    }
  ));

  // Test 2: Manual + Production
  results.push(await testWorkflowCombination(
    userId,
    'production',
    'manual',
    {
      scrape: 'automatic',
      analyze: 'guided',
      publish: 'automatic',
      purchase: 'guided',
      fulfillment: 'automatic',
      customerService: 'guided'
    }
  ));

  // Test 3: Automatic + Sandbox
  results.push(await testWorkflowCombination(
    userId,
    'sandbox',
    'automatic',
    {
      scrape: 'manual', // Será ignorado (override a automatic)
      analyze: 'guided',
      publish: 'manual',
      purchase: 'manual',
      fulfillment: 'guided',
      customerService: 'manual'
    }
  ));

  // Test 4: Automatic + Production
  results.push(await testWorkflowCombination(
    userId,
    'production',
    'automatic',
    {
      scrape: 'manual',
      analyze: 'guided',
      publish: 'manual',
      purchase: 'manual',
      fulfillment: 'guided',
      customerService: 'manual'
    }
  ));

  // Test 5: Hybrid + Sandbox (con configuraciones mixtas)
  results.push(await testWorkflowCombination(
    userId,
    'sandbox',
    'hybrid',
    {
      scrape: 'automatic',
      analyze: 'guided',
      publish: 'manual',
      purchase: 'guided',
      fulfillment: 'automatic',
      customerService: 'manual'
    }
  ));

  // Test 6: Hybrid + Production (con configuraciones mixtas)
  results.push(await testWorkflowCombination(
    userId,
    'production',
    'hybrid',
    {
      scrape: 'automatic',
      analyze: 'guided',
      publish: 'manual',
      purchase: 'guided',
      fulfillment: 'automatic',
      customerService: 'manual'
    }
  ));

  // Test 7: Hybrid + Sandbox (todos manual)
  results.push(await testWorkflowCombination(
    userId,
    'sandbox',
    'hybrid',
    {
      scrape: 'manual',
      analyze: 'manual',
      publish: 'manual',
      purchase: 'manual',
      fulfillment: 'manual',
      customerService: 'manual'
    }
  ));

  // Test 8: Hybrid + Production (todos automatic)
  results.push(await testWorkflowCombination(
    userId,
    'production',
    'hybrid',
    {
      scrape: 'automatic',
      analyze: 'automatic',
      publish: 'automatic',
      purchase: 'automatic',
      fulfillment: 'automatic',
      customerService: 'automatic'
    }
  ));

  // Mostrar resultados
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTADOS DE PRUEBAS');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.status === 'PASS').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\n✅ PASS: ${passed}`);
  console.log(`⚠️  WARNING: ${warnings}`);
  console.log(`❌ FAIL: ${failed}`);

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
    console.log(`\n${icon} ${result.combination} (${result.workflowMode} / ${result.environment})`);
    
    if (result.status !== 'PASS') {
      console.log('   Issues:');
      for (const issue of result.issues) {
        console.log(`     - ${issue}`);
      }
    } else {
      console.log('   ✅ All checks passed');
    }

    console.log('   Effective modes:');
    for (const stage of stages) {
      const config = result.stageConfigs[stage];
      const effective = result.effectiveModes[stage];
      const match = (result.workflowMode === 'hybrid' && config === effective) || 
                    (result.workflowMode === 'manual' && effective === 'manual') ||
                    (result.workflowMode === 'automatic' && effective === 'automatic');
      console.log(`     ${stage}: ${config} → ${effective} ${match ? '✅' : '❌'}`);
    }
  }

  // Resumen final
  console.log('\n' + '='.repeat(80));
  if (failed === 0 && warnings === 0) {
    console.log('🎉 ¡Todas las pruebas pasaron exitosamente!');
  } else if (failed === 0) {
    console.log('⚠️  Todas las pruebas pasaron con advertencias menores');
  } else {
    console.log('❌ Algunas pruebas fallaron. Revisar los resultados arriba.');
    process.exit(1);
  }
  console.log('='.repeat(80));
}

// Ejecutar pruebas
runTests()
  .catch((error) => {
    console.error('❌ Error ejecutando pruebas:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

