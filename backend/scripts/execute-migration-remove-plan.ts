/**
 * Script para ejecutar la migración que elimina la columna 'plan' de la tabla users
 * 
 * Uso:
 * 1. Asegúrate de tener DATABASE_URL configurada (puede ser de Railway)
 * 2. Ejecuta: npx tsx scripts/execute-migration-remove-plan.ts
 */

import '../src/config/env';
import { prisma } from '../src/config/database';
import { readFileSync } from 'fs';
import { join } from 'path';

async function executeMigration() {
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
      console.log('   La migración ya fue aplicada o la columna nunca existió.');
      return;
    }

    console.log('📝 Ejecutando migración para eliminar columna plan...');
    
    // Leer el archivo de migración
    const migrationPath = join(__dirname, '../prisma/migrations/20251113_remove_plan_column/migration.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    console.log('   SQL a ejecutar:');
    console.log('   ' + migrationSQL.trim());
    console.log('');
    
    // Ejecutar la migración
    await prisma.$executeRawUnsafe(migrationSQL);
    
    console.log('✅ Migración ejecutada exitosamente');
    console.log('   La columna plan ha sido eliminada de la tabla users');

  } catch (error: any) {
    console.error('❌ Error ejecutando migración:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    if (error.meta) {
      console.error(`   Meta:`, error.meta);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

executeMigration();

