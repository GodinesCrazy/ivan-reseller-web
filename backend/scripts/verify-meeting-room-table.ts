/**
 * Script para verificar si la tabla meeting_rooms existe en la base de datos
 * 
 * Uso:
 * npx tsx backend/scripts/verify-meeting-room-table.ts
 */

import '../src/config/env';
import { prisma } from '../src/config/database';

async function verifyMeetingRoomTable() {
  try {
    console.log('🔍 Verificando si la tabla meeting_rooms existe...\n');

    // Verificar si la tabla existe
    const tableExists = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'meeting_rooms'
    `;

    if (tableExists.length === 0) {
      console.log('❌ La tabla meeting_rooms NO existe en la base de datos');
      console.log('\n📝 Necesitas ejecutar la migración manualmente:');
      console.log('   1. Ejecuta el SQL de la migración:');
      console.log('      backend/prisma/migrations/20250127130000_add_meeting_room/migration.sql');
      console.log('\n   2. O ejecuta:');
      console.log('      cd backend');
      console.log('      npx prisma db push');
      console.log('\n   3. O marca la migración como aplicada si ya la ejecutaste:');
      console.log('      npx prisma migrate resolve --applied 20250127130000_add_meeting_room');
      return;
    }

    console.log('✅ La tabla meeting_rooms existe');

    // Verificar estructura de la tabla
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'meeting_rooms'
      ORDER BY ordinal_position
    `;

    console.log('\n📊 Estructura de la tabla:');
    columns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
    });

    // Verificar índices
    const indexes = await prisma.$queryRaw<Array<{
      indexname: string;
      indexdef: string;
    }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'meeting_rooms'
    `;

    console.log('\n🔑 Índices encontrados:');
    indexes.forEach(idx => {
      console.log(`   - ${idx.indexname}`);
    });

    // Verificar foreign keys
    const foreignKeys = await prisma.$queryRaw<Array<{
      constraint_name: string;
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>>`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'meeting_rooms'
    `;

    console.log('\n🔗 Foreign Keys encontradas:');
    foreignKeys.forEach(fk => {
      console.log(`   - ${fk.constraint_name}: ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // Verificar si hay datos
    const count = await prisma.meetingRoom.count();
    console.log(`\n📈 Registros en la tabla: ${count}`);

    console.log('\n✅ Todo está correctamente configurado!');
    console.log('   La tabla meeting_rooms está lista para usar.');

  } catch (error: any) {
    console.error('❌ Error verificando la tabla:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMeetingRoomTable();

