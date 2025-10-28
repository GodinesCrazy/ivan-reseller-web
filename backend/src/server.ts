import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';

const PORT = parseInt(env.PORT, 10);

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Test Redis connection
    await redis.ping();
    console.log('✅ Redis connected');

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
