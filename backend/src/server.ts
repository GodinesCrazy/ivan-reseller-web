import app from './app';
import { env } from './config/env';
import { prisma, connectWithRetry } from './config/database';
import { redis, isRedisAvailable } from './config/redis';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scheduledTasksService } from './services/scheduled-tasks.service';
import bcrypt from 'bcryptjs';

const execAsync = promisify(exec);
const PORT = parseInt(env.PORT, 10);

async function ensureAdminUser() {
  try {
    // Verificar si existe el usuario admin
    const adminExists = await prisma.user.findUnique({
      where: { username: 'admin' },
    });

    if (!adminExists) {
      console.log('👤 Usuario admin no encontrado. Creando...');
      const adminPassword = await bcrypt.hash('admin123', 10);
      
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@ivanreseller.com',
          password: adminPassword,
          role: 'ADMIN',
          commissionRate: 0.15,
          fixedMonthlyCost: 17.0,
          balance: 0,
          totalEarnings: 0,
          isActive: true,
        },
      });
      
      console.log('✅ Usuario admin creado exitosamente');
      console.log('   Usuario: admin');
      console.log('   Contraseña: admin123');
    } else {
      console.log('✅ Usuario admin ya existe');
    }
  } catch (error) {
    console.error('⚠️  Error al verificar/crear usuario admin:', error);
  }
}

async function runMigrations(maxRetries = 3): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`🔄 Running database migrations... (attempt ${attempt + 1}/${maxRetries})`);
      console.log(`   DATABASE_URL: ${env.DATABASE_URL ? '✅ Configurada' : '❌ No configurada'}`);
      
      const migrateResult = await execAsync('npx prisma migrate deploy', {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      // Verificar si realmente se ejecutaron las migraciones
      if (migrateResult.stdout) {
        console.log('   Migration output:', migrateResult.stdout.substring(0, 300));
      }
      if (migrateResult.stderr && !migrateResult.stderr.includes('Tip:')) {
        console.log('   Migration warnings:', migrateResult.stderr.substring(0, 200));
      }
      
      // Verificar que las tablas existan después de las migraciones
      try {
        const tablesResult = await prisma.$queryRaw<Array<{tablename: string}>>`
          SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'User');
        `;
        if (tablesResult.length === 0) {
          console.log('⚠️  No se encontraron tablas después de las migraciones');
          console.log('   Intentando usar prisma db push como alternativa...');
          await execAsync('npx prisma db push --accept-data-loss', {
            maxBuffer: 10 * 1024 * 1024,
          });
          console.log('✅ Schema aplicado con db push');
        } else {
          console.log(`✅ Tablas encontradas: ${tablesResult.map(t => t.tablename).join(', ')}`);
        }
      } catch (verifyError) {
        console.log('⚠️  No se pudo verificar tablas, pero continuando...');
      }
      
      console.log('✅ Migrations completed');
      
      // Intentar ejecutar seed completo
      if (env.NODE_ENV === 'production') {
        try {
          console.log('🌱 Seeding database...');
          await execAsync('npx tsx prisma/seed.ts');
          console.log('✅ Database seeded');
        } catch (seedError: any) {
          console.log('ℹ️  Seed completo falló, verificando usuario admin...');
          console.log(`   Error: ${seedError.message?.substring(0, 100)}`);
          // Aunque el seed falle, verificamos que el admin exista
          await ensureAdminUser();
        }
      }
      
      return; // Éxito, salir de la función
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isAuthError = error.message?.includes('P1000') || 
                         error.message?.includes('Authentication failed') ||
                         error.stderr?.includes('P1000') ||
                         error.stderr?.includes('Authentication failed');
      
      if (isAuthError) {
        console.error(`⚠️  Migration error (attempt ${attempt + 1}/${maxRetries}):`);
        console.error(`   ${error.message || error.stderr || 'Unknown error'}`);
        
        if (isLastAttempt) {
          console.error('');
          console.error('❌ ERROR DE AUTENTICACIÓN PERSISTENTE:');
          console.error('   - Verifica que DATABASE_URL esté correctamente configurada en Railway');
          console.error('   - Verifica que las credenciales de PostgreSQL sean correctas');
          console.error('   - Asegúrate de que los servicios Postgres y ivan-reseller-web estén conectados');
          console.error('');
          throw error;
        } else {
          console.log(`   Reintentando en 3 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        // Si no es error de autenticación, lanzar inmediatamente
        throw error;
      }
    }
  }
}

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor...');
    console.log(`📦 Environment: ${env.NODE_ENV}`);
    console.log(`🔌 Port: ${PORT}`);
    
    // Run migrations before connecting
    console.log('🔄 Ejecutando migraciones...');
    await runMigrations();
    
    // Test database connection with retry
    console.log('🔌 Conectando a la base de datos...');
    try {
      await connectWithRetry(5, 2000);
    } catch (dbError: any) {
      console.error('❌ ERROR DE CONEXIÓN A LA BASE DE DATOS:');
      console.error(`   Mensaje: ${dbError.message}`);
      
      // Mostrar información detallada del error
      if (dbError.message?.includes('P1000') || dbError.message?.includes('Authentication failed')) {
        console.error('');
        console.error('🔧 ERROR DE AUTENTICACIÓN DETECTADO:');
        console.error('   Esto indica que las credenciales de PostgreSQL no son válidas.');
        console.error('');
        console.error('📋 VERIFICACIÓN:');
        console.error(`   DATABASE_URL configurada: ${env.DATABASE_URL ? '✅ Sí' : '❌ No'}`);
        if (env.DATABASE_URL) {
          try {
            const url = new URL(env.DATABASE_URL);
            console.error(`   Host: ${url.hostname}`);
            console.error(`   Port: ${url.port || '5432'}`);
            console.error(`   Database: ${url.pathname.replace('/', '')}`);
            console.error(`   User: ${url.username}`);
          } catch (e) {
            console.error('   ⚠️  No se pudo parsear DATABASE_URL');
          }
        }
        console.error('');
        console.error('🔧 SOLUCIÓN AUTOMÁTICA:');
        console.error('   El código intentará múltiples formas de obtener DATABASE_URL.');
        console.error('   Si el problema persiste, verifica las variables en Railway.');
        console.error('');
      }
      throw dbError;
    }
    
    // Asegurar que el usuario admin existe (verificación final)
    // No bloqueamos el inicio del servidor si esto falla
    console.log('👤 Verificando usuario admin...');
    ensureAdminUser().catch((error) => {
      console.error('⚠️  Warning: No se pudo verificar/crear usuario admin:', error.message);
      console.log('⚠️  El servidor continuará iniciando. El usuario admin puede no existir.');
    });

    // Test Redis connection (only if configured)
    if (isRedisAvailable) {
      console.log('🔌 Conectando a Redis...');
      await redis.ping();
      console.log('✅ Redis connected');
    } else {
      console.log('⚠️  Redis no configurado, continuando sin Redis');
    }

    // Start server
    console.log('🌐 Iniciando servidor HTTP...');
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🚀 Ivan Reseller API Server');
      console.log('================================');
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log('================================');
      console.log('');
      console.log('✅ Scheduled tasks initialized');
      console.log('  - Financial alerts: Daily at 6:00 AM');
      console.log('  - Commission processing: Daily at 2:00 AM');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await scheduledTasksService.shutdown();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await scheduledTasksService.shutdown();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

startServer();
