/**
 * Script para eliminar la columna 'plan' de la tabla users
 * 
 * Uso:
 * 1. Asegúrate de tener DATABASE_URL configurada
 * 2. Ejecuta: npx tsx scripts/remove-plan-column.ts
 */

import '../src/config/env';
import { prisma } from '../src/config/database';

async function removePlanColumn() {
  try {
    console.log('🔍 Verificando si la columna plan existe...');
    
    // Verificar si la columna existe
    const checkColumn = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'plan'
    `;

    if (checkColumn.length === 0) {
      console.log('✅ La columna plan no existe en la tabla users');
      return;
    }

    console.log('📝 Eliminando columna plan de la tabla users...');
    
    // Eliminar columna plan
    await prisma.$executeRaw`
      ALTER TABLE users DROP COLUMN IF EXISTS plan
    `;

    console.log('✅ Columna plan eliminada exitosamente');

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

removePlanColumn();

