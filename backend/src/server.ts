import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { redis, isRedisAvailable } from './config/redis';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scheduledTasksService } from './services/scheduled-tasks.service';
import bcrypt from 'bcrypt';

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

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    await execAsync('npx prisma migrate deploy');
    console.log('✅ Migrations completed');
    
    // Intentar ejecutar seed completo
    if (env.NODE_ENV === 'production') {
      try {
        console.log('🌱 Seeding database...');
        await execAsync('npx tsx prisma/seed.ts');
        console.log('✅ Database seeded');
      } catch (seedError) {
        console.log('ℹ️  Seed completo falló, verificando usuario admin...');
        // Aunque el seed falle, verificamos que el admin exista
        await ensureAdminUser();
      }
    }
  } catch (error) {
    console.error('⚠️  Migration warning:', error);
  }
}

async function startServer() {
  try {
    // Run migrations before connecting
    await runMigrations();
    
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');
    
    // Asegurar que el usuario admin existe (verificación final)
    await ensureAdminUser();

    // Test Redis connection (only if configured)
    if (isRedisAvailable) {
      await redis.ping();
      console.log('✅ Redis connected');
    }

    // Start server
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
