/**
 * Script para verificar y corregir la tabla meeting_rooms
 * Ejecuta la migración si la tabla no existe
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function checkAndFixMeetingRoom() {
  try {
    console.log('🔍 Verificando si la tabla meeting_rooms existe...');

    // Intentar hacer una consulta simple para verificar si la tabla existe
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'meeting_rooms'
      );
    ` as Array<{ exists: boolean }>;

    const tableExists = result[0]?.exists || false;

    if (tableExists) {
      console.log('✅ La tabla meeting_rooms ya existe.');
      
      // Verificar que tenga las columnas correctas
      const columns = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'meeting_rooms'
        ORDER BY ordinal_position;
      ` as Array<{ column_name: string }>;

      console.log('📋 Columnas encontradas:', columns.map(c => c.column_name).join(', '));
      
      await prisma.$disconnect();
      return;
    }

    console.log('❌ La tabla meeting_rooms NO existe.');
    console.log('🔧 Ejecutando migración...');

    // Leer el archivo de migración
    const migrationPath = join(
      __dirname,
      '../prisma/migrations/20250127130000_add_meeting_room/migration.sql'
    );

    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Dividir el SQL en comandos individuales y ejecutarlos uno por uno
    // Remover comentarios de línea
    const sqlWithoutComments = migrationSQL
      .split('\n')
      .map(line => {
        const commentIndex = line.indexOf('--');
        if (commentIndex >= 0) {
          return line.substring(0, commentIndex);
        }
        return line;
      })
      .join('\n');

    // Dividir por punto y coma, pero mantener comandos completos
    const commands = sqlWithoutComments
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => {
        // Filtrar líneas vacías y comentarios
        const cleaned = cmd.replace(/\s+/g, ' ').trim();
        return cleaned.length > 0 && 
               !cleaned.startsWith('--') && 
               cleaned !== 'IF NOT EXISTS';
      });

    console.log(`📝 Ejecutando ${commands.length} comandos SQL...`);

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.length > 0) {
        try {
          // Agregar punto y coma al final si no lo tiene
          const sqlCommand = command.endsWith(';') ? command : command + ';';
          await prisma.$executeRawUnsafe(sqlCommand);
          console.log(`  ✅ Comando ${i + 1}/${commands.length} ejecutado`);
        } catch (error: any) {
          // Ignorar errores de "ya existe" para índices y constraints
          if (error.message.includes('already exists') || 
              error.message.includes('duplicate') ||
              error.message.includes('IF NOT EXISTS')) {
            console.log(`  ⚠️  Comando ${i + 1}/${commands.length} ya existe (ignorado)`);
          } else {
            console.error(`  ❌ Error en comando ${i + 1}:`, command.substring(0, 100));
            throw error;
          }
        }
      }
    }

    console.log('✅ Migración ejecutada correctamente.');
    console.log('✅ La tabla meeting_rooms ha sido creada.');

  } catch (error: any) {
    console.error('❌ Error al verificar/corregir la tabla:', error.message);
    
    if (error.message.includes('does not exist') || 
        error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log('\n💡 Solución:');
      console.log('   1. Asegúrate de que DATABASE_URL esté configurado correctamente');
      console.log('   2. Ejecuta: npx prisma migrate deploy');
      console.log('   3. O ejecuta manualmente el SQL de la migración en tu base de datos');
    }
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkAndFixMeetingRoom()
  .then(() => {
    console.log('\n✅ Proceso completado exitosamente.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Proceso falló:', error);
    process.exit(1);
  });

