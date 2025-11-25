/**
 * Script de verificación de migración de monedas
 * Verifica que los campos currency y Decimal se hayan creado correctamente
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyMigration() {
  try {
    console.log('🔍 Verificando migración de monedas...\n');

    // Verificar campos currency
    console.log('📋 Verificando campos currency:');
    const currencyFields = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name IN ('products', 'sales', 'commissions', 'admin_commissions')
      AND column_name = 'currency';
    `;
    
    if (currencyFields && currencyFields.length > 0) {
      console.log('✅ Campos currency encontrados:');
      currencyFields.forEach(field => {
        console.log(`   - ${field.table_name || 'N/A'}.${field.column_name}: ${field.data_type} (default: ${field.column_default})`);
      });
    } else {
      console.log('⚠️  No se encontraron campos currency');
    }

    // Verificar campos Decimal
    console.log('\n📋 Verificando campos Decimal:');
    const decimalFields = await prisma.$queryRaw`
      SELECT column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns 
      WHERE table_name IN ('users', 'products', 'sales', 'commissions', 'admin_commissions', 'successful_operations', 'user_workflow_configs', 'competition_snapshots', 'ai_suggestions')
      AND data_type = 'numeric'
      ORDER BY table_name, column_name;
    `;
    
    if (decimalFields && decimalFields.length > 0) {
      console.log(`✅ ${decimalFields.length} campos Decimal encontrados:`);
      const grouped = {};
      decimalFields.forEach(field => {
        const tableName = field.table_name || 'N/A';
        if (!grouped[tableName]) {
          grouped[tableName] = [];
        }
        grouped[tableName].push(field);
      });
      
      Object.entries(grouped).forEach(([table, fields]) => {
        console.log(`   - ${table}:`);
        fields.forEach(field => {
          console.log(`     • ${field.column_name}: DECIMAL(${field.numeric_precision},${field.numeric_scale})`);
        });
      });
    } else {
      console.log('⚠️  No se encontraron campos Decimal');
    }

    // Verificar que podemos crear un producto con currency
    console.log('\n🧪 Probando creación de producto con currency...');
    try {
      const testProduct = await prisma.product.create({
        data: {
          userId: 1,
          title: 'Producto de Prueba - Migración',
          aliexpressUrl: 'https://www.aliexpress.com/item/test.html',
          aliexpressPrice: 10.50,
          suggestedPrice: 21.00,
          finalPrice: 21.00,
          currency: 'CLP', // Probar con CLP
          images: JSON.stringify([]),
          status: 'PENDING',
          isPublished: false,
        },
      });
      
      console.log('✅ Producto creado exitosamente con currency:', {
        id: testProduct.id,
        currency: testProduct.currency,
        aliexpressPrice: testProduct.aliexpressPrice.toString()
      });

      // Eliminar producto de prueba
      await prisma.product.delete({
        where: { id: testProduct.id }
      });
      console.log('✅ Producto de prueba eliminado');
    } catch (error) {
      console.log('❌ Error al crear producto de prueba:', error.message);
      if (error.message.includes('currency')) {
        console.log('⚠️  El campo currency aún no existe en la base de datos');
      }
    }

    console.log('\n✅ Verificación completada');
  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();

