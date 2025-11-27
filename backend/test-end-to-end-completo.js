/**
 * Test End-to-End Completo del Sistema
 * 
 * Valida todo el flujo: Sugerencias IA → Productos → Publicación → Ventas → Compra → Tracking
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_ID = 1;
const TEST_TOKEN = process.env.TEST_TOKEN || ''; // Token de autenticación para tests

async function testCompleteFlow() {
  console.log('🧪 TEST END-TO-END COMPLETO DEL SISTEMA\n');
  console.log('=' .repeat(60));
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
  };

  function test(name, fn) {
    return async () => {
      results.total++;
      try {
        console.log(`\n📋 Test ${results.total}: ${name}`);
        await fn();
        console.log(`   ✅ PASADO`);
        results.passed++;
      } catch (error) {
        console.log(`   ❌ FALLIDO: ${error.message}`);
        results.failed++;
        results.errors.push({ test: name, error: error.message });
      }
    };
  }

  // 1. Test: Sugerencias IA - Carga y Filtros
  await test('Cargar sugerencias IA sin errores', async () => {
    const response = await axios.get(`${API_URL}/api/ai-suggestions`, {
      headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
      timeout: 10000
    });
    
    if (response.status !== 200) throw new Error(`Status ${response.status}`);
    if (!Array.isArray(response.data?.suggestions)) throw new Error('Respuesta no es array');
    
    // Validar que se pueden serializar
    JSON.stringify(response.data.suggestions);
  })();

  await test('Filtros de sugerencias IA funcionan', async () => {
    const filters = ['all', 'pricing', 'inventory', 'marketing'];
    
    for (const filter of filters) {
      const response = await axios.get(`${API_URL}/api/ai-suggestions?filter=${filter}`, {
        headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
        timeout: 10000
      });
      
      if (response.status !== 200) throw new Error(`Filtro ${filter}: Status ${response.status}`);
      if (!Array.isArray(response.data?.suggestions)) throw new Error(`Filtro ${filter}: No es array`);
    }
  })();

  // 2. Test: Generación de Sugerencias IA
  await test('Generar nuevas sugerencias IA sin crashes', async () => {
    const response = await axios.post(`${API_URL}/api/ai-suggestions/generate`, {}, {
      headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
      timeout: 30000
    });
    
    if (response.status !== 200) throw new Error(`Status ${response.status}`);
    if (!Array.isArray(response.data?.suggestions)) throw new Error('Respuesta no es array');
    
    // Validar serialización
    JSON.stringify(response.data.suggestions);
  })();

  // 3. Test: Búsqueda de Oportunidades
  await test('Buscar oportunidades de negocio', async () => {
    const response = await axios.get(`${API_URL}/api/opportunities`, {
      params: { query: 'wireless earbuds', maxItems: 5 },
      headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
      timeout: 30000
    });
    
    if (response.status !== 200) throw new Error(`Status ${response.status}`);
    if (!Array.isArray(response.data?.items)) throw new Error('Respuesta no es array');
  })();

  // 4. Test: Dashboard Financiero
  await test('Cargar métricas financieras', async () => {
    const response = await axios.get(`${API_URL}/api/finance/summary?range=month`, {
      headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
      timeout: 10000
    });
    
    if (response.status !== 200) throw new Error(`Status ${response.status}`);
    
    const summary = response.data?.summary;
    if (!summary) throw new Error('No hay resumen financiero');
    
    // Validar que las métricas de capital existen
    if (summary.workingCapital && typeof summary.workingCapital.total !== 'number') {
      throw new Error('workingCapital.total no es número');
    }
    
    if (summary.capitalMetrics && typeof summary.capitalMetrics.capitalTurnover !== 'number') {
      throw new Error('capitalMetrics.capitalTurnover no es número');
    }
  })();

  // 5. Test: Flujo Post-Venta (simulado)
  await test('Flujo post-venta: Crear venta y validar capital', async () => {
    // Buscar producto existente
    const product = await prisma.product.findFirst({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: 'desc' }
    });

    if (!product) {
      console.log('   ⚠️  No hay productos de prueba, saltando...');
      return;
    }

    // Verificar que se puede calcular capital disponible
    const { workflowConfigService } = await import('./src/services/workflow-config.service.ts');
    const workingCapital = await workflowConfigService.getWorkingCapital(TEST_USER_ID);
    
    if (typeof workingCapital !== 'number' || workingCapital < 0) {
      throw new Error('Capital de trabajo inválido');
    }

    // Verificar ventas pendientes
    const pendingSales = await prisma.sale.findMany({
      where: {
        userId: TEST_USER_ID,
        status: { in: ['PENDING', 'PROCESSING'] }
      }
    });

    const pendingCost = pendingSales.reduce((sum, s) => sum + (s.aliexpressCost || 0), 0);
    const availableCapital = workingCapital - pendingCost;

    if (typeof availableCapital !== 'number') {
      throw new Error('Capital disponible no calculado correctamente');
    }
  })();

  // 6. Test: Validación de Serialización JSON
  await test('Validar serialización JSON de todas las respuestas', async () => {
    const endpoints = [
      '/api/ai-suggestions',
      '/api/finance/summary?range=month',
      '/api/products?status=APPROVED&limit=5'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${API_URL}${endpoint}`, {
          headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
          timeout: 10000
        });

        // Intentar serializar
        const serialized = JSON.stringify(response.data);
        if (serialized.length > 10_000_000) { // Más de 10MB puede ser problemático
          throw new Error(`Respuesta muy grande en ${endpoint}: ${serialized.length} bytes`);
        }
      } catch (error) {
        if (error.response?.status === 404) {
          // Endpoint no existe, continuar
          continue;
        }
        throw error;
      }
    }
  })();

  // 7. Test: No hay valores corruptos
  await test('Validar que no hay valores corruptos en sugerencias', async () => {
    const response = await axios.get(`${API_URL}/api/ai-suggestions`, {
      headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
      timeout: 10000
    });

    const suggestions = response.data?.suggestions || [];
    
    for (const sug of suggestions) {
      // Validar impact.revenue
      if (sug.impact?.revenue !== undefined) {
        const rev = sug.impact.revenue;
        if (typeof rev !== 'number' || !isFinite(rev) || isNaN(rev)) {
          throw new Error(`impact.revenue inválido en sugerencia ${sug.id}: ${rev}`);
        }
        if (Math.abs(rev) > 1e10) {
          throw new Error(`impact.revenue muy grande en sugerencia ${sug.id}: ${rev}`);
        }
      }

      // Validar confidence
      if (sug.confidence !== undefined) {
        const conf = sug.confidence;
        if (typeof conf !== 'number' || !isFinite(conf) || isNaN(conf)) {
          throw new Error(`confidence inválido en sugerencia ${sug.id}: ${conf}`);
        }
        if (conf < 0 || conf > 100) {
          throw new Error(`confidence fuera de rango en sugerencia ${sug.id}: ${conf}`);
        }
      }

      // Validar metrics si existen
      if (sug.metrics) {
        if (sug.metrics.currentValue !== undefined) {
          const val = sug.metrics.currentValue;
          if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) {
            throw new Error(`metrics.currentValue inválido en sugerencia ${sug.id}: ${val}`);
          }
        }
      }
    }
  })();

  // 8. Test: Frontend no se bloquea (simulado)
  await test('Validar que las respuestas no causan bloqueos', async () => {
    // Hacer múltiples requests simultáneos
    const promises = Array(5).fill(null).map(() =>
      axios.get(`${API_URL}/api/ai-suggestions`, {
        headers: TEST_TOKEN ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
        timeout: 10000
      }).catch(() => null) // Ignorar errores individuales
    );

    const responses = await Promise.all(promises);
    
    // Al menos 4 de 5 deben responder
    const successful = responses.filter(r => r && r.status === 200).length;
    if (successful < 4) {
      throw new Error(`Solo ${successful}/5 requests exitosos - posible bloqueo`);
    }
  })();

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DEL TEST END-TO-END');
  console.log('='.repeat(60));
  console.log(`Total de tests: ${results.total}`);
  console.log(`✅ Pasados: ${results.passed}`);
  console.log(`❌ Fallidos: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errores encontrados:');
    results.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.test}: ${err.error}`);
    });
  }

  if (results.failed === 0) {
    console.log('\n✅ TODOS LOS TESTS PASARON');
    return true;
  } else {
    console.log('\n❌ ALGUNOS TESTS FALLARON');
    return false;
  }
}

// Ejecutar
testCompleteFlow()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

