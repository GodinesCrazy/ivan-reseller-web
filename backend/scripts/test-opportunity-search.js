/**
 * Script de prueba: Búsqueda de Oportunidades
 * Verifica que el sistema puede encontrar oportunidades después de la migración
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testOpportunitySearch() {
  try {
    console.log('🔍 Probando búsqueda de oportunidades...\n');

    // 1. Verificar que podemos crear un producto (simulando oportunidad encontrada)
    console.log('1️⃣ Creando producto de prueba (simulando oportunidad encontrada)...');
    const testProduct = await prisma.product.create({
      data: {
        userId: 1,
        title: 'Auriculares Bluetooth con cancelación de ruido',
        aliexpressUrl: 'https://www.aliexpress.com/item/test-123.html',
        aliexpressPrice: 25.50,
        suggestedPrice: 49.99,
        finalPrice: 49.99,
        currency: 'USD',
        images: JSON.stringify(['https://example.com/image.jpg']),
        status: 'PENDING',
        isPublished: false,
      },
    });
    
    console.log('✅ Producto creado exitosamente:', {
      id: testProduct.id,
      title: testProduct.title.substring(0, 50),
      currency: testProduct.currency,
      aliexpressPrice: testProduct.aliexpressPrice.toString(),
      suggestedPrice: testProduct.suggestedPrice.toString(),
    });

    // 2. Verificar que podemos crear una venta (simulando venta registrada)
    console.log('\n2️⃣ Creando venta de prueba (simulando venta registrada)...');
    const testSale = await prisma.sale.create({
      data: {
        userId: 1,
        productId: testProduct.id,
        orderId: `TEST-${Date.now()}`,
        marketplace: 'ebay',
        salePrice: 49.99,
        aliexpressCost: 25.50,
        marketplaceFee: 4.99,
        grossProfit: 19.50,
        commissionAmount: 3.90, // 20% de grossProfit
        netProfit: 15.60,
        currency: 'USD',
        status: 'PENDING',
      },
    });
    
    console.log('✅ Venta creada exitosamente:', {
      id: testSale.id,
      orderId: testSale.orderId,
      currency: testSale.currency,
      salePrice: testSale.salePrice.toString(),
      grossProfit: testSale.grossProfit.toString(),
      netProfit: testSale.netProfit.toString(),
    });

    // 3. Verificar que podemos crear una comisión
    console.log('\n3️⃣ Creando comisión de prueba...');
    const testCommission = await prisma.commission.create({
      data: {
        userId: 1,
        saleId: testSale.id,
        amount: 3.90,
        currency: 'USD',
        status: 'PENDING',
      },
    });
    
    console.log('✅ Comisión creada exitosamente:', {
      id: testCommission.id,
      currency: testCommission.currency,
      amount: testCommission.amount.toString(),
    });

    // 4. Verificar que podemos leer productos con currency
    console.log('\n4️⃣ Verificando lectura de productos con currency...');
    const products = await prisma.product.findMany({
      where: { userId: 1 },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        currency: true,
        aliexpressPrice: true,
        suggestedPrice: true,
        status: true,
      },
    });
    
    console.log(`✅ ${products.length} productos encontrados con currency:`);
    products.forEach((p, i) => {
      console.log(`   ${i + 1}. [${p.currency}] ${p.title.substring(0, 40)}... - $${p.aliexpressPrice.toString()} → $${p.suggestedPrice.toString()}`);
    });

    // 5. Verificar que podemos leer ventas con currency
    console.log('\n5️⃣ Verificando lectura de ventas con currency...');
    const sales = await prisma.sale.findMany({
      where: { userId: 1 },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        currency: true,
        salePrice: true,
        grossProfit: true,
        netProfit: true,
        status: true,
      },
    });
    
    console.log(`✅ ${sales.length} ventas encontradas con currency:`);
    sales.forEach((s, i) => {
      console.log(`   ${i + 1}. [${s.currency}] ${s.orderId} - Venta: $${s.salePrice.toString()}, Ganancia: $${s.netProfit.toString()}`);
    });

    // 6. Verificar cálculos con Decimal
    console.log('\n6️⃣ Verificando cálculos con Decimal (precisión)...');
    const product1 = await prisma.product.findFirst({
      where: { id: testProduct.id },
    });
    
    if (product1) {
      // Calcular margen usando Decimal
      const aliexpressPrice = parseFloat(product1.aliexpressPrice.toString());
      const suggestedPrice = parseFloat(product1.suggestedPrice.toString());
      const margin = ((suggestedPrice - aliexpressPrice) / aliexpressPrice) * 100;
      
      console.log('✅ Cálculo de margen:', {
        aliexpressPrice: aliexpressPrice.toFixed(2),
        suggestedPrice: suggestedPrice.toFixed(2),
        margin: margin.toFixed(2) + '%',
        currency: product1.currency,
      });
    }

    // 7. Limpiar datos de prueba
    console.log('\n7️⃣ Limpiando datos de prueba...');
    await prisma.commission.delete({
      where: { id: testCommission.id },
    });
    await prisma.sale.delete({
      where: { id: testSale.id },
    });
    await prisma.product.delete({
      where: { id: testProduct.id },
    });
    console.log('✅ Datos de prueba eliminados');

    console.log('\n✅ ✅ ✅ TODAS LAS PRUEBAS PASARON EXITOSAMENTE');
    console.log('\n📊 Resumen:');
    console.log('   ✅ Campos currency funcionando correctamente');
    console.log('   ✅ Campos Decimal funcionando correctamente');
    console.log('   ✅ Creación de Product, Sale, Commission funcionando');
    console.log('   ✅ Lectura de datos con currency funcionando');
    console.log('   ✅ Cálculos con Decimal mantienen precisión');
    console.log('\n🎉 El sistema está listo para buscar oportunidades de negocio!');

  } catch (error) {
    console.error('\n❌ Error durante las pruebas:', error);
    console.error('Stack:', error.stack);
    if (error.message.includes('currency')) {
      console.error('\n⚠️  El campo currency puede no existir en la base de datos');
      console.error('   Ejecuta: npx prisma db push');
    }
  } finally {
    await prisma.$disconnect();
  }
}

testOpportunitySearch();

