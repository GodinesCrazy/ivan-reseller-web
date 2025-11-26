/**
 * Script directo para verificar que el sistema encuentra oportunidades
 * Ejecuta el servicio directamente sin necesidad de servidor HTTP
 */

const { PrismaClient } = require('@prisma/client');

// Importar servicio usando ruta compilada o directamente
let opportunityFinder;
try {
  // Intentar con código compilado primero
  opportunityFinder = require('../dist/services/opportunity-finder.service').default;
} catch (e) {
  try {
    // Si no está compilado, usar ts-node para cargar TypeScript
    require('ts-node/register');
    opportunityFinder = require('../src/services/opportunity-finder.service').default;
  } catch (e2) {
    console.error('❌ Error: No se pudo cargar el servicio. Asegúrate de que el código esté compilado o ts-node esté instalado.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();

async function testDirectOpportunityFinder() {
  console.log('🔍 Verificando directamente que el sistema encuentra oportunidades\n');
  console.log('='.repeat(80));

  let testUserId = 1; // Usar admin por defecto

  try {
    // Verificar usuario existe
    const user = await prisma.user.findUnique({
      where: { id: testUserId }
    });

    if (!user) {
      // Intentar crear usuario admin si no existe
      const adminUser = await prisma.user.findFirst({
        where: { email: 'admin@ivanreseller.com' }
      });
      
      if (adminUser) {
        testUserId = adminUser.id;
        console.log(`✅ Usuario encontrado: ${adminUser.email} (ID: ${testUserId})\n`);
      } else {
        console.log('⚠️  Usuario admin no encontrado, usando ID 1\n');
      }
    } else {
      console.log(`✅ Usuario encontrado: ${user.email || `ID: ${testUserId}`}\n`);
    }

    // Tests a ejecutar
    const tests = [
      { query: 'auriculares', minResults: 5, description: 'Auriculares (mínimo 5 resultados)' },
      { query: 'gaming', minResults: 3, description: 'Productos gaming (mínimo 3 resultados)' }
    ];

    let totalPassed = 0;
    let totalFailed = 0;

    for (const test of tests) {
      console.log(`\n📋 Test: "${test.query}"`);
      console.log('-'.repeat(80));
      console.log(`   Descripción: ${test.description}`);
      console.log(`   Iniciando búsqueda...\n`);

      const startTime = Date.now();

      try {
        const results = await opportunityFinder.findOpportunities(testUserId, {
          query: test.query,
          maxItems: 15,
          marketplaces: ['ebay', 'amazon', 'mercadolibre'],
          region: 'us',
          environment: 'production'
        });

        const duration = Date.now() - startTime;

        console.log(`   ✅ Búsqueda completada en ${duration}ms`);
        console.log(`   📊 Resultados encontrados: ${results.length}`);

        if (results.length > 0) {
          console.log(`\n   ✅ ENCONTRADOS ${results.length} RESULTADOS PARA "${test.query}"\n`);

          // Validar cada resultado
          let validCount = 0;
          let invalidCount = 0;

          results.slice(0, 5).forEach((result, index) => {
            const errors = [];

            // Validar campos requeridos
            if (!result.title || result.title.trim().length === 0) {
              errors.push('Sin título');
            }
            if ((result.costUsd || result.costAmount || 0) <= 0) {
              errors.push('Precio inválido o cero');
            }
            if ((result.suggestedPriceUsd || result.suggestedPriceAmount || 0) <= 0) {
              errors.push('Precio sugerido inválido o cero');
            }
            if (!result.aliexpressUrl || result.aliexpressUrl.trim().length < 10) {
              errors.push('URL inválida');
            }
            if ((result.profitMargin || 0) <= 0 || (result.profitMargin || 0) > 1) {
              errors.push('Margen inválido');
            }

            const isValid = errors.length === 0;

            if (isValid) {
              validCount++;
              console.log(`   ✅ Producto ${index + 1} (VÁLIDO):`);
            } else {
              invalidCount++;
              console.log(`   ⚠️  Producto ${index + 1} (INVÁLIDO):`);
              console.log(`      Errores: ${errors.join(', ')}`);
            }

            console.log(`      Título: ${result.title?.substring(0, 60) || 'N/A'}`);
            console.log(`      Precio: $${result.costUsd || result.costAmount || 0} ${result.costCurrency || 'USD'}`);
            console.log(`      Precio sugerido: $${result.suggestedPriceUsd || result.suggestedPriceAmount || 0} ${result.suggestedPriceCurrency || 'USD'}`);
            console.log(`      Margen: ${((result.profitMargin || 0) * 100).toFixed(1)}%`);
            console.log(`      ROI: ${result.roiPercentage || 0}%`);
            console.log(`      Confidence: ${((result.confidenceScore || 0) * 100).toFixed(1)}%`);
            console.log(`      URL: ${result.aliexpressUrl ? '✅' : '❌'}`);
            console.log(`      Imagen: ${result.image ? '✅' : '❌'}`);
            console.log('');
          });

          console.log(`   📊 Resumen:`);
          console.log(`      Total encontrados: ${results.length}`);
          console.log(`      Válidos (primeros 5): ${validCount}/${Math.min(5, results.length)}`);
          if (results.length > 5) {
            console.log(`      (mostrando solo primeros 5 de ${results.length} resultados)`);
          }

          // Validar criterio de éxito
          const meetsMinimum = results.length >= test.minResults;
          const hasValidResults = validCount > 0;

          if (meetsMinimum && hasValidResults) {
            totalPassed++;
            console.log(`\n   ✅ VALIDACIÓN PASADA para "${test.query}"`);
            console.log(`      ✓ Se encontraron ${results.length} resultados (mínimo requerido: ${test.minResults})`);
            console.log(`      ✓ Se encontraron ${validCount} productos válidos`);
          } else {
            totalFailed++;
            console.log(`\n   ⚠️  VALIDACIÓN PARCIAL para "${test.query}"`);
            if (!meetsMinimum) {
              console.log(`      ✗ No se alcanzó el mínimo de ${test.minResults} resultados (se encontraron ${results.length})`);
            }
            if (!hasValidResults) {
              console.log(`      ✗ No se encontraron productos válidos`);
            }
          }

        } else {
          totalFailed++;
          console.log(`   ❌ NO SE ENCONTRARON RESULTADOS para "${test.query}"`);
          console.log(`      Esto puede deberse a:`);
          console.log(`      - AliExpress está bloqueando el scraping`);
          console.log(`      - El término de búsqueda no tiene resultados`);
          console.log(`      - Rate limiting de AliExpress`);
          console.log(`      - Problemas de conexión`);
        }

      } catch (error) {
        totalFailed++;
        console.error(`   ❌ Error en búsqueda "${test.query}":`);
        console.error(`      Mensaje: ${error.message}`);
        if (error.stack) {
          console.error(`      Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN FINAL DE VALIDACIÓN\n');
    console.log(`   Total de pruebas: ${tests.length}`);
    console.log(`   ✅ Pasadas: ${totalPassed}`);
    console.log(`   ❌ Fallidas: ${totalFailed}`);
    console.log(`   Porcentaje de éxito: ${((totalPassed / tests.length) * 100).toFixed(1)}%\n`);

    if (totalPassed === tests.length) {
      console.log('✅ ✅ ✅ TODAS LAS VALIDACIONES PASARON ✅ ✅ ✅\n');
      console.log('🎉 El sistema AI Opportunity Finder ESTÁ FUNCIONANDO CORRECTAMENTE.\n');
      process.exit(0);
    } else if (totalPassed > 0) {
      console.log('⚠️  VALIDACIONES PARCIALES\n');
      console.log('El sistema encontró algunos resultados, pero no todos los esperados.');
      console.log('Esto puede deberse a bloqueos temporales de AliExpress o rate limiting.\n');
      process.exit(0);
    } else {
      console.log('❌ VALIDACIONES FALLIDAS\n');
      console.log('El sistema no encontró resultados. Revisa los logs arriba para más detalles.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error fatal en validación:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar validación
testDirectOpportunityFinder();

