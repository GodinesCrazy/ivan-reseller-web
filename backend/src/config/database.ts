import { PrismaClient } from '@prisma/client';

/**
 * Optional pool cap for direct PostgreSQL URLs (avoids "too many clients" on shared DBs).
 * Set PRISMA_CONNECTION_LIMIT=10 in production if needed. Ignored for Prisma Accelerate URLs.
 */
function getEffectiveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const limit = process.env.PRISMA_CONNECTION_LIMIT?.trim();
  if (!limit) return url;
  if (/connection_limit=/i.test(url)) return url;
  if (url.startsWith('prisma+') || url.toLowerCase().includes('accelerate')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${encodeURIComponent(limit)}`;
}

// Singleton Prisma Client
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Configuración mejorada de Prisma Client con manejo de errores
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: getEffectiveDatabaseUrl(),
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
