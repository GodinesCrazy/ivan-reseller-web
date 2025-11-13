/**
 * Script para agregar la columna 'plan' a la tabla users en producción
 * 
 * Uso:
 * 1. Asegúrate de tener DATABASE_URL configurada
 * 2. Ejecuta: npx tsx scripts/add-plan-column.ts
 */

import '../src/config/env';
import { prisma } from '../src/config/database';

async function addPlanColumn() {
  try {
    console.log('🔍 Verificando si la columna plan existe...');
    
    // Verificar si la columna existe
    const checkColumn = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'plan'
    `;

    if (checkColumn.length > 0) {
      console.log('✅ La columna plan ya existe en la tabla users');
      return;
    }

    console.log('📝 Agregando columna plan a la tabla users...');
    
    // Agregar columna plan
    await prisma.$executeRaw`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'FREE' NOT NULL
    `;

    console.log('✅ Columna plan agregada exitosamente');

    // Actualizar usuarios existentes basándose en su rol
    console.log('🔄 Actualizando planes de usuarios existentes...');
    
    await prisma.$executeRaw`
      UPDATE users 
      SET plan = 'ADMIN' 
      WHERE role = 'ADMIN' AND plan = 'FREE'
    `;

    console.log('✅ Planes actualizados');
    console.log('');
    console.log('📋 Resumen:');
    console.log('   - Columna plan agregada con valor por defecto: FREE');
    console.log('   - Usuarios ADMIN actualizados a plan: ADMIN');
    console.log('   - Otros usuarios mantienen plan: FREE');

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

addPlanColumn();

