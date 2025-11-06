import { PrismaClient } from '@prisma/client';

// Singleton Prisma Client
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Configuración mejorada de Prisma Client con manejo de errores
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    errorFormat: 'pretty',
  });

// Función para verificar conexión con reintentos
export async function connectWithRetry(maxRetries = 5, delay = 2000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
      return;
    } catch (error: any) {
      const isLastAttempt = i === maxRetries - 1;
      
      if (isLastAttempt) {
        console.error(`❌ Database connection failed after ${maxRetries} attempts`);
        throw error;
      }
      
      console.log(`⚠️  Database connection attempt ${i + 1}/${maxRetries} failed, retrying in ${delay}ms...`);
      console.log(`   Error: ${error.message?.substring(0, 100)}`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
