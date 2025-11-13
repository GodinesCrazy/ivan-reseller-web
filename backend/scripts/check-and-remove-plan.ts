/**
 * Script para verificar y eliminar la columna 'plan' si existe
 */

import '../src/config/env';
import { prisma } from '../src/config/database';

async function checkAndRemove() {
  try {
    console.log('🔍 Verificando estructura de la tabla users...');
    
    // Obtener todas las columnas de la tabla users
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY column_name
    `;

    console.log(`\n📋 Columnas encontradas en la tabla users (${columns.length} total):`);
    columns.forEach(col => {
      const hasPlan = col.column_name === 'plan';
      console.log(`   ${hasPlan ? '⚠️  ' : '   '}${col.column_name}${hasPlan ? ' (ESTA COLUMNA DEBE ELIMINARSE)' : ''}`);
    });

    const planColumn = columns.find(col => col.column_name === 'plan');
    
    if (planColumn) {
      console.log('\n📝 La columna plan SÍ existe. Eliminándola...');
      await prisma.$executeRaw`ALTER TABLE users DROP COLUMN IF EXISTS plan`;
      console.log('✅ Columna plan eliminada exitosamente');
    } else {
      console.log('\n✅ La columna plan NO existe. No es necesario eliminarla.');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndRemove();

