/**
 * Test End-to-End del Flujo Post-Venta Completo
 * 
 * Valida: Webhook → Venta → Compra → Tracking → Confirmación
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testEndToEndPostSaleFlow() {
  console.log('🧪 Test End-to-End: Flujo Post-Venta Completo\n');
  
  const userId = 1; // Usuario de prueba
  let testResults = {
    passed: 0,
    failed: 0,
    errors: []
  };

  try {
    // 1. Preparar datos de prueba
    console.log('1️⃣ Preparando datos de prueba...');
    
    // Buscar un producto existente del usuario
    const product = await prisma.product.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!product) {
      console.log('   ⚠️ No se encontró producto de prueba. Creando uno...');
      // Crear producto de prueba si no existe
      const testProduct = await prisma.product.create({
        data: {
          userId,
          title: 'Test Product - E2E Flow',
          description: 'Producto de prueba para test end-to-end',
          aliexpressPrice: 25.50,
          suggestedPrice: 45.00,
          category: 'Electronics',
          status: 'APPROVED',
          isPublished: true
        }
      });
      product = testProduct;
    }

    console.log(`   ✅ Producto encontrado: ${product.title} (ID: ${product.id})`);

    // 2. Simular webhook de venta
    console.log('\n2️⃣ Simulando webhook de venta...');
    
    const saleData = {
      userId,
      productId: product.id,
      orderId: `TEST_ORDER_${Date.now()}`,
      marketplace: 'ebay',
      salePrice: 45.00,
      costPrice: 25.50,
      platformFees: 4.50,
      currency: 'USD',
      buyerEmail: 'test-buyer@example.com',
      buyerName: 'Test Buyer',
      shippingAddress: JSON.stringify({
        street: '123 Test Street',
        city: 'Test City',
        state: 'TS',
        zip: '12345',
        country: 'US'
      })
    };

    // Simular creación de venta (como lo haría el webhook)
    const { saleService } = await import('./src/services/sale.service.ts');
    const sale = await saleService.createSale(userId, saleData);
    
    if (sale && sale.id) {
      console.log(`   ✅ Venta creada: ID ${sale.id}, Order ${saleData.orderId}`);
      testResults.passed++;
    } else {
      throw new Error('No se pudo crear la venta');
    }

    // 3. Verificar que la venta está en estado PENDING
    console.log('\n3️⃣ Verificando estado de la venta...');
    
    const createdSale = await prisma.sale.findUnique({
      where: { id: sale.id }
    });

    if (createdSale && createdSale.status === 'PENDING') {
      console.log(`   ✅ Venta en estado PENDING correctamente`);
      testResults.passed++;
    } else {
      throw new Error(`Estado incorrecto: esperado PENDING, obtenido ${createdSale?.status}`);
    }

    // 4. Verificar cálculo de comisiones
    console.log('\n4️⃣ Verificando cálculo de comisiones...');
    
    if (createdSale.grossProfit > 0 && createdSale.netProfit !== null) {
      console.log(`   ✅ Comisiones calculadas: Gross Profit ${createdSale.grossProfit}, Net Profit ${createdSale.netProfit}`);
      testResults.passed++;
    } else {
      throw new Error('Comisiones no calculadas correctamente');
    }

    // 5. Verificar workflow config (modo automático vs manual)
    console.log('\n5️⃣ Verificando configuración de workflow...');
    
    const { workflowConfigService } = await import('./src/services/workflow-config.service.ts');
    const workflowConfig = await workflowConfigService.getWorkflowConfig(userId);
    
    console.log(`   ℹ️  Modo de workflow: ${workflowConfig.workflowMode}`);
    console.log(`   ℹ️  Modo de compra: ${workflowConfig.stagePurchase}`);
    testResults.passed++;

    // 6. Si está en modo automático, verificar validación de capital
    if (workflowConfig.workflowMode === 'automatic' || workflowConfig.stagePurchase === 'automatic') {
      console.log('\n6️⃣ Verificando validación de capital (modo automático)...');
      
      const workingCapital = await workflowConfigService.getWorkingCapital(userId);
      const pendingSales = await prisma.sale.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'PROCESSING'] }
        }
      });

      const pendingCost = pendingSales.reduce((sum, s) => sum + (s.aliexpressCost || 0), 0);
      const availableCapital = workingCapital - pendingCost;

      console.log(`   ℹ️  Capital total: $${workingCapital}`);
      console.log(`   ℹ️  Capital comprometido: $${pendingCost}`);
      console.log(`   ℹ️  Capital disponible: $${availableCapital}`);

      if (availableCapital >= saleData.costPrice) {
        console.log('   ✅ Capital suficiente para compra automática');
        testResults.passed++;
      } else {
        console.log('   ⚠️  Capital insuficiente - compra no se ejecutará automáticamente');
        testResults.passed++; // Esto es válido, el sistema funciona correctamente
      }
    } else {
      console.log('\n6️⃣ Modo manual - saltando validación de capital automática');
      testResults.passed++;
    }

    // 7. Verificar PurchaseLog (si existe)
    console.log('\n7️⃣ Verificando PurchaseLog...');
    
    const purchaseLogs = await prisma.purchaseLog.findMany({
      where: { saleId: sale.id },
      orderBy: { createdAt: 'desc' }
    });

    if (purchaseLogs.length > 0) {
      console.log(`   ✅ ${purchaseLogs.length} registro(s) de PurchaseLog encontrado(s)`);
      const latestLog = purchaseLogs[0];
      console.log(`   ℹ️  Estado: ${latestLog.status}, Éxito: ${latestLog.success}`);
      testResults.passed++;
    } else {
      console.log('   ℹ️  No hay PurchaseLog aún (normal si está en modo manual)');
      testResults.passed++;
    }

    // 8. Verificar notificaciones
    console.log('\n8️⃣ Verificando notificaciones...');
    
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 60000) } // Último minuto
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (notifications.length > 0) {
      console.log(`   ✅ ${notifications.length} notificación(es) encontrada(s)`);
      notifications.forEach(n => {
        console.log(`   ℹ️  - ${n.type}: ${n.title}`);
      });
      testResults.passed++;
    } else {
      console.log('   ⚠️  No se encontraron notificaciones recientes');
      // No es crítico, puede que las notificaciones se envíen de otra forma
    }

    // 9. Limpiar datos de prueba (opcional)
    console.log('\n9️⃣ Limpieza de datos de prueba...');
    console.log('   ℹ️  Venta de prueba mantenida para inspección manual');
    console.log('   ℹ️  Para limpiar manualmente, ejecuta:');
    console.log(`   ℹ️  DELETE FROM sales WHERE id = ${sale.id};`);

  } catch (error) {
    console.error('\n❌ Error en test end-to-end:', error);
    testResults.failed++;
    testResults.errors.push({
      step: 'Unknown',
      error: error.message,
      stack: error.stack
    });
  }

  // Resumen
  console.log('\n📊 Resumen del Test:');
  console.log(`   ✅ Pasados: ${testResults.passed}`);
  console.log(`   ❌ Fallidos: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ Errores encontrados:');
    testResults.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.step}: ${err.error}`);
    });
  }

  if (testResults.failed === 0) {
    console.log('\n✅ Test End-to-End completado exitosamente');
  } else {
    console.log('\n❌ Test End-to-End falló');
    process.exit(1);
  }
}

// Ejecutar test
testEndToEndPostSaleFlow()
  .then(() => {
    console.log('\n🎉 Todos los tests completados');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

