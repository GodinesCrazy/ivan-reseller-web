import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { logger } from '../src/config/logger';

const prisma = new PrismaClient();

async function applyPurchaseLogMigration() {
  logger.info('🔍 Verificando migración de PurchaseLog y campos de comprador en Sale...');

  try {
    // Verificar si la tabla purchase_logs existe
    try {
      await prisma.$queryRaw`SELECT 1 FROM purchase_logs LIMIT 1;`;
      logger.info('✅ La tabla purchase_logs ya existe.');
    } catch (error: any) {
      logger.info('❌ La tabla purchase_logs NO existe. Ejecutando migración...');
      
      const migrationPath = path.join(__dirname, '../prisma/migrations/20250128000000_add_purchase_log_and_sale_buyer_fields/migration.sql');
      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found: ${migrationPath}`);
      }

      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const commands = sql
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

      logger.info(`📝 Ejecutando ${commands.length} comandos SQL...`);
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        if (command.trim().length > 0) {
          try {
            await prisma.$executeRawUnsafe(command);
            logger.info(`  ✅ Comando ${i + 1}/${commands.length} ejecutado`);
          } catch (cmdError: any) {
            // Ignorar errores de "already exists" o "column already exists"
            if (cmdError.message?.includes('already exists') || 
                cmdError.message?.includes('duplicate') ||
                cmdError.message?.includes('column') && cmdError.message?.includes('already')) {
              logger.warn(`  ⚠️  Comando ${i + 1} ya ejecutado (ignorado): ${cmdError.message.substring(0, 100)}`);
            } else {
              throw cmdError;
            }
          }
        }
      }
      logger.info('✅ Migración ejecutada correctamente.');
    }

    // Verificar campos en tabla sales
    try {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'sales';
      `;
      const columnNames = columns.map(c => c.column_name);
      
      const requiredFields = ['buyerEmail', 'buyerName', 'shippingAddress'];
      const missingFields = requiredFields.filter(field => !columnNames.includes(field));
      
      if (missingFields.length > 0) {
        logger.warn(`⚠️  Faltan campos en tabla sales: ${missingFields.join(', ')}`);
        logger.info('📝 Agregando campos faltantes...');
        
        for (const field of missingFields) {
          try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "${field}" TEXT;`);
            logger.info(`  ✅ Campo ${field} agregado`);
          } catch (error: any) {
            if (!error.message?.includes('already exists')) {
              logger.error(`  ❌ Error agregando campo ${field}: ${error.message}`);
            }
          }
        }
      } else {
        logger.info('✅ Todos los campos de comprador existen en tabla sales.');
      }
    } catch (error: any) {
      logger.error('❌ Error verificando campos de sales:', error.message);
    }

    logger.info('\n✅ Verificación completada exitosamente.');
  } catch (error: any) {
    logger.error('❌ Proceso falló:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyPurchaseLogMigration().catch((e) => {
  logger.error('❌ Proceso falló:', e);
  process.exit(1);
});

