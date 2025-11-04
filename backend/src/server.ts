import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { redis, isRedisAvailable } from './config/redis';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PORT = parseInt(env.PORT, 10);

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    await execAsync('npx prisma migrate deploy');
    console.log('✅ Migrations completed');
    
    // Only seed in production on first deploy
    if (env.NODE_ENV === 'production') {
      try {
        console.log('🌱 Seeding database...');
        await execAsync('npx tsx prisma/seed.ts');
        console.log('✅ Database seeded');
      } catch (seedError) {
        console.log('ℹ️  Seed skipped (database may already have data)');
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
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

startServer();
