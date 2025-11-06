import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Debug: Mostrar información sobre DATABASE_URL antes de validar
function getDatabaseUrl(): string {
  // Intentar múltiples nombres de variables comunes en Railway
  const dbUrl = 
    process.env.DATABASE_URL || 
    process.env.POSTGRES_URL || 
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_PRISMA_URL ||
    process.env.PGDATABASE ||
    '';

  if (dbUrl) {
    // Mostrar información de debugging (sin mostrar la contraseña completa)
    const url = new URL(dbUrl);
    const maskedPassword = url.password ? 
      (url.password.substring(0, 4) + '***' + url.password.substring(url.password.length - 4)) : 
      '***';
    const maskedUrl = `${url.protocol}//${url.username}:${maskedPassword}@${url.host}${url.pathname}`;
    
    console.log('🔍 DATABASE_URL encontrada:');
    console.log(`   ${maskedUrl}`);
    console.log(`   Host: ${url.hostname}`);
    console.log(`   Port: ${url.port || '5432'}`);
    console.log(`   Database: ${url.pathname.replace('/', '')}`);
  } else {
    console.error('❌ ERROR: DATABASE_URL no encontrada');
    console.error('   Variables disponibles:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES')));
  }

  return dbUrl;
}

const databaseUrl = getDatabaseUrl();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  API_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url().refine(
    (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
    { message: 'DATABASE_URL must start with postgresql:// or postgres://' }
  ),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Optional external APIs
  EBAY_APP_ID: z.string().optional(),
  EBAY_DEV_ID: z.string().optional(),
  EBAY_CERT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  GROQ_API_KEY: z.string().optional(),
  SCRAPERAPI_KEY: z.string().optional(),
});

// Asegurar que DATABASE_URL esté en process.env
if (!process.env.DATABASE_URL && databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

export const env = envSchema.parse(process.env);

export default env;
