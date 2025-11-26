/**
 * Script para verificar que los nuevos campos de costos existen en la base de datos
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyNewCostFields() {
  try {
    console.log('🔍 Verificando campos de costos en la base de datos...\n');

    // Verificar campos en tabla products
    console.log('📦 Verificando tabla products...');
    const productColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'products'
      AND column_name IN ('shippingCost', 'importTax', 'totalCost', 'targetCountry')
      ORDER BY column_name;
    ` as Array<{ column_name: string; data_type: string; is_nullable: string }>;

    console.log(`   Campos encontrados en products: ${productColumns.length}`);
    productColumns.forEach(col => {
      console.log(`   ✅ ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });

    if (productColumns.length < 4) {
      console.log('\n   ⚠️  Faltan campos en products. Ejecutando migración manual...');
      const productCommands = [
        'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shippingCost" DECIMAL(18,2);',
        'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "importTax" DECIMAL(18,2);',
        'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(18,2);',
        'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "targetCountry" TEXT;'
      ];
      
      for (const cmd of productCommands) {
        try {
          await prisma.$executeRawUnsafe(cmd);
          console.log(`   ✅ Ejecutado: ${cmd.substring(0, 60)}...`);
        } catch (error: any) {
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`   ⚠️  Campo ya existe (ignorado)`);
          } else {
            throw error;
          }
        }
      }
      console.log('   ✅ Campos agregados a products');
    }

    // Verificar campos en tabla opportunities
    console.log('\n📊 Verificando tabla opportunities...');
    const opportunityColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'opportunities'
      AND column_name IN ('shippingCost', 'importTax', 'totalCost', 'targetCountry')
      ORDER BY column_name;
    ` as Array<{ column_name: string; data_type: string; is_nullable: string }>;

    console.log(`   Campos encontrados en opportunities: ${opportunityColumns.length}`);
    opportunityColumns.forEach(col => {
      console.log(`   ✅ ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });

    if (opportunityColumns.length < 4) {
      console.log('\n   ⚠️  Faltan campos en opportunities. Ejecutando migración manual...');
      const opportunityCommands = [
        'ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "shippingCost" DECIMAL(18,2);',
        'ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "importTax" DECIMAL(18,2);',
        'ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(18,2);',
        'ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "targetCountry" TEXT;'
      ];
      
      for (const cmd of opportunityCommands) {
        try {
          await prisma.$executeRawUnsafe(cmd);
          console.log(`   ✅ Ejecutado: ${cmd.substring(0, 60)}...`);
        } catch (error: any) {
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`   ⚠️  Campo ya existe (ignorado)`);
          } else {
            throw error;
          }
        }
      }
      console.log('   ✅ Campos agregados a opportunities');
    }

    console.log('\n✅ Verificación completada exitosamente.');

  } catch (error: any) {
    console.error('❌ Error al verificar campos:', error.message);
    
    if (error.message.includes('does not exist') || 
        error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log('\n💡 Solución:');
      console.log('   1. Asegúrate de que DATABASE_URL esté configurado correctamente');
      console.log('   2. Ejecuta manualmente el SQL de la migración en tu base de datos');
    }
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyNewCostFields()
  .then(() => {
    console.log('\n✅ Proceso completado exitosamente.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Proceso falló:', error);
    process.exit(1);
  });

